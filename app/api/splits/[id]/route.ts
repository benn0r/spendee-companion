import { NextResponse } from "next/server";
import { deleteSplit, getDatabase, getSplit } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = Number((await params).id);
  const split = Number.isInteger(id) ? getSplit(getDatabase(), id) : null;
  return split
    ? NextResponse.json(split)
    : NextResponse.json({ error: "Split not found." }, { status: 404 });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || !deleteSplit(getDatabase(), id)) {
    return NextResponse.json({ error: "Split not found." }, { status: 404 });
  }
  return NextResponse.json({ deleted: true });
}
