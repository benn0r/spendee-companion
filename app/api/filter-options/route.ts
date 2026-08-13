import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { getLedgerSnapshot } from "@/lib/ledger-service";
import { getLedgerFilterOptionsWithMetadata } from "@/lib/ledger-metadata";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    getLedgerFilterOptionsWithMetadata(
      getDatabase(),
      await getLedgerSnapshot(),
    ),
  );
}
