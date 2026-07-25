import { NextResponse } from "next/server";
import { getCategoryDetails, getDatabase, resolveCategory, setCategoryTags } from "@/lib/db";
import { parseTransactionFilters } from "@/lib/transaction-filters";
import { categoryIconIds, validCategoryColor } from "@/lib/category-appearance";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ category: string }> },
) {
  const identifier = (await params).category;
  const db = getDatabase();
  const category = resolveCategory(db, identifier);
  if (!category) {
    return NextResponse.json({ error: "Category not found." }, { status: 404 });
  }
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("pageSize")) || 25));
  const requestedMonth = searchParams.get("month");
  if (requestedMonth && requestedMonth !== "all" && !/^\d{4}-\d{2}$/.test(requestedMonth)) {
    return NextResponse.json({ error: "Select a valid month." }, { status: 400 });
  }
  const chartMonth = requestedMonth === "all" ? null : requestedMonth ?? undefined;
  const result = getCategoryDetails(db, category, page, pageSize, parseTransactionFilters(searchParams), chartMonth);
  return NextResponse.json(result);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ category: string }> },
) {
  try {
    const identifier = (await params).category;
    const db = getDatabase();
    const category = resolveCategory(db, identifier);
    if (!category) {
      return NextResponse.json({ error: "Category not found." }, { status: 404 });
    }
    const body = await request.json() as { selectedTags?: unknown; spendingByTagEnabled?: unknown; iconId?: unknown; color?: unknown };
    if (!Array.isArray(body.selectedTags) || !body.selectedTags.every((tag) => typeof tag === "string")) {
      return NextResponse.json({ error: "selectedTags must be a list of tag names." }, { status: 400 });
    }
    if (typeof body.spendingByTagEnabled !== "boolean") {
      return NextResponse.json({ error: "spendingByTagEnabled must be a boolean." }, { status: 400 });
    }
    if (body.iconId !== null && (typeof body.iconId !== "number" || !categoryIconIds.includes(body.iconId))) {
      return NextResponse.json({ error: "Select a valid category icon." }, { status: 400 });
    }
    if (typeof body.color !== "string" || !validCategoryColor(body.color)) {
      return NextResponse.json({ error: "Select a valid category color." }, { status: 400 });
    }
    return NextResponse.json(
      setCategoryTags(db, category, body.selectedTags, body.spendingByTagEnabled, body.iconId, body.color),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save tag selection." },
      { status: 400 },
    );
  }
}
