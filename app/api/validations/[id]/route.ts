import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { getValidation } from "@/lib/validations";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  const validation = Number.isInteger(id) && id > 0 ? getValidation(getDatabase(), id) : null;
  return validation
    ? NextResponse.json(validation)
    : NextResponse.json({ error: "Validation not found." }, { status: 404 });
}
