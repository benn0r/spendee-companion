import { getDatabase, importTransactions } from "./db";
import { parseImportFile } from "./import-xlsx";

export type ImportFile = { name: string; buffer: Buffer };

export async function importFiles(
  files: ImportFile[],
  options: { full?: boolean } = {},
) {
  if (!files.length) throw new Error("Choose at least one XLSX or CSV file.");

  const db = getDatabase();
  const results = [];
  const fullImportWallets = new Set<string>();
  for (const file of files) {
    try {
      const rows = await parseImportFile(file.buffer, file.name);
      if (options.full) {
        const wallets = new Set(rows.map((row) => row.transaction.wallet));
        if (wallets.size !== 1) {
          throw new Error(
            rows.length
              ? "Full import files must contain exactly one wallet."
              : "A header-only file cannot be used for a full import.",
          );
        }
        const wallet = [...wallets][0];
        // A second full-import file for the same wallet would erase the rows from
        // the first file, making the batch order change its result.
        if (fullImportWallets.has(wallet)) {
          throw new Error(
            `Wallet "${wallet}" appears in more than one full-import file.`,
          );
        }
        fullImportWallets.add(wallet);
      }
      results.push({
        filename: file.name,
        ok: true as const,
        ...importTransactions(db, file.name, rows, {
          fullImport: options.full,
        }),
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
  return {
    results,
    summary: successful.reduce(
      (sum, result) => ({
        total: sum.total + result.total,
        imported: sum.imported + result.imported,
        duplicates: sum.duplicates + result.duplicates,
        replaced: sum.replaced + result.replaced,
        files: sum.files + 1,
        failed: failed.length,
      }),
      {
        total: 0,
        imported: 0,
        duplicates: 0,
        replaced: 0,
        files: 0,
        failed: failed.length,
      },
    ),
    successful: successful.length,
    error: successful.length
      ? undefined
      : (failed[0]?.error ?? "Import failed."),
  };
}
