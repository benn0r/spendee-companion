import { NextResponse } from "next/server";
import { createSplitFromTransactions, getDatabase, getSplits } from "@/lib/db";
import { normalizeLocale } from "@/lib/i18n";
import {
  getLedgerSnapshot,
  getLedgerTransactionsByIds,
} from "@/lib/ledger-service";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ splits: getSplits(getDatabase()) });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      title?: unknown;
      transactionIds?: unknown;
      customPositions?: unknown;
      splitCount?: unknown;
      locale?: unknown;
    };
    if (typeof body.title !== "string" || !body.title.trim()) {
      return NextResponse.json(
        { error: "A split title is required." },
        { status: 400 },
      );
    }
    if (
      !Array.isArray(body.transactionIds) ||
      !body.transactionIds.every(
        (id) => typeof id === "string" && id.trim().length > 0,
      )
    ) {
      return NextResponse.json(
        { error: "transactionIds must contain transaction IDs." },
        { status: 400 },
      );
    }
    if (
      !Array.isArray(body.customPositions) ||
      !body.customPositions.every(
        (position) =>
          typeof position === "object" &&
          position !== null &&
          typeof (position as { description?: unknown }).description ===
            "string" &&
          typeof (position as { amount?: unknown }).amount === "number",
      )
    ) {
      return NextResponse.json(
        { error: "Custom positions are invalid." },
        { status: 400 },
      );
    }
    if (typeof body.splitCount !== "number") {
      return NextResponse.json(
        { error: "splitCount must be a number." },
        { status: 400 },
      );
    }
    const snapshot = await getLedgerSnapshot();
    const transactionIds = body.transactionIds as string[];
    const transactions = getLedgerTransactionsByIds(snapshot, transactionIds);
    if (transactions.length !== new Set(transactionIds).size) {
      return NextResponse.json(
        { error: "One or more selected transactions no longer exist." },
        { status: 409 },
      );
    }
    const split = createSplitFromTransactions(
      getDatabase(),
      body.title,
      transactions,
      body.customPositions as Array<{ description: string; amount: number }>,
      body.splitCount,
      normalizeLocale(body.locale),
    );
    return NextResponse.json(split, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not save split.",
      },
      { status: 400 },
    );
  }
}
