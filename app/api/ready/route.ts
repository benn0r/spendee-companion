import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { getLedgerSnapshot } from "@/lib/ledger-service";

export const runtime = "nodejs";

let initialActualReadiness: Promise<void> | undefined;

function ensureActualReady(): Promise<void> {
  initialActualReadiness ??= getLedgerSnapshot({ forceSync: true })
    .then(() => undefined)
    .catch((error) => {
      initialActualReadiness = undefined;
      throw error;
    });
  return initialActualReadiness;
}

export async function GET() {
  getDatabase().prepare("SELECT 1").get();
  try {
    await ensureActualReady();
    return NextResponse.json({ status: "ready" });
  } catch {
    return NextResponse.json({ status: "not-ready" }, { status: 503 });
  }
}
