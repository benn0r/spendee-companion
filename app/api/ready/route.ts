import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { getLedgerSnapshot } from "@/lib/ledger-service";

export const runtime = "nodejs";

export async function GET() {
  getDatabase().prepare("SELECT 1").get();
  try {
    await getLedgerSnapshot({ forceSync: true });
    return NextResponse.json({ status: "ready" });
  } catch {
    return NextResponse.json({ status: "not-ready" }, { status: 503 });
  }
}
