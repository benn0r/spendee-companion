import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { after, test } from "node:test";
import { getDatabase } from "../lib/db";
import { importFiles } from "../lib/import-service";

const databasePath = `/tmp/spendee-import-service-${crypto.randomUUID()}.db`;
process.env.SQLITE_PATH = databasePath;

after(() => {
  getDatabase().close();
  rmSync(databasePath, { force: true });
});

function csv(wallet: string, amount = -12) {
  return Buffer.from([
    "Date,Wallet,Type,Category name,Amount,Currency,Note,Labels,Author",
    `2026-07-01T08:00:00.000Z,${wallet},Expense,Potion Supplies,${amount},CHF,Moonberry tonic,alchemy,Nova`,
  ].join("\n"));
}

test("file import requires input and reports partial batch failures without losing successes", async () => {
  await assert.rejects(() => importFiles([]), /Choose at least one XLSX or CSV file/);

  const payload = await importFiles([
    { name: "moon.csv", buffer: csv("Moon Purse") },
    { name: "unsupported.json", buffer: Buffer.from("{}") },
  ]);

  assert.equal(payload.successful, 1);
  assert.equal(payload.error, undefined);
  assert.deepEqual(payload.summary, {
    total: 1,
    imported: 1,
    duplicates: 0,
    replaced: 0,
    files: 1,
    failed: 1,
  });
  assert.deepEqual(payload.results.map((result) => ({ filename: result.filename, ok: result.ok })), [
    { filename: "moon.csv", ok: true },
    { filename: "unsupported.json", ok: false },
  ]);
  assert.match(String(payload.results[1].error), /Only .xlsx and .csv files/);
});

test("full import rejects empty, mixed-wallet, and repeated-wallet files independently", async () => {
  const header = Buffer.from("Date,Wallet,Type,Category name,Amount,Currency,Note,Labels,Author\n");
  const mixedWallets = Buffer.concat([
    csv("Crystal Vault"),
    Buffer.from("\n2026-07-02T08:00:00.000Z,Moon Purse,Expense,Dragon Feed,-8,CHF,,,Nova"),
  ]);
  const payload = await importFiles([
    { name: "empty.csv", buffer: header },
    { name: "mixed.csv", buffer: mixedWallets },
    { name: "crystal-first.csv", buffer: csv("Crystal Vault", -20) },
    { name: "crystal-second.csv", buffer: csv("Crystal Vault", -30) },
  ], { full: true });

  assert.equal(payload.successful, 1);
  assert.deepEqual(payload.summary, {
    total: 1,
    imported: 1,
    duplicates: 0,
    replaced: 0,
    files: 1,
    failed: 3,
  });
  assert.match(String(payload.results[0].error), /header-only file/);
  assert.match(String(payload.results[1].error), /exactly one wallet/);
  assert.equal(payload.results[2].ok, true);
  assert.match(String(payload.results[3].error), /appears in more than one full-import file/);
  assert.equal(
    (getDatabase().prepare("SELECT COUNT(*) AS count FROM transactions WHERE wallet = ?").get("Crystal Vault") as { count: number }).count,
    1,
  );
});

test("an entirely failed batch returns the first actionable error", async () => {
  const payload = await importFiles([
    { name: "ledger.json", buffer: Buffer.from("{}") },
    { name: "ledger.txt", buffer: Buffer.from("fantasy") },
  ]);

  assert.equal(payload.successful, 0);
  assert.equal(payload.summary.files, 0);
  assert.equal(payload.summary.failed, 2);
  assert.match(payload.error ?? "", /Only .xlsx and .csv files/);
});
