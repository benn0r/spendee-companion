import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import {
  addValidationBlacklist,
  deleteValidationBlacklist,
  listValidationBlacklist,
} from "@/lib/validation-blacklist";
import { recomputeValidationDiff } from "@/lib/validations";
import { getLedgerSnapshot } from "@/lib/ledger-service";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({ entries: listValidationBlacklist(getDatabase()) });
}

export async function POST(request: Request) {
  const data = (await request.json()) as {
    description?: unknown;
    validationId?: unknown;
  };
  const description =
    typeof data.description === "string" ? data.description : "";
  const validationId = Number(data.validationId);
  try {
    const db = getDatabase();
    const transactions =
      Number.isInteger(validationId) && validationId > 0
        ? (await getLedgerSnapshot()).transactions
        : null;
    addValidationBlacklist(db, description);
    if (transactions) {
      await recomputeValidationDiff(db, validationId, transactions);
    }
    return NextResponse.json({ entries: listValidationBlacklist(db) });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not update blacklist.",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const data = (await request.json()) as {
    id?: unknown;
    validationId?: unknown;
  };
  const id = Number(data.id);
  const db = getDatabase();
  if (
    !Number.isInteger(id) ||
    !listValidationBlacklist(db).some((entry) => entry.id === id)
  ) {
    return NextResponse.json(
      { error: "Blacklist entry not found." },
      { status: 404 },
    );
  }
  const validationId = Number(data.validationId);
  let transactions = null;
  try {
    transactions =
      Number.isInteger(validationId) && validationId > 0
        ? (await getLedgerSnapshot()).transactions
        : null;
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not update blacklist.",
      },
      { status: 400 },
    );
  }
  if (!deleteValidationBlacklist(db, id)) {
    return NextResponse.json(
      { error: "Blacklist entry not found." },
      { status: 404 },
    );
  }
  if (transactions) {
    await recomputeValidationDiff(db, validationId, transactions);
  }
  return NextResponse.json({ entries: listValidationBlacklist(db) });
}
