import { NextResponse } from "next/server";
import {
  deleteDuplicates,
  getDatabase,
  getFilteredTransactionPage,
} from "@/lib/db";
import { parsePagination } from "@/lib/pagination";
import { parseTransactionFilters } from "@/lib/transaction-filters";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const { page, pageSize } = parsePagination(searchParams);
  return NextResponse.json(
    getFilteredTransactionPage(
      getDatabase(),
      "duplicates",
      parseTransactionFilters(searchParams),
      page,
      pageSize,
    ),
  );
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { ids?: unknown };
    if (
      !Array.isArray(body.ids) ||
      !body.ids.every((id) => typeof id === "number" && Number.isInteger(id))
    ) {
      return NextResponse.json(
        { error: "ids must contain duplicate IDs." },
        { status: 400 },
      );
    }
    return NextResponse.json({
      deleted: deleteDuplicates(getDatabase(), body.ids),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not delete duplicates.",
      },
      { status: 400 },
    );
  }
}
