import { NextResponse } from "next/server";
import { deleteMobileTransaction } from "@/lib/mobile-transactions";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = (await params).id.trim();
  if (!id)
    return NextResponse.json(
      { error: "Transaction not found." },
      { status: 404 },
    );
  try {
    await deleteMobileTransaction(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not delete transaction from Actual Budget.",
      },
      { status: 502 },
    );
  }
}
