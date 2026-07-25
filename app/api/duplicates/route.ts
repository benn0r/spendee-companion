import { NextResponse } from "next/server";
import { getDatabase, getFilteredTransactionPage } from "@/lib/db";
import { parseTransactionFilters } from "@/lib/transaction-filters";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("pageSize")) || 25));
  return NextResponse.json(getFilteredTransactionPage(
    getDatabase(), "duplicates", parseTransactionFilters(searchParams), page, pageSize,
  ));
}
