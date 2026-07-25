import { NextResponse } from "next/server";
import { getDatabase, importTransactions } from "@/lib/db";
import { parseWorkbook } from "@/lib/import-xlsx";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const files = form.getAll("files").filter((item): item is File => item instanceof File);
    if (!files.length) return NextResponse.json({ error: "Choose at least one XLSX file." }, { status: 400 });

    const db = getDatabase();
    const results = [];
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith(".xlsx")) {
        throw new Error(`${file.name}: only .xlsx files are supported`);
      }
      const rows = await parseWorkbook(Buffer.from(await file.arrayBuffer()));
      results.push({ filename: file.name, ...importTransactions(db, file.name, rows) });
    }
    return NextResponse.json({
      results,
      summary: results.reduce(
        (sum, result) => ({
          total: sum.total + result.total,
          imported: sum.imported + result.imported,
          duplicates: sum.duplicates + result.duplicates,
        }),
        { total: 0, imported: 0, duplicates: 0 },
      ),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed." },
      { status: 400 },
    );
  }
}
