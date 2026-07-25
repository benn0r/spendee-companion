import { getDatabase, getSplit } from "@/lib/db";
import { createSplitPdf } from "@/lib/split-pdf";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = Number((await params).id);
  const split = Number.isInteger(id) ? getSplit(getDatabase(), id) : null;
  if (!split) return Response.json({ error: "Split not found." }, { status: 404 });
  const pdf = await createSplitPdf(split as Parameters<typeof createSplitPdf>[0]);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="spendee-split-${id}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
