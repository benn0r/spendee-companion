import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { deleteValidationManualMatch } from "@/lib/validations";
import { getLedgerSnapshot } from "@/lib/ledger-service";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const id = Number((await context.params).id);
  const data = (await request.json()) as { documentKey?: unknown };
  const documentKey =
    typeof data.documentKey === "string" ? data.documentKey : "";
  const validation =
    Number.isInteger(id) && id > 0 && documentKey
      ? await deleteValidationManualMatch(
          getDatabase(),
          id,
          documentKey,
          async () => (await getLedgerSnapshot()).transactions,
        )
      : null;
  return validation
    ? NextResponse.json(validation)
    : NextResponse.json({ error: "Manual match not found." }, { status: 404 });
}
