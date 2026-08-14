import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { deleteReceipt, getReceipt, toReceiptApiRecord } from "@/lib/receipts";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = Number((await params).id);
  const receipt = Number.isInteger(id)
    ? getReceipt(getDatabase(), id)
    : undefined;
  return receipt
    ? NextResponse.json(toReceiptApiRecord(receipt))
    : NextResponse.json({ error: "Receipt not found." }, { status: 404 });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1)
    return NextResponse.json({ error: "Receipt not found." }, { status: 404 });
  return (await deleteReceipt(getDatabase(), id))
    ? new Response(null, { status: 204 })
    : NextResponse.json({ error: "Receipt not found." }, { status: 404 });
}
