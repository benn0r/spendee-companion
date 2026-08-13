import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  getActualAdapter,
  setActualAdapterForTests,
} from "../lib/actual-adapter";
import { createFantasyActualSnapshot } from "./support/fantasy-actual";

test("ACTUAL_MOCK_DATA_PATH selects a deterministic writable adapter", async () => {
  const directory = mkdtempSync(join(tmpdir(), "spendee-actual-mock-"));
  const path = join(directory, "snapshot.json");
  const previousPath = process.env.ACTUAL_MOCK_DATA_PATH;
  writeFileSync(path, JSON.stringify(createFantasyActualSnapshot()));
  process.env.ACTUAL_MOCK_DATA_PATH = path;
  setActualAdapterForTests(null);

  try {
    const adapter = getActualAdapter();
    const [result] = await adapter.importTransactions([
      {
        accountId: "style-audit-wallet",
        transactions: [
          {
            account: "style-audit-wallet",
            category: "style-audit-category",
            amount: -2_500,
            date: "2026-08-12",
            imported_payee: "Comet Cafe",
            notes: "Moonberry lunch #cosmic",
            imported_id: "fantasy:moonberry-lunch",
            cleared: true,
          },
        ],
      },
    ]);

    assert.equal(result.errors.length, 0);
    assert.equal(result.addedIds.length, 1);
    const importedId = result.addedIds[0];
    assert.match(
      importedId,
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-8[a-f0-9]{3}-[a-f0-9]{12}$/,
    );

    const imported = (await adapter.getSnapshot()).transactions.find(
      (transaction) => transaction.id === importedId,
    );
    assert.deepEqual(
      imported && {
        accountId: imported.accountId,
        amountCents: imported.amountCents,
        categoryId: imported.categoryId,
        importedId: imported.importedId,
      },
      {
        accountId: "style-audit-wallet",
        amountCents: -2_500,
        categoryId: "style-audit-category",
        importedId: "fantasy:moonberry-lunch",
      },
    );

    await adapter.updateTransactionAmount?.(importedId, -2_000);
    const updated = await adapter.getSnapshot();
    assert.equal(
      updated.transactions.find((transaction) => transaction.id === importedId)
        ?.amountCents,
      -2_000,
    );
    assert.equal(
      updated.accounts.find((account) => account.id === "style-audit-wallet")
        ?.balanceCents,
      -3_200,
    );
  } finally {
    if (previousPath === undefined) delete process.env.ACTUAL_MOCK_DATA_PATH;
    else process.env.ACTUAL_MOCK_DATA_PATH = previousPath;
    setActualAdapterForTests(null);
    rmSync(directory, { recursive: true, force: true });
  }
});
