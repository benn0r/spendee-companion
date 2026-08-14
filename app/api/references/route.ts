import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { defaultCategoryColor } from "@/lib/category-appearance";
import { getLedgerSnapshot } from "@/lib/ledger-service";

export const runtime = "nodejs";

export async function GET() {
  const snapshot = await getLedgerSnapshot();
  const db = getDatabase();
  return NextResponse.json({
    accounts: snapshot.accounts.map(({ id, name }) => ({ id, name })),
    categories: snapshot.categories.map(({ id, name }) => {
      const saved = db
        .prepare(
          "SELECT icon_id AS iconId, color FROM category_tag_config WHERE category = ?",
        )
        .get(id) as { iconId: number | null; color: string | null } | undefined;
      return {
        id,
        name,
        icon: "pricetag",
        iconId: saved?.iconId ?? null,
        color: saved?.color ?? defaultCategoryColor,
      };
    }),
    tags: snapshot.tags.map(({ id, name }) => ({ id, name })),
  });
}
