import { NextResponse } from "next/server";
import { getDatabase, getFilteredTransactionPage } from "@/lib/db";
import { parsePagination } from "@/lib/pagination";
import { parseTransactionFilters } from "@/lib/transaction-filters";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const { page, pageSize } = parsePagination(searchParams);
  return NextResponse.json(
    getFilteredTransactionPage(
      getDatabase(),
      "transactions",
      parseTransactionFilters(searchParams),
      page,
      pageSize,
    ),
  );
}
