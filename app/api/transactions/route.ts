import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { calculateDayTotals } from "@/lib/day-groups";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("pageSize")) || 25));
  const db = getDatabase();
  const total = (db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE deleted_at IS NULL").get() as { count: number }).count;
  const rows = db.prepare(`
    SELECT id, date, wallet, type, category_name AS categoryName, amount, currency,
      note, labels, author, source_file AS sourceFile, source_row AS sourceRow,
      imported_at AS importedAt
    FROM transactions WHERE deleted_at IS NULL ORDER BY date DESC, id DESC LIMIT ? OFFSET ?
  `).all(pageSize, (page - 1) * pageSize);
  const dayRows = db.prepare(`
    SELECT date, amount, currency FROM transactions WHERE deleted_at IS NULL
  `).all() as Array<{ date: string; amount: number; currency: string }>;
  return NextResponse.json({
    rows,
    dayTotals: calculateDayTotals(dayRows),
    page,
    pageSize,
    total,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  });
}
