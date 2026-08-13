import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { getLedgerSnapshot } from "@/lib/ledger-service";

export const runtime = "nodejs";

export async function GET(request?: Request) {
  getDatabase().prepare("SELECT 1").get();
  const ready = request
    ? new URL(request.url).searchParams.get("ready") === "1"
    : false;
  if (ready) {
    try {
      await getLedgerSnapshot({ forceSync: true });
    } catch {
      return NextResponse.json(
        {
          status: "not-ready",
          sqlite: "ok",
          actual: "unavailable",
          version: process.env.APP_VERSION ?? "dev",
        },
        { status: 503 },
      );
    }
  }
  return NextResponse.json({
    status: "ok",
    sqlite: "ok",
    actual: ready ? "ok" : "not-checked",
    version: process.env.APP_VERSION ?? "dev",
  });
}
