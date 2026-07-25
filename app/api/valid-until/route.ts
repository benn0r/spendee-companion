import { NextResponse } from "next/server";
import { getDatabase, getValidUntil, setValidUntil } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ validUntil: getValidUntil(getDatabase()) });
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as { validUntil?: unknown };
    if (body.validUntil !== null && typeof body.validUntil !== "string") {
      return NextResponse.json({ error: "validUntil must be a date or null." }, { status: 400 });
    }
    const validUntil = typeof body.validUntil === "string" ? body.validUntil : null;
    return NextResponse.json({
      validUntil: setValidUntil(getDatabase(), validUntil),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save the validation date." },
      { status: 400 },
    );
  }
}
