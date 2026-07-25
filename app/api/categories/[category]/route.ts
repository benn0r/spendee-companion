import { NextResponse } from "next/server";
import { getCategoryDetails, getDatabase } from "@/lib/db";

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
