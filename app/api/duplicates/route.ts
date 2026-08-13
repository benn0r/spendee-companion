import { NextResponse } from "next/server";
import { parsePagination } from "@/lib/pagination";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const { page, pageSize } = parsePagination(searchParams);
  return NextResponse.json({
    rows: [],
    dayTotals: {},
    page,
    pageSize,
    total: 0,
    pages: 1,
  });
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { ids?: unknown };
    if (
      !Array.isArray(body.ids) ||
      !body.ids.every(
        (id) =>
          (typeof id === "string" && id.length > 0) ||
          (typeof id === "number" && Number.isInteger(id)),
      )
    ) {
      return NextResponse.json(
        { error: "ids must contain duplicate IDs." },
        { status: 400 },
      );
    }
    return NextResponse.json({ deleted: 0 });
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
