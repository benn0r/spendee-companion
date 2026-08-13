import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach, test } from "node:test";
import {
  setActualAdapterForTests,
  type ActualSnapshot,
} from "../lib/actual-adapter";
import { importFiles } from "../lib/import-service";
import {
  resetFantasyActualData,
  seedFantasyActualFromCsv,
} from "./support/fantasy-actual";

const directory = mkdtempSync(join(tmpdir(), "spendee-import-service-"));
const actualDataPath = join(directory, "actual.json");
process.env.ACTUAL_MOCK_DATA_PATH = actualDataPath;

after(() => {
  setActualAdapterForTests(null);
  rmSync(directory, { recursive: true, force: true });
});

beforeEach(() => {
  resetFantasyActualData(actualDataPath);
  setActualAdapterForTests(null);
});

function csv(wallet: string, amount = -12) {
  return Buffer.from(
    [
      "Date,Wallet,Type,Category name,Amount,Currency,Note,Labels,Author",
      `2026-07-01T08:00:00.000Z,${wallet},Expense,Potion Supplies,${amount},CHF,Moonberry tonic,alchemy,Nova`,
    ].join("\n"),
  );
}

test("file import requires input and reports partial batch failures without losing successes", async () => {
  await assert.rejects(
    () => importFiles([]),
    /Choose at least one XLSX or CSV file/,
  );

  seedFantasyActualFromCsv(csv("Moon Purse").toString("utf8"), actualDataPath);
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
  assert.deepEqual(
    payload.results.map((result) => ({
      filename: result.filename,
      ok: result.ok,
    })),
    [
      { filename: "moon.csv", ok: true },
      { filename: "unsupported.json", ok: false },
    ],
  );
  assert.match(String(payload.results[1].error), /Only .xlsx and .csv files/);
});

test("full import rejects empty, mixed-wallet, and repeated-wallet files independently", async () => {
  const header = Buffer.from(
    "Date,Wallet,Type,Category name,Amount,Currency,Note,Labels,Author\n",
  );
  const mixedWallets = Buffer.concat([
    csv("Crystal Vault"),
    Buffer.from(
      "\n2026-07-02T08:00:00.000Z,Moon Purse,Expense,Dragon Feed,-8,CHF,,,Nova",
    ),
  ]);
  seedFantasyActualFromCsv(
    csv("Crystal Vault", -20).toString("utf8"),
    actualDataPath,
  );
  const payload = await importFiles(
    [
      { name: "empty.csv", buffer: header },
      { name: "mixed.csv", buffer: mixedWallets },
      { name: "crystal-first.csv", buffer: csv("Crystal Vault", -20) },
      { name: "crystal-second.csv", buffer: csv("Crystal Vault", -30) },
    ],
    { full: true },
  );

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
  assert.match(
    String(payload.results[3].error),
    /appears in more than one full-import file/,
  );
  const snapshot = JSON.parse(
    readFileSync(actualDataPath, "utf8"),
  ) as ActualSnapshot;
  const crystalAccount = snapshot.accounts.find(
    (account) => account.name === "Crystal Vault",
  );
  assert.ok(crystalAccount);
  assert.equal(
    snapshot.transactions.filter(
      (transaction) =>
        transaction.accountId === crystalAccount.id &&
        !transaction.startingBalance,
    ).length,
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
