import { NextResponse } from "next/server";
import {
  getDatabase,
  getWalletTransactions,
  setWalletStartingBalance,
} from "@/lib/db";
import { parsePagination } from "@/lib/pagination";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wallet: string }> },
) {
  const wallet = (await params).wallet;
  const { searchParams } = new URL(request.url);
  const { page, pageSize } = parsePagination(searchParams);
  const result = getWalletTransactions(getDatabase(), wallet, page, pageSize);
  if (!result.total) {
    return NextResponse.json({ error: "Wallet not found." }, { status: 404 });
  }
  return NextResponse.json(result);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ wallet: string }> },
) {
  try {
    const wallet = (await params).wallet;
    const body = (await request.json()) as {
      currency?: unknown;
      startingAmount?: unknown;
    };
    const currency =
      typeof body.currency === "string" ? body.currency.trim() : "";
    const startingAmount =
      typeof body.startingAmount === "number"
        ? body.startingAmount
        : typeof body.startingAmount === "string" && body.startingAmount.trim()
          ? Number(body.startingAmount)
          : Number.NaN;
    if (!currency || !Number.isFinite(startingAmount)) {
      return NextResponse.json(
        { error: "Currency and a valid starting amount are required." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      setWalletStartingBalance(getDatabase(), wallet, currency, startingAmount),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not save the starting amount.",
      },
      { status: 400 },
    );
  }
}
