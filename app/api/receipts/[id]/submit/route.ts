import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import {
  createMobileTransaction,
  mobileTransactionSchema,
} from "@/lib/mobile-transactions";
import { getReceipt, markReceiptSubmitted } from "@/lib/receipts";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = Number((await params).id);
  const db = getDatabase();
  const receipt = Number.isInteger(id) ? getReceipt(db, id) : undefined;
  if (!receipt)
    return NextResponse.json({ error: "Receipt not found." }, { status: 404 });
  if (receipt.status !== "processed")
    return NextResponse.json(
      { error: "Receipt is not processed." },
      { status: 409 },
    );
  if (receipt.submitted)
    return NextResponse.json(
      { error: "Receipt was already submitted." },
      { status: 409 },
    );
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = mobileTransactionSchema.safeParse(payload);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid transaction.", details: parsed.error.issues },
      { status: 400 },
    );
  try {
    const transactionId = await createMobileTransaction(parsed.data, {
      importedId: `spendee-receipt:${receipt.id}`,
    });
    markReceiptSubmitted(db, receipt.id, transactionId);
    return NextResponse.json(
      { id: transactionId, status: "created" },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not add transaction to Actual Budget.",
      },
      { status: 502 },
    );
  }
}
