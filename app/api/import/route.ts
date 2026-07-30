import { NextResponse } from "next/server";
import { importFiles } from "@/lib/import-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const fullImport = form.get("fullImport") === "true";
    const files = form
      .getAll("files")
      .filter((item): item is File => item instanceof File);
    if (!files.length)
      return NextResponse.json(
        { error: "Choose at least one XLSX or CSV file." },
        { status: 400 },
      );

    const payload = await importFiles(
      await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          buffer: Buffer.from(await file.arrayBuffer()),
        })),
      ),
      { full: fullImport },
    );
    return NextResponse.json(
      {
        results: payload.results,
        summary: payload.summary,
        ...(payload.error ? { error: payload.error } : {}),
      },
      { status: payload.successful ? 200 : 400 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed." },
      { status: 400 },
    );
  }
}
