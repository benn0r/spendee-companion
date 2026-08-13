import { NextResponse } from "next/server";
import { getLedgerSnapshot, getLedgerStats } from "@/lib/ledger-service";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getLedgerStats(await getLedgerSnapshot()));
}
