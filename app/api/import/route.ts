import { NextResponse } from "next/server";
import { getDatabase, importTransactions } from "@/lib/db";
import { parseImportFile } from "@/lib/import-xlsx";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const files = form.getAll("files").filter((item): item is File => item instanceof File);
    if (!files.length) return NextResponse.json({ error: "Choose at least one XLSX or CSV file." }, { status: 400 });

    const db = getDatabase();
    const results = [];
    for (const file of files) {
      try {
        const rows = await parseImportFile(Buffer.from(await file.arrayBuffer()), file.name);
        results.push({ filename: file.name, ok: true as const, ...importTransactions(db, file.name, rows) });
      } catch (error) {
        results.push({
          filename: file.name,
          ok: false as const,
          error: error instanceof Error ? error.message : "Import failed.",
        });
      }
    }
    const successful = results.filter((result) => result.ok);
    const failed = results.filter((result) => !result.ok);
    const payload = {
      results,
      summary: successful.reduce(
        (sum, result) => ({
          total: sum.total + result.total,
          imported: sum.imported + result.imported,
          duplicates: sum.duplicates + result.duplicates,
          files: sum.files + 1,
          failed: failed.length,
        }),
        { total: 0, imported: 0, duplicates: 0, files: 0, failed: failed.length },
      ),
    };
    return NextResponse.json(
      successful.length ? payload : { ...payload, error: failed[0]?.error ?? "Import failed." },
      { status: successful.length ? 200 : 400 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed." },
      { status: 400 },
    );
  }
}
