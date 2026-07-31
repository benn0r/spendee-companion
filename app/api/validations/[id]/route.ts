import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import {
  createValidationManualMatch,
  deleteValidation,
  getValidation,
} from "@/lib/validations";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const id = Number((await context.params).id);
  const validation =
    Number.isInteger(id) && id > 0 ? getValidation(getDatabase(), id) : null;
  return validation
    ? NextResponse.json(validation)
    : NextResponse.json({ error: "Validation not found." }, { status: 404 });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0)
    return NextResponse.json(
      { error: "Validation not found." },
      { status: 404 },
    );
  const data = (await request.json()) as {
    documentKey?: unknown;
    appFingerprint?: unknown;
  };
  if (
    typeof data.documentKey !== "string" ||
    typeof data.appFingerprint !== "string"
  )
    return NextResponse.json(
      { error: "Choose a suggested transaction." },
      { status: 400 },
    );
  try {
    const validation = createValidationManualMatch(
      getDatabase(),
      id,
      data.documentKey,
      data.appFingerprint,
    );
    return validation
      ? NextResponse.json(validation)
      : NextResponse.json({ error: "Validation not found." }, { status: 404 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not save match.",
      },
      { status: 409 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0 || !deleteValidation(getDatabase(), id))
    return NextResponse.json(
      { error: "Validation not found." },
      { status: 404 },
    );
  return NextResponse.json({ deleted: true });
}
