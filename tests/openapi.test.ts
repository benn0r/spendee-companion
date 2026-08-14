import assert from "node:assert/strict";
import test from "node:test";
import { openApiDocument } from "../lib/openapi";

test("OpenAPI document describes the supported mobile and receipt API", async () => {
  const route = await import("../app/api/openapi/route");
  const response = route.GET();
  const document = (await response.json()) as typeof openApiDocument;

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(document.openapi, "3.0.3");
  assert.deepEqual(Object.keys(document.paths).sort(), [
    "/api/receipts",
    "/api/receipts/{id}",
    "/api/receipts/{id}/file",
    "/api/receipts/{id}/submit",
    "/api/references",
    "/api/transactions",
    "/api/transactions/{id}",
  ]);
  assert.deepEqual(document.security, [{ bearerAuth: [] }, { basicAuth: [] }]);
  assert.equal(
    document.paths["/api/receipts"].post.requestBody.content[
      "multipart/form-data"
    ].schema.properties.receipt.format,
    "binary",
  );
  assert.equal(
    document.paths["/api/transactions"].post.requestBody.content[
      "application/json"
    ].schema.$ref,
    "#/components/schemas/TransactionInput",
  );
  assert.doesNotMatch(JSON.stringify(document), /password|session.?token/i);
});
