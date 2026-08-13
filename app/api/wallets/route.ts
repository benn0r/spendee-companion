import { NextResponse } from "next/server";
import {
  getLedgerAccountSummaries,
  getLedgerSnapshot,
} from "@/lib/ledger-service";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    wallets: getLedgerAccountSummaries(await getLedgerSnapshot()),
  });
}
