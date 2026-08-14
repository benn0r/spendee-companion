import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  configuredApiKey,
  evaluateBasicAuth,
  getApiBearerRejection,
  getBasicAuthRejection,
} from "@/lib/basic-auth";

export function proxy(request: NextRequest): Response {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const apiRejection = getApiBearerRejection(
      request.nextUrl.pathname,
      request.headers.get("authorization"),
    );
    if (!apiRejection) return NextResponse.next();

    // Browsers already authenticate at the application boundary with Basic
    // Auth. Forward those same-origin API calls as bearer-authenticated server
    // requests so the API key never enters client JavaScript.
    if (
      evaluateBasicAuth(request.headers.get("authorization")) === "authorized"
    ) {
      const apiKey = configuredApiKey(process.env);
      if (apiKey) {
        const requestHeaders = new Headers(request.headers);
        requestHeaders.set("authorization", `Bearer ${apiKey}`);
        return NextResponse.next({ request: { headers: requestHeaders } });
      }
    }

    return apiRejection;
  }

  return (
    getBasicAuthRejection(
      request.nextUrl.pathname,
      request.headers.get("authorization"),
    ) ?? NextResponse.next()
  );
}
