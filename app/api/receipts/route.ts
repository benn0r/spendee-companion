import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { getLedgerSnapshot } from "@/lib/ledger-service";
import { processReceiptQueue } from "@/lib/receipt-processing";
import { listReceipts, saveReceipt, toReceiptApiRecord } from "@/lib/receipts";

export const runtime = "nodejs";

const signatures: Record<string, (data: Buffer) => boolean> = {
  "application/pdf": (data) => data.subarray(0, 5).toString() === "%PDF-",
  "image/png": (data) =>
    data.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")),
  "image/jpeg": (data) =>
    data.length >= 3 &&
    data[0] === 0xff &&
    data[1] === 0xd8 &&
    data[2] === 0xff,
  "image/webp": (data) =>
    data.subarray(0, 4).toString() === "RIFF" &&
    data.subarray(8, 12).toString() === "WEBP",
};

export function GET() {
  const db = getDatabase();
  if (listReceipts(db).some(({ status }) => status === "queued")) {
    void processReceiptQueue(db);
  }
  return NextResponse.json({
    receipts: listReceipts(db).map(toReceiptApiRecord),
  });
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const accountId = String(form.get("account") ?? "").trim();
    const file = form.get("receipt");
    if (!accountId)
      return NextResponse.json(
        { error: "Choose an Actual Budget account." },
        { status: 400 },
      );
    if (!(file instanceof File))
      return NextResponse.json(
        { error: "Choose a receipt image or PDF." },
        { status: 400 },
      );
    if (file.size > 10 * 1024 * 1024)
      return NextResponse.json(
        { error: "Receipt files must be 10 MB or smaller." },
        { status: 400 },
      );
    const data = Buffer.from(await file.arrayBuffer());
    const signature = signatures[file.type];
    if (!signature || !signature(data))
      return NextResponse.json(
        {
          error:
            "Only readable JPEG, PNG, WebP, and PDF receipts are supported.",
        },
        { status: 400 },
      );
    const snapshot = await getLedgerSnapshot();
    const account = snapshot.accounts.find(({ id }) => id === accountId);
    if (!account)
      return NextResponse.json(
        { error: "The selected account does not exist." },
        { status: 400 },
      );
    const db = getDatabase();
    const id = await saveReceipt(db, {
      filename: file.name,
      mimeType: file.type,
      data,
      accountId: account.id,
      accountName: account.name,
    });
    if (process.env.RECEIPT_BACKGROUND_IMMEDIATE === "1") {
      await processReceiptQueue(db);
    } else {
      void processReceiptQueue(db);
    }
    return NextResponse.json({ id, status: "queued" }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Receipt upload failed.",
      },
      { status: 400 },
    );
  }
}
