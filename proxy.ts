import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getBasicAuthRejection } from "@/lib/basic-auth";

export function proxy(request: NextRequest): Response {
  return (
    getBasicAuthRejection(
      request.nextUrl.pathname,
      request.headers.get("authorization"),
    ) ?? NextResponse.next()
  );
}
