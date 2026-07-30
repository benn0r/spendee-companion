import { getDatabase } from "@/lib/db";
import { getValidationThumbnail } from "@/lib/validations";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const id = Number((await context.params).id);
  const thumbnail =
    Number.isInteger(id) && id > 0
      ? getValidationThumbnail(getDatabase(), id)
      : null;
  return thumbnail
    ? new Response(new Uint8Array(thumbnail), {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "private, max-age=31536000, immutable",
        },
      })
    : Response.json(
        { error: "Validation thumbnail not found." },
        { status: 404 },
      );
}
