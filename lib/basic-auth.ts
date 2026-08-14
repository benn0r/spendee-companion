import { createHash, timingSafeEqual } from "node:crypto";

export type BasicAuthEnvironment = Readonly<Record<string, string | undefined>>;

export type BasicAuthDecision =
  "disabled" | "authorized" | "unauthorized" | "misconfigured";

const PUBLIC_ASSET_PATHS = new Set([
  "/apple-icon.png",
  "/favicon-16.png",
  "/favicon-32.png",
  "/favicon.ico",
  "/icon.png",
  "/manifest.webmanifest",
  "/robots.txt",
  "/sitemap.xml",
  "/spendee-icon-master.png",
]);

function configuredValue(
  env: BasicAuthEnvironment,
  name: "SPENDEE_BASIC_AUTH_USERNAME" | "SPENDEE_BASIC_AUTH_PASSWORD",
): string | null {
  const value = env[name];
  return value === undefined || value.length === 0 ? null : value;
}

function constantTimeEqual(actual: string, expected: string): boolean {
  const actualDigest = createHash("sha256").update(actual, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

function configuredApiKey(env: BasicAuthEnvironment): string | null {
  const value = env.SPENDEE_API_KEY || env.API_KEY;
  return value === undefined || value.length === 0 ? null : value;
}

export function isApiBearerAuthorized(
  pathname: string,
  authorization: string | null,
  env: BasicAuthEnvironment = process.env,
): boolean {
  if (!pathname.startsWith("/api/") || pathname === "/api/ready") return false;
  const expected = configuredApiKey(env);
  const match = /^Bearer +(.+)$/i.exec(authorization ?? "");
  return Boolean(expected && match && constantTimeEqual(match[1], expected));
}

function parseBasicCredentials(
  authorization: string | null,
): { username: string; password: string } | null {
  const match = /^Basic +([A-Za-z0-9+/]+={0,2})$/i.exec(authorization ?? "");
  if (!match) return null;

  const encoded = match[1];
  const bytes = Buffer.from(encoded, "base64");
  const normalizedInput = encoded.replace(/=+$/, "");
  const normalizedDecoded = bytes.toString("base64").replace(/=+$/, "");
  if (normalizedDecoded !== normalizedInput) return null;

  const decoded = bytes.toString("utf8");
  if (!Buffer.from(decoded, "utf8").equals(bytes)) return null;

  const separator = decoded.indexOf(":");
  if (separator < 0) return null;
  return {
    username: decoded.slice(0, separator),
    password: decoded.slice(separator + 1),
  };
}

export function isBasicAuthBypassPath(pathname: string): boolean {
  if (pathname === "/api/ready") return true;
  if (
    pathname === "/_next/static" ||
    pathname.startsWith("/_next/static/") ||
    pathname === "/_next/image" ||
    pathname.startsWith("/_next/image/")
  ) {
    return true;
  }
  if (pathname.startsWith("/category-icons/")) return true;
  return PUBLIC_ASSET_PATHS.has(pathname);
}

export function evaluateBasicAuth(
  authorization: string | null,
  env: BasicAuthEnvironment = process.env,
): BasicAuthDecision {
  const expectedUsername = configuredValue(env, "SPENDEE_BASIC_AUTH_USERNAME");
  const expectedPassword = configuredValue(env, "SPENDEE_BASIC_AUTH_PASSWORD");

  if (expectedUsername === null && expectedPassword === null) return "disabled";
  if (
    expectedUsername === null ||
    expectedPassword === null ||
    expectedUsername.includes(":")
  ) {
    return "misconfigured";
  }

  const supplied = parseBasicCredentials(authorization);
  if (!supplied) return "unauthorized";

  const usernameMatches = constantTimeEqual(
    supplied.username,
    expectedUsername,
  );
  const passwordMatches = constantTimeEqual(
    supplied.password,
    expectedPassword,
  );
  return usernameMatches && passwordMatches ? "authorized" : "unauthorized";
}

export function getBasicAuthRejection(
  pathname: string,
  authorization: string | null,
  env: BasicAuthEnvironment = process.env,
): Response | null {
  if (isBasicAuthBypassPath(pathname)) return null;
  if (isApiBearerAuthorized(pathname, authorization, env)) return null;

  const decision = evaluateBasicAuth(authorization, env);
  if (decision === "disabled" || decision === "authorized") return null;

  const headers = {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
  };
  if (decision === "misconfigured") {
    return new Response(
      "HTTP Basic Authentication is not configured correctly.",
      {
        status: 503,
        headers,
      },
    );
  }

  return new Response("Authentication required.", {
    status: 401,
    headers: {
      ...headers,
      "WWW-Authenticate": 'Basic realm="Spendee", charset="UTF-8"',
    },
  });
}
