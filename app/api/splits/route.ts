import { NextResponse } from "next/server";
import { createSplit, getDatabase, getSplits } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ splits: getSplits(getDatabase()) });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      transactionIds?: unknown;
      customPositions?: unknown;
      splitCount?: unknown;
    };
    if (!Array.isArray(body.transactionIds) ||
      !body.transactionIds.every((id) => typeof id === "number" && Number.isInteger(id))) {
      return NextResponse.json({ error: "transactionIds must contain transaction IDs." }, { status: 400 });
    }
    if (!Array.isArray(body.customPositions) || !body.customPositions.every((position) =>
      typeof position === "object" && position !== null &&
      typeof (position as { description?: unknown }).description === "string" &&
      typeof (position as { amount?: unknown }).amount === "number"
    )) {
      return NextResponse.json({ error: "Custom positions are invalid." }, { status: 400 });
    }
    if (typeof body.splitCount !== "number") {
      return NextResponse.json({ error: "splitCount must be a number." }, { status: 400 });
    }
    const split = createSplit(
      getDatabase(),
      body.transactionIds,
      body.customPositions as Array<{ description: string; amount: number }>,
      body.splitCount,
    );
    return NextResponse.json(split, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save split." },
      { status: 400 },
    );
  }
}
