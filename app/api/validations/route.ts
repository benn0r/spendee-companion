import { NextResponse } from "next/server";
import { getDatabase, getWalletSummaries } from "@/lib/db";
import { extractValidationDocument, validationModel } from "@/lib/openai-validation";
import { compareValidationTransactions, validationDateRange } from "@/lib/validation-diff";
import { renderValidationThumbnail } from "@/lib/validation-thumbnail";
import { createValidation, getWalletValidationTransactions, listValidations } from "@/lib/validations";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({ validations: listValidations(getDatabase()) });
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const wallet = String(form.get("wallet") ?? "").trim();
    const file = form.get("file");
    if (!wallet) return NextResponse.json({ error: "Choose a wallet." }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a PDF document." }, { status: 400 });
    if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "PDF documents must be 20 MB or smaller." }, { status: 400 });
    const pdf = Buffer.from(await file.arrayBuffer());
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "Only PDF documents are supported." }, { status: 400 });
    }
    if (pdf.subarray(0, 5).toString() !== "%PDF-") {
      return NextResponse.json({ error: "The uploaded file is not a readable PDF." }, { status: 400 });
    }

    const db = getDatabase();
    const wallets = new Set(getWalletSummaries(db).map((summary) => summary.wallet));
    if (!wallets.has(wallet)) return NextResponse.json({ error: "The selected wallet does not exist." }, { status: 400 });

    const [{ document, rawResponse }, thumbnail] = await Promise.all([
      extractValidationDocument(pdf, file.name),
      renderValidationThumbnail(pdf),
    ]);
    const { dateFrom, dateTo } = validationDateRange(document.transactions);
    const appTransactions = getWalletValidationTransactions(db, wallet, dateFrom, dateTo);
    const diff = compareValidationTransactions(document.transactions, appTransactions);
    const validation = createValidation(db, {
      wallet,
      filename: file.name,
      document,
      rawOpenAI: rawResponse,
      dateFrom,
      dateTo,
      thumbnail,
      diff,
      model: validationModel,
    });
    return NextResponse.json(validation, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not validate the document." },
      { status: 400 },
    );
  }
}
