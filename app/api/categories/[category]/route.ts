import { NextResponse } from "next/server";
import { getCategoryDetails, getDatabase, resolveCategory, setCategoryTags } from "@/lib/db";
import { parseTransactionFilters } from "@/lib/transaction-filters";

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
  const result = getCategoryDetails(db, category, page, pageSize, parseTransactionFilters(searchParams));
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
    const body = await request.json() as { selectedTags?: unknown; spendingByTagEnabled?: unknown };
    if (!Array.isArray(body.selectedTags) || !body.selectedTags.every((tag) => typeof tag === "string")) {
      return NextResponse.json({ error: "selectedTags must be a list of tag names." }, { status: 400 });
    }
    if (typeof body.spendingByTagEnabled !== "boolean") {
      return NextResponse.json({ error: "spendingByTagEnabled must be a boolean." }, { status: 400 });
    }
    return NextResponse.json(
      setCategoryTags(db, category, body.selectedTags, body.spendingByTagEnabled),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save tag selection." },
      { status: 400 },
    );
  }
}
