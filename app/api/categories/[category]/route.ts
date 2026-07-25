import { NextResponse } from "next/server";
import { getCategoryDetails, getDatabase, setCategoryTags } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ category: string }> },
) {
  const category = (await params).category;
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("pageSize")) || 25));
  const result = getCategoryDetails(getDatabase(), category, page, pageSize);
  if (!result.total) {
    return NextResponse.json({ error: "Category not found." }, { status: 404 });
  }
  return NextResponse.json(result);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ category: string }> },
) {
  try {
    const category = (await params).category;
    const body = await request.json() as { selectedTags?: unknown };
    if (!Array.isArray(body.selectedTags) || !body.selectedTags.every((tag) => typeof tag === "string")) {
      return NextResponse.json({ error: "selectedTags must be a list of tag names." }, { status: 400 });
    }
    return NextResponse.json(setCategoryTags(getDatabase(), category, body.selectedTags));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save tag selection." },
      { status: 400 },
    );
  }
}
