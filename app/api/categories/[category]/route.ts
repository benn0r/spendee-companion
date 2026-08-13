import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { parseTransactionFilters } from "@/lib/transaction-filters";
import { categoryIconIds, validCategoryColor } from "@/lib/category-appearance";
import { parsePagination } from "@/lib/pagination";
import { getLedgerSnapshot } from "@/lib/ledger-service";
import {
  getLedgerCategoryDetails,
  resolveLedgerCategory,
  saveLedgerCategorySettings,
} from "@/lib/ledger-metadata";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ category: string }> },
) {
  const identifier = (await params).category;
  const db = getDatabase();
  const snapshot = await getLedgerSnapshot();
  const category = resolveLedgerCategory(snapshot, identifier);
  if (!category) {
    return NextResponse.json({ error: "Category not found." }, { status: 404 });
  }
  const { searchParams } = new URL(request.url);
  const { page, pageSize } = parsePagination(searchParams);
  const requestedMonth = searchParams.get("month");
  if (
    requestedMonth &&
    requestedMonth !== "all" &&
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth)
  ) {
    return NextResponse.json(
      { error: "Select a valid month." },
      { status: 400 },
    );
  }
  const chartMonth =
    requestedMonth === "all" ? null : (requestedMonth ?? undefined);
  const result = getLedgerCategoryDetails(
    db,
    snapshot,
    category.id,
    page,
    pageSize,
    parseTransactionFilters(searchParams),
    chartMonth,
  );
  return NextResponse.json(result);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ category: string }> },
) {
  try {
    const identifier = (await params).category;
    const db = getDatabase();
    const snapshot = await getLedgerSnapshot();
    const category = resolveLedgerCategory(snapshot, identifier);
    if (!category) {
      return NextResponse.json(
        { error: "Category not found." },
        { status: 404 },
      );
    }
    const body = (await request.json()) as {
      selectedTags?: unknown;
      spendingByTagEnabled?: unknown;
      iconId?: unknown;
      color?: unknown;
    };
    if (
      !Array.isArray(body.selectedTags) ||
      !body.selectedTags.every((tag) => typeof tag === "string")
    ) {
      return NextResponse.json(
        { error: "Labels must be a list of label names." },
        { status: 400 },
      );
    }
    if (typeof body.spendingByTagEnabled !== "boolean") {
      return NextResponse.json(
        { error: "spendingByTagEnabled must be a boolean." },
        { status: 400 },
      );
    }
    if (
      body.iconId !== null &&
      (typeof body.iconId !== "number" ||
        !categoryIconIds.includes(body.iconId))
    ) {
      return NextResponse.json(
        { error: "Select a valid category icon." },
        { status: 400 },
      );
    }
    if (typeof body.color !== "string" || !validCategoryColor(body.color)) {
      return NextResponse.json(
        { error: "Select a valid category color." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      saveLedgerCategorySettings(
        db,
        snapshot,
        category.id,
        body.selectedTags,
        body.spendingByTagEnabled,
        body.iconId,
        body.color,
      ),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not save label selection.",
      },
      { status: 400 },
    );
  }
}
