import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const db = getDatabase();
  const stats = db
    .prepare(
      `
    SELECT
      (SELECT COUNT(*) FROM transactions WHERE deleted_at IS NULL) AS transactions,
      (SELECT COUNT(*) FROM duplicates) AS duplicates,
      (SELECT COUNT(*) FROM imports) AS imports,
      (SELECT COUNT(DISTINCT wallet) FROM transactions WHERE deleted_at IS NULL) AS wallets
  `,
    )
    .get();
  return NextResponse.json(stats);
}
