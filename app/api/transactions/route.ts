import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";

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
  return NextResponse.json({ rows, page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) });
}
