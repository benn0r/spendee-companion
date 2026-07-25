import { NextResponse } from "next/server";
import { getDatabase, getWalletTransactions } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wallet: string }> },
) {
  const wallet = (await params).wallet;
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("pageSize")) || 25));
  const result = getWalletTransactions(getDatabase(), wallet, page, pageSize);
  if (!result.total) {
    return NextResponse.json({ error: "Wallet not found." }, { status: 404 });
  }
  return NextResponse.json(result);
}
