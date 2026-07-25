import { NextResponse } from "next/server";
import { getDatabase, reviewReconciliation } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT r.id, r.action, r.transaction_id AS transactionId, r.created_at AS createdAt,
      t.date, t.wallet, t.type, t.category_name AS categoryName, t.amount, t.currency,
      t.note, t.labels, t.author, t.deleted_at IS NOT NULL AS isDeleted,
      r.proposed_json AS proposedJson
    FROM reconciliation_items r
    JOIN transactions t ON t.id = r.transaction_id
    WHERE r.status = 'pending'
    ORDER BY r.created_at DESC, r.id DESC
  `).all().map((row) => {
    const item = row as Record<string, unknown> & { proposedJson: string | null };
    return { ...item, proposed: item.proposedJson ? JSON.parse(item.proposedJson) : null, proposedJson: undefined };
  });
  return NextResponse.json({ rows, total: rows.length });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { ids?: unknown; decision?: unknown };
    const ids = Array.isArray(body.ids)
      ? body.ids.map(Number).filter((id) => Number.isInteger(id) && id > 0)
      : [];
    if (!ids.length || (body.decision !== "approved" && body.decision !== "rejected")) {
      return NextResponse.json({ error: "Select review items and a valid decision." }, { status: 400 });
    }
    return NextResponse.json(reviewReconciliation(getDatabase(), ids, body.decision));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Review failed." },
      { status: 400 },
    );
  }
}
