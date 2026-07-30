import type { ExtractedDocument } from "./validation-types";

export const validationModel =
  process.env.OPENAI_VALIDATION_MODEL || "gpt-5.6-sol";
const retryableStatuses = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

const extractionSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "printDate",
    "issuer",
    "accountReference",
    "documentCurrency",
    "metadata",
    "transactions",
  ],
  properties: {
    title: { type: "string" },
    printDate: {
      type: ["string", "null"],
      description: "ISO date YYYY-MM-DD when present",
    },
    issuer: { type: ["string", "null"] },
    accountReference: { type: ["string", "null"] },
    documentCurrency: { type: ["string", "null"] },
    metadata: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "value"],
        properties: { key: { type: "string" }, value: { type: "string" } },
      },
    },
    transactions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "description", "amount", "currency"],
        properties: {
          date: { type: "string", description: "ISO calendar date YYYY-MM-DD" },
          description: { type: "string" },
          amount: {
            type: "number",
            description:
              "Signed amount: expenses negative, credits/payments positive",
          },
          currency: {
            type: "string",
            description: "Three-letter ISO currency",
          },
        },
      },
    },
  },
} as const;

function responseText(payload: any): string | undefined {
  // Support both the Responses API convenience field and its canonical nested
  // content shape; mocks and SDK/API versions may provide either representation.
  if (typeof payload.output_text === "string") return payload.output_text;
  for (const output of payload.output ?? []) {
    for (const content of output.content ?? []) {
      if (typeof content.text === "string") return content.text;
    }
  }
  return undefined;
}

export async function requestExtraction(
  apiKey: string,
  requestBody: unknown,
  pause: (milliseconds: number) => Promise<unknown> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
) {
  let lastError = "OpenAI extraction failed.";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });
      const contentType =
        response.headers.get("content-type") || "unknown content type";
      const responseBody = await response.text();
      let payload: any;
      try {
        payload = JSON.parse(responseBody);
      } catch {
        lastError = `OpenAI returned an unexpected non-JSON response (HTTP ${response.status}, ${contentType}).`;
        if (attempt < 2) {
          await pause(500 * (attempt + 1));
          continue;
        }
        throw new Error(lastError);
      }
      if (response.ok) return payload;
      lastError =
        payload.error?.message ||
        `OpenAI extraction failed (${response.status}).`;
      if (retryableStatuses.has(response.status) && attempt < 2) {
        await pause(500 * (attempt + 1));
        continue;
      }
      throw new Error(lastError);
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
      if (
        attempt < 2 &&
        /fetch failed|network|socket|ECONNRESET/i.test(lastError)
      ) {
        await pause(500 * (attempt + 1));
        continue;
      }
      throw error;
    }
  }
  throw new Error(lastError);
}

function validateExtraction(value: unknown): ExtractedDocument {
  if (!value || typeof value !== "object")
    throw new Error("OpenAI returned an invalid extraction.");
  const candidate = value as ExtractedDocument & {
    metadata: Record<string, string> | Array<{ key: string; value: string }>;
  };
  if (
    !candidate.title?.trim() ||
    !Array.isArray(candidate.transactions) ||
    !candidate.metadata ||
    typeof candidate.metadata !== "object"
  ) {
    throw new Error("OpenAI returned incomplete document metadata.");
  }
  const document: ExtractedDocument = {
    ...candidate,
    metadata: Array.isArray(candidate.metadata)
      ? Object.fromEntries(
          candidate.metadata.map((item) => [item.key, item.value]),
        )
      : candidate.metadata,
  };
  for (const transaction of document.transactions) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(transaction.date) ||
      !transaction.description?.trim() ||
      !Number.isFinite(transaction.amount) ||
      !/^[A-Z]{3}$/.test(transaction.currency)
    ) {
      throw new Error("OpenAI returned an invalid transaction.");
    }
  }
  return document;
}

export async function extractValidationDocument(
  pdf: Buffer,
  filename: string,
): Promise<{
  document: ExtractedDocument;
  rawResponse: unknown;
}> {
  if (process.env.OPENAI_VALIDATION_MOCK) {
    const mock = JSON.parse(process.env.OPENAI_VALIDATION_MOCK);
    return {
      document: validateExtraction(mock),
      rawResponse: { mocked: true, output: mock },
    };
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

  const payload = await requestExtraction(apiKey, {
    model: validationModel,
    reasoning: { effort: "low" },
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_file",
            filename,
            file_data: `data:application/pdf;base64,${pdf.toString("base64")}`,
          },
          {
            type: "input_text",
            text: "Extract statement metadata and every posted transaction. Exclude balances, subtotals, interest summaries, limits, and payment instructions. Use the transaction/posting date. Normalize expenses and purchases as negative amounts; refunds, credits, and payments into the account as positive. Preserve each transaction occurrence separately.",
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "statement_transactions",
        strict: true,
        schema: extractionSchema,
      },
    },
  });
  const text = responseText(payload);
  if (!text) throw new Error("OpenAI returned no structured extraction.");
  return {
    document: validateExtraction(JSON.parse(text)),
    rawResponse: payload,
  };
}
