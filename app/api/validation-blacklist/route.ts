import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { addValidationBlacklist, deleteValidationBlacklist, filterBlacklistedTransactions, listValidationBlacklist } from "@/lib/validation-blacklist";
import { compareValidationTransactions } from "@/lib/validation-diff";
import { getValidation, getWalletValidationTransactions, updateValidationDiff } from "@/lib/validations";
import type { ExtractedDocument } from "@/lib/validation-types";

export const runtime = "nodejs";

type CompletedValidation = { status: string; wallet: string; dateFrom: string; dateTo: string; extracted: ExtractedDocument };

export function GET() {
  return NextResponse.json({ entries: listValidationBlacklist(getDatabase()) });
}

export async function POST(request: Request) {
  const data = await request.json() as { description?: unknown; validationId?: unknown };
  const description = typeof data.description === "string" ? data.description : "";
  const validationId = Number(data.validationId);
  try {
    const db = getDatabase();
    addValidationBlacklist(db, description);
    const validation = (Number.isInteger(validationId) ? getValidation(db, validationId) : null) as CompletedValidation | null;
    if (validation && validation.status === "complete") {
      const documentTransactions = filterBlacklistedTransactions(db, validation.extracted.transactions);
      const appTransactions = getWalletValidationTransactions(db, String(validation.wallet), String(validation.dateFrom), String(validation.dateTo));
      updateValidationDiff(db, validationId, compareValidationTransactions(documentTransactions, appTransactions));
    }
    return NextResponse.json({ entries: listValidationBlacklist(db) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update blacklist." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const data = await request.json() as { id?: unknown; validationId?: unknown };
  const id = Number(data.id);
  const db = getDatabase();
  if (!Number.isInteger(id) || !deleteValidationBlacklist(db, id)) {
    return NextResponse.json({ error: "Blacklist entry not found." }, { status: 404 });
  }
  const validationId = Number(data.validationId);
  const validation = (Number.isInteger(validationId) ? getValidation(db, validationId) : null) as CompletedValidation | null;
  if (validation && validation.status === "complete") {
    const documentTransactions = filterBlacklistedTransactions(db, validation.extracted.transactions);
    const appTransactions = getWalletValidationTransactions(db, String(validation.wallet), String(validation.dateFrom), String(validation.dateTo));
    updateValidationDiff(db, validationId, compareValidationTransactions(documentTransactions, appTransactions));
  }
  return NextResponse.json({ entries: listValidationBlacklist(db) });
}
