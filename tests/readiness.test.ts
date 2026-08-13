import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { after, test } from "node:test";
import {
  setActualAdapterForTests,
  type ActualAdapter,
  type ActualSnapshot,
} from "../lib/actual-adapter";

const databasePath = `/tmp/spendee-readiness-${crypto.randomUUID()}.db`;
process.env.SQLITE_PATH = databasePath;

const emptySnapshot: ActualSnapshot = {
  currency: "CHF",
  accounts: [],
  categories: [],
  tags: [],
  payees: [],
  transactions: [],
  budgetMonths: [],
  syncedAt: "2026-08-13T21:00:00.000Z",
};

let snapshotReads = 0;
const adapter: ActualAdapter = {
  async getSnapshot() {
    snapshotReads += 1;
    if (snapshotReads === 1) throw new Error("Temporary sync failure");
    return emptySnapshot;
  },
  async importTransactions() {
    return [];
  },
  invalidateSnapshot() {},
};

setActualAdapterForTests(adapter);

after(async () => {
  const { getDatabase } = await import("../lib/db");
  getDatabase().close();
  setActualAdapterForTests(null);
  for (const path of [
    databasePath,
    `${databasePath}-shm`,
    `${databasePath}-wal`,
  ]) {
    rmSync(path, { force: true });
  }
});

test("readiness retries startup failure then latches the successful Actual sync", async () => {
  const route = await import("../app/api/ready/route");

  assert.equal((await route.GET()).status, 503);
  assert.equal((await route.GET()).status, 200);
  assert.equal((await route.GET()).status, 200);
  assert.equal(snapshotReads, 2);
});
