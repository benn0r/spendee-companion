import { NextResponse } from "next/server";
import { getDatabase, importTransactions } from "@/lib/db";
import { parseImportFile } from "@/lib/import-xlsx";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const fullImport = form.get("fullImport") === "true";
    const files = form.getAll("files").filter((item): item is File => item instanceof File);
    if (!files.length) return NextResponse.json({ error: "Choose at least one XLSX or CSV file." }, { status: 400 });

    const db = getDatabase();
    const results = [];
    const fullImportWallets = new Set<string>();
    for (const file of files) {
      try {
        const rows = await parseImportFile(Buffer.from(await file.arrayBuffer()), file.name);
        if (fullImport) {
          const wallets = new Set(rows.map((row) => row.transaction.wallet));
          if (wallets.size !== 1) {
            throw new Error(
              rows.length
                ? "Full import files must contain exactly one wallet."
                : "A header-only file cannot be used for a full import.",
            );
          }
          const wallet = [...wallets][0];
          if (fullImportWallets.has(wallet)) {
            throw new Error(`Wallet "${wallet}" appears in more than one full-import file.`);
          }
          fullImportWallets.add(wallet);
        }
        results.push({
          filename: file.name,
          ok: true as const,
          ...importTransactions(db, file.name, rows, { fullImport }),
        });
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
          changes: sum.changes + result.changes,
          deletions: sum.deletions + result.deletions,
          files: sum.files + 1,
          failed: failed.length,
        }),
        { total: 0, imported: 0, duplicates: 0, changes: 0, deletions: 0, files: 0, failed: failed.length },
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
