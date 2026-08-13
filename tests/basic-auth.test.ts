import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import {
  evaluateBasicAuth,
  getBasicAuthRejection,
  isBasicAuthBypassPath,
  type BasicAuthEnvironment,
} from "../lib/basic-auth";
import { proxy } from "../proxy";

const configuredEnvironment: BasicAuthEnvironment = {
  SPENDEE_BASIC_AUTH_USERNAME: "fantasy-user",
  SPENDEE_BASIC_AUTH_PASSWORD: "fantasy:password",
};

function authorization(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

test("Basic Auth is disabled only when both settings are absent", () => {
  assert.equal(evaluateBasicAuth(null, {}), "disabled");
  assert.equal(
    evaluateBasicAuth(null, { SPENDEE_BASIC_AUTH_USERNAME: "fantasy-user" }),
    "misconfigured",
  );
  assert.equal(
    evaluateBasicAuth(null, {
      SPENDEE_BASIC_AUTH_PASSWORD: "fantasy-password",
    }),
    "misconfigured",
  );
  assert.equal(
    evaluateBasicAuth(null, {
      SPENDEE_BASIC_AUTH_USERNAME: "invalid:user",
      SPENDEE_BASIC_AUTH_PASSWORD: "fantasy-password",
    }),
    "misconfigured",
  );
});

test("Basic Auth validates a complete UTF-8 credential pair", () => {
  assert.equal(
    evaluateBasicAuth(
      authorization("fantasy-user", "fantasy:password"),
      configuredEnvironment,
    ),
    "authorized",
  );
  assert.equal(
    evaluateBasicAuth(
      authorization("wrong-user", "fantasy:password"),
      configuredEnvironment,
    ),
    "unauthorized",
  );
  assert.equal(
    evaluateBasicAuth(
      authorization("fantasy-user", "wrong-password"),
      configuredEnvironment,
    ),
    "unauthorized",
  );
  assert.equal(
    evaluateBasicAuth("Bearer fantasy-token", configuredEnvironment),
    "unauthorized",
  );
  assert.equal(
    evaluateBasicAuth("Basic !!!", configuredEnvironment),
    "unauthorized",
  );
});

test("readiness and static assets bypass authentication", () => {
  for (const pathname of [
    "/api/ready",
    "/_next/static/chunks/app.js",
    "/_next/image",
    "/category-icons/cat_1.svg",
    "/favicon-32.png",
    "/icon.png",
  ]) {
    assert.equal(isBasicAuthBypassPath(pathname), true, pathname);
    assert.equal(
      getBasicAuthRejection(pathname, null, configuredEnvironment),
      null,
      pathname,
    );
  }

  for (const pathname of [
    "/",
    "/api/transactions",
    "/api/ready/details",
    "/mcp",
    "/_next/data/build/index.json",
  ]) {
    assert.equal(isBasicAuthBypassPath(pathname), false, pathname);
  }
});

test("protected routes challenge missing or invalid credentials", async () => {
  const missing = getBasicAuthRejection(
    "/api/transactions",
    null,
    configuredEnvironment,
  );
  assert.ok(missing);
  assert.equal(missing.status, 401);
  assert.equal(
    missing.headers.get("www-authenticate"),
    'Basic realm="Spendee", charset="UTF-8"',
  );
  assert.equal(missing.headers.get("cache-control"), "no-store");
  assert.equal(await missing.text(), "Authentication required.");

  assert.equal(
    getBasicAuthRejection(
      "/mcp",
      authorization("fantasy-user", "fantasy:password"),
      configuredEnvironment,
    ),
    null,
  );
});

test("a partial deployment configuration fails closed but keeps readiness public", async () => {
  const partialEnvironment = {
    SPENDEE_BASIC_AUTH_USERNAME: "fantasy-user",
  };
  const response = getBasicAuthRejection("/", null, partialEnvironment);
  assert.ok(response);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("www-authenticate"), null);
  assert.equal(
    await response.text(),
    "HTTP Basic Authentication is not configured correctly.",
  );
  assert.equal(
    getBasicAuthRejection("/api/ready", null, partialEnvironment),
    null,
  );
});

test("the Next.js proxy applies the guard at the request boundary", () => {
  const previousUsername = process.env.SPENDEE_BASIC_AUTH_USERNAME;
  const previousPassword = process.env.SPENDEE_BASIC_AUTH_PASSWORD;

  try {
    process.env.SPENDEE_BASIC_AUTH_USERNAME = "fantasy-user";
    process.env.SPENDEE_BASIC_AUTH_PASSWORD = "fantasy:password";

    const rejected = proxy(new NextRequest("https://spendee.example.test/mcp"));
    assert.equal(rejected.status, 401);

    const accepted = proxy(
      new NextRequest("https://spendee.example.test/mcp", {
        headers: {
          authorization: authorization("fantasy-user", "fantasy:password"),
        },
      }),
    );
    assert.equal(accepted.status, 200);
    assert.equal(accepted.headers.get("x-middleware-next"), "1");

    const readiness = proxy(
      new NextRequest("https://spendee.example.test/api/ready"),
    );
    assert.equal(readiness.status, 200);
    assert.equal(readiness.headers.get("x-middleware-next"), "1");
  } finally {
    if (previousUsername === undefined)
      delete process.env.SPENDEE_BASIC_AUTH_USERNAME;
    else process.env.SPENDEE_BASIC_AUTH_USERNAME = previousUsername;
    if (previousPassword === undefined)
      delete process.env.SPENDEE_BASIC_AUTH_PASSWORD;
    else process.env.SPENDEE_BASIC_AUTH_PASSWORD = previousPassword;
  }
});
