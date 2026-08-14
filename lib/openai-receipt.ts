import { requestExtraction } from "./openai-validation";
import type { LedgerSnapshot } from "./ledger-service";
import type { ReceiptSuggestion } from "./receipt-types";

export const receiptModel =
  process.env.OPENAI_RECEIPT_MODEL ||
  process.env.OPENAI_VALIDATION_MODEL ||
  "gpt-5.6-sol";

const receiptSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "merchant",
    "date",
    "amount",
    "currency",
    "category",
    "notes",
    "tags",
    "items",
    "splits",
    "confidence",
  ],
  properties: {
    merchant: { type: "string" },
    date: { type: "string", description: "ISO calendar date YYYY-MM-DD" },
    amount: { type: "number", description: "Negative expense amount" },
    currency: { type: "string", description: "Three-letter ISO currency" },
    category: { type: "string", description: "Exact Actual category ID" },
    notes: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "description",
          "quantity",
          "unitAmount",
          "totalAmount",
          "category",
        ],
        properties: {
          description: { type: "string" },
          quantity: { type: "number" },
          unitAmount: { type: "number" },
          totalAmount: { type: "number" },
          category: { type: "string", description: "Exact Actual category ID" },
        },
      },
    },
    splits: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["category", "amount", "notes", "tags"],
        properties: {
          category: { type: "string", description: "Exact Actual category ID" },
          amount: { type: "number" },
          notes: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
      },
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
} as const;

function responseText(payload: any): string | undefined {
  if (typeof payload.output_text === "string") return payload.output_text;
  for (const output of payload.output ?? []) {
    for (const content of output.content ?? []) {
      if (typeof content.text === "string") return content.text;
    }
  }
  return undefined;
}

function validateSuggestion(value: unknown): ReceiptSuggestion {
  if (!value || typeof value !== "object")
    throw new Error("OpenAI returned an invalid receipt suggestion.");
  const suggestion = value as ReceiptSuggestion;
  const validMoney = (amount: number) => Number.isFinite(amount);
  if (
    !suggestion.merchant?.trim() ||
    !/^\d{4}-\d{2}-\d{2}$/.test(suggestion.date) ||
    !validMoney(suggestion.amount) ||
    suggestion.amount >= 0 ||
    !/^[A-Z]{3}$/.test(suggestion.currency) ||
    !suggestion.category?.trim() ||
    typeof suggestion.notes !== "string" ||
    !Array.isArray(suggestion.tags) ||
    !Array.isArray(suggestion.items) ||
    !Array.isArray(suggestion.splits) ||
    !Number.isFinite(suggestion.confidence) ||
    suggestion.confidence < 0 ||
    suggestion.confidence > 1
  ) {
    throw new Error("OpenAI returned an invalid receipt suggestion.");
  }
  for (const item of suggestion.items) {
    if (
      !item.description?.trim() ||
      !validMoney(item.quantity) ||
      !validMoney(item.unitAmount) ||
      !validMoney(item.totalAmount) ||
      !item.category?.trim()
    ) {
      throw new Error("OpenAI returned an invalid receipt line item.");
    }
  }
  for (const split of suggestion.splits) {
    if (
      !split.category?.trim() ||
      !validMoney(split.amount) ||
      split.amount >= 0 ||
      typeof split.notes !== "string" ||
      !Array.isArray(split.tags)
    ) {
      throw new Error("OpenAI returned an invalid receipt split.");
    }
  }
  if (
    suggestion.splits.length &&
    Math.round(
      suggestion.splits.reduce((sum, split) => sum + split.amount, 0) * 100,
    ) !== Math.round(suggestion.amount * 100)
  ) {
    throw new Error("Receipt split amounts do not match the total.");
  }
  return suggestion;
}

export function ensureMerchantTags(
  suggestion: ReceiptSuggestion,
  tags: Array<{ id: string; name: string }>,
): ReceiptSuggestion {
  const merchant = suggestion.merchant.trim().toLocaleLowerCase();
  const selected = new Set(suggestion.tags);
  for (const tag of tags) {
    const name = tag.name.trim().toLocaleLowerCase();
    if (name && merchant.includes(name)) selected.add(tag.id);
  }
  return { ...suggestion, tags: [...selected] };
}

export async function extractReceiptSuggestion(
  file: Buffer,
  filename: string,
  mimeType: string,
  snapshot: LedgerSnapshot,
): Promise<ReceiptSuggestion> {
  if (process.env.OPENAI_RECEIPT_MOCK) {
    return ensureMerchantTags(
      validateSuggestion(JSON.parse(process.env.OPENAI_RECEIPT_MOCK)),
      snapshot.tags,
    );
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  const context = JSON.stringify({
    currency: snapshot.currency,
    categories: snapshot.categories.map(({ id, name }) => ({ id, name })),
    tags: snapshot.tags.map(({ id, name }) => ({ id, name })),
  });
  const fileData = `data:${mimeType};base64,${file.toString("base64")}`;
  const inputFile =
    mimeType === "application/pdf"
      ? { type: "input_file", filename, file_data: fileData }
      : { type: "input_image", image_url: fileData, detail: "high" };
  const payload = await requestExtraction(apiKey, {
    model: receiptModel,
    reasoning: { effort: "low" },
    instructions:
      "Read the receipt accurately. Extract every line item. Use negative decimal amounts for the expense. Use exact category and tag IDs from the supplied Actual Budget context, never names or invented IDs. Leave the payee decision to the reviewer. Return splits only when the receipt clearly spans multiple categories, and make their amounts add exactly to the parent amount.",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Extract a suggested transaction from this receipt. Actual Budget references: ${context}`,
          },
          inputFile,
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "receipt_suggestion",
        strict: true,
        schema: receiptSchema,
      },
    },
  });
  const text = responseText(payload);
  if (!text) throw new Error("OpenAI returned no receipt suggestion.");
  return ensureMerchantTags(
    validateSuggestion(JSON.parse(text)),
    snapshot.tags,
  );
}
