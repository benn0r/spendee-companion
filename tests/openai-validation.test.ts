import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  extractValidationDocument,
  requestExtraction,
  validationModel,
} from "../lib/openai-validation";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.OPENAI_API_KEY;
const originalMock = process.env.OPENAI_VALIDATION_MOCK;

function restoreEnvironmentVariable(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  restoreEnvironmentVariable("OPENAI_API_KEY", originalApiKey);
  restoreEnvironmentVariable("OPENAI_VALIDATION_MOCK", originalMock);
});

const extractedDocument = {
  title: "Crystal Bank statement",
  printDate: "2026-07-14",
  issuer: "Crystal Bank",
  accountReference: "moon-42",
  documentCurrency: "CHF",
  metadata: [{ key: "period", value: "July 2026" }],
  transactions: [
    {
      date: "2026-07-01",
      description: "Potion supplies",
      amount: -18.5,
      currency: "CHF",
    },
  ],
};

test("mocked extraction validates data, normalizes metadata, and preserves the raw response", async () => {
  process.env.OPENAI_VALIDATION_MOCK = JSON.stringify(extractedDocument);

  const result = await extractValidationDocument(
    Buffer.from("fantasy-pdf"),
    "statement.pdf",
  );

  assert.deepEqual(result.document.metadata, { period: "July 2026" });
  assert.deepEqual(
    result.document.transactions,
    extractedDocument.transactions,
  );
  assert.deepEqual(result.rawResponse, {
    mocked: true,
    output: extractedDocument,
  });
});

test("extraction rejects incomplete metadata and malformed transactions", async (t) => {
  const invalidDocuments = [
    { value: null, message: /invalid extraction/ },
    {
      value: { ...extractedDocument, title: "" },
      message: /incomplete document metadata/,
    },
    {
      value: { ...extractedDocument, metadata: null },
      message: /incomplete document metadata/,
    },
    {
      value: {
        ...extractedDocument,
        transactions: [
          { ...extractedDocument.transactions[0], date: "07/01/2026" },
        ],
      },
      message: /invalid transaction/,
    },
    {
      value: {
        ...extractedDocument,
        transactions: [
          { ...extractedDocument.transactions[0], description: "  " },
        ],
      },
      message: /invalid transaction/,
    },
    {
      value: {
        ...extractedDocument,
        transactions: [{ ...extractedDocument.transactions[0], amount: null }],
      },
      message: /invalid transaction/,
    },
    {
      value: {
        ...extractedDocument,
        transactions: [
          { ...extractedDocument.transactions[0], currency: "chf" },
        ],
      },
      message: /invalid transaction/,
    },
  ];

  for (const [index, invalid] of invalidDocuments.entries()) {
    await t.test(`invalid extraction ${index + 1}`, async () => {
      process.env.OPENAI_VALIDATION_MOCK = JSON.stringify(invalid.value);
      await assert.rejects(
        () =>
          extractValidationDocument(
            Buffer.from("fantasy-pdf"),
            "statement.pdf",
          ),
        invalid.message,
      );
    });
  }
});

test("live extraction sends the PDF schema request and accepts nested response text", async () => {
  delete process.env.OPENAI_VALIDATION_MOCK;
  process.env.OPENAI_API_KEY = "fantasy-api-key";
  let requestBody: Record<string, any> | undefined;

  globalThis.fetch = async (_url, init) => {
    assert.equal(
      (init?.headers as Record<string, string>).Authorization,
      "Bearer fantasy-api-key",
    );
    requestBody = JSON.parse(String(init?.body));
    return Response.json({
      output: [
        {
          content: [
            { type: "output_text", text: JSON.stringify(extractedDocument) },
          ],
        },
      ],
    });
  };

  const result = await extractValidationDocument(
    Buffer.from("%PDF-fantasy"),
    "crystal-statement.pdf",
  );

  assert.equal(requestBody?.model, validationModel);
  assert.equal(
    requestBody?.input[0].content[0].filename,
    "crystal-statement.pdf",
  );
  assert.match(
    requestBody?.input[0].content[0].file_data,
    /^data:application\/pdf;base64,/,
  );
  assert.equal(requestBody?.text.format.strict, true);
  assert.deepEqual(result.document.metadata, { period: "July 2026" });
  assert.deepEqual(result.rawResponse, {
    output: [
      {
        content: [
          { type: "output_text", text: JSON.stringify(extractedDocument) },
        ],
      },
    ],
  });
});

test("live extraction reports missing configuration and missing structured output", async () => {
  delete process.env.OPENAI_VALIDATION_MOCK;
  delete process.env.OPENAI_API_KEY;
  await assert.rejects(
    () =>
      extractValidationDocument(Buffer.from("%PDF-fantasy"), "statement.pdf"),
    /OPENAI_API_KEY is not configured/,
  );

  process.env.OPENAI_API_KEY = "fantasy-api-key";
  globalThis.fetch = async () => Response.json({ output: [] });
  await assert.rejects(
    () =>
      extractValidationDocument(Buffer.from("%PDF-fantasy"), "statement.pdf"),
    /no structured extraction/,
  );
});

test("OpenAI requests retry transient failures but preserve final upstream errors", async (t) => {
  await t.test("HTML gateway followed by success", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      if (calls === 1)
        return new Response("<!DOCTYPE html><title>Bad gateway</title>", {
          status: 502,
          headers: { "Content-Type": "text/html" },
        });
      return Response.json({ output_text: "{}" });
    };

    const payload = (await requestExtraction(
      "fantasy-api-key",
      {},
      async () => undefined,
    )) as { output_text: string };
    assert.equal(payload.output_text, "{}");
    assert.equal(calls, 2);
  });

  await t.test("retryable HTTP status", async () => {
    const pauses: number[] = [];
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      if (calls === 1)
        return Response.json(
          { error: { message: "Rate limited" } },
          { status: 429 },
        );
      return Response.json({ output_text: "{}" });
    };

    const payload = (await requestExtraction(
      "fantasy-api-key",
      {},
      async (milliseconds) => {
        pauses.push(milliseconds);
      },
    )) as { output_text: string };
    assert.equal(payload.output_text, "{}");
    assert.equal(calls, 2);
    assert.deepEqual(pauses, [500]);
  });

  await t.test("network failure", async () => {
    const pauses: number[] = [];
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      if (calls === 1) throw new Error("socket disconnected");
      return Response.json({ output_text: "{}" });
    };

    await requestExtraction("fantasy-api-key", {}, async (milliseconds) => {
      pauses.push(milliseconds);
    });
    assert.equal(calls, 2);
    assert.deepEqual(pauses, [500]);
  });

  await t.test("non-retryable status", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return Response.json(
        { error: { message: "Invalid API key" } },
        { status: 401 },
      );
    };

    await assert.rejects(
      () => requestExtraction("fantasy-api-key", {}, async () => undefined),
      /Invalid API key/,
    );
    assert.equal(calls, 1);
  });

  await t.test("repeated non-JSON response", async () => {
    const pauses: number[] = [];
    globalThis.fetch = async () =>
      new Response("<html>Gateway</html>", {
        status: 502,
        headers: { "Content-Type": "text/html" },
      });

    await assert.rejects(
      () =>
        requestExtraction("fantasy-api-key", {}, async (milliseconds) => {
          pauses.push(milliseconds);
        }),
      /unexpected non-JSON response \(HTTP 502, text\/html\)/,
    );
    assert.deepEqual(pauses, [500, 1000]);
  });
});
