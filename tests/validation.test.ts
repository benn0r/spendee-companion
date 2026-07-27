import assert from "node:assert/strict";
import test from "node:test";
import { compareValidationTransactions, validationDateRange } from "../lib/validation-diff";
import { requestExtraction } from "../lib/openai-validation";

test("validation diff matches transactions one-to-one and keeps both missing sides", () => {
  const document = [
    { date: "2026-07-02", description: "Dragon feed", amount: -30, currency: "chf" },
    { date: "2026-07-01", description: "Nebula lunch", amount: -24, currency: "CHF" },
    { date: "2026-07-01", description: "Duplicate statement line", amount: -24, currency: "CHF" },
  ];
  const app = [
    { id: 1, date: "2026-07-01T08:00:00.000Z", wallet: "Moon Purse", type: "Expense", categoryName: "Food", amount: -24, currency: "CHF", note: "different label" },
    { id: 2, date: "2026-07-03T08:00:00.000Z", wallet: "Moon Purse", type: "Expense", categoryName: "Travel", amount: -9, currency: "CHF", note: "Portal toll" },
  ];
  const result = compareValidationTransactions(document, app);
  assert.equal(result.matching.length, 1);
  assert.equal(result.matching[0].app.id, 1);
  assert.deepEqual(result.missingInApp.map((item) => item.description), ["Dragon feed", "Duplicate statement line"]);
  assert.deepEqual(result.missingInDocument.map((item) => item.id), [2]);
  assert.deepEqual(validationDateRange(document), { dateFrom: "2026-07-01", dateTo: "2026-07-02" });
  assert.throws(() => validationDateRange([]), /does not contain any transactions/);
});

test("OpenAI extraction retries an HTML upstream response and accepts the following JSON response", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) return new Response("<!DOCTYPE html><title>Bad gateway</title>", {
      status: 502, headers: { "Content-Type": "text/html" },
    });
    return Response.json({ output_text: "{}" });
  };
  try {
    const payload = await requestExtraction("fantasy-key", {}, async () => undefined) as { output_text: string };
    assert.equal(payload.output_text, "{}");
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
