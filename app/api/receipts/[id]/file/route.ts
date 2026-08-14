import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { getReceipt, readReceiptFile } from "@/lib/receipts";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = Number((await params).id);
  const receipt = Number.isInteger(id)
    ? getReceipt(getDatabase(), id)
    : undefined;
  if (!receipt)
    return NextResponse.json({ error: "Receipt not found." }, { status: 404 });
  try {
    const data = await readReceiptFile(receipt);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": receipt.mimeType,
        "Content-Disposition": `inline; filename="${receipt.filename.replaceAll('"', "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Receipt file not found." },
      { status: 404 },
    );
  }
}
