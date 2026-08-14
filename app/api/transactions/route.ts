import { NextResponse } from "next/server";
import { attachValidationReferencesToRows, getDatabase } from "@/lib/db";
import { parsePagination } from "@/lib/pagination";
import { parseTransactionFilters } from "@/lib/transaction-filters";
import {
  createMobileTransaction,
  mobileTransactionSchema,
} from "@/lib/mobile-transactions";
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
    transactions: result.rows.map((row) => ({
      id: row.id,
      date: row.date.slice(0, 10),
      amount: row.amount,
      account: row.wallet,
      category: row.categoryName ?? "Uncategorized",
      payee: row.payeeName ?? "—",
      notes: row.note ?? undefined,
      isSplit: row.subtransactions.length > 0,
    })),
  });
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = mobileTransactionSchema.safeParse(payload);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid transaction.", details: parsed.error.issues },
      { status: 400 },
    );
  try {
    const id = await createMobileTransaction(parsed.data);
    return NextResponse.json({ id, status: "created" }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not add transaction to Actual Budget.",
      },
      { status: 502 },
    );
  }
}
