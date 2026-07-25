import { NextResponse } from "next/server";
import { getDatabase, getWalletSummaries } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const grouped = new Map<string, {
    wallet: string;
    transactionCount: number;
    totals: Array<{ currency: string; total: number }>;
  }>();
  for (const row of getWalletSummaries(getDatabase())) {
    const summary = grouped.get(row.wallet) ?? {
      wallet: row.wallet,
      transactionCount: 0,
      totals: [],
    };
    summary.transactionCount += row.transactionCount;
    summary.totals.push({ currency: row.currency, total: row.total });
    grouped.set(row.wallet, summary);
  }
  return NextResponse.json({ wallets: Array.from(grouped.values()) });
}
