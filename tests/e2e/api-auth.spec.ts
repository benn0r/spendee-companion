import { expect, test } from "./fixture";

test("every API endpoint requires the bearer API key", async ({ baseURL }) => {
  for (const path of ["/api/health", "/api/ready", "/api/openapi"]) {
    const url = new URL(path, baseURL);
    const rejected = await fetch(url);
    expect(rejected.status, path).toBe(401);
    expect(rejected.headers.get("www-authenticate"), path).toBe(
      'Bearer realm="Spendee API"',
    );

    const accepted = await fetch(url, {
      headers: { Authorization: "Bearer fantasy-e2e-api-key" },
    });
    expect(accepted.ok, path).toBe(true);
  }
});
