import { NextResponse } from "next/server";
import { attachValidationReferencesToRows, getDatabase } from "@/lib/db";
import { parsePagination } from "@/lib/pagination";
import { parseTransactionFilters } from "@/lib/transaction-filters";
import {
  getLedgerSnapshot,
  getLedgerTransactionPage,
} from "@/lib/ledger-service";
import { ledgerFilters } from "@/lib/ledger-metadata";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const { page, pageSize } = parsePagination(searchParams);
  const snapshot = await getLedgerSnapshot();
  const result = getLedgerTransactionPage(
    snapshot,
    ledgerFilters(parseTransactionFilters(searchParams)),
    page,
    pageSize,
  );
  return NextResponse.json({
    ...result,
    rows: attachValidationReferencesToRows(
      getDatabase(),
      result.rows,
      snapshot.transactions,
    ),
  });
}
