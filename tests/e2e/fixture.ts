import { rmSync } from "node:fs";
import { test as base } from "@playwright/test";
import { openDatabase } from "../../lib/db";
import {
  actualMockDataPath,
  resetFantasyActualData,
} from "../support/fantasy-actual";

const databasePath = "/tmp/spendee-playwright-fantasy.db";
const receiptsPath = "/tmp/spendee-playwright-receipts";

function resetE2eDatabase() {
  resetFantasyActualData(actualMockDataPath);
  const db = openDatabase(databasePath);
  try {
    // Actual ledger state lives in the fantasy snapshot above. SQLite retains
    // only companion state, which is reset independently for every browser flow.
    db.transaction(() => {
      db.prepare("DELETE FROM split_entries").run();
      db.prepare("DELETE FROM split_records").run();
      db.prepare("DELETE FROM category_tag_config").run();
      db.prepare("DELETE FROM monthly_report_columns").run();
      db.prepare("DELETE FROM validation_manual_matches").run();
      db.prepare("DELETE FROM validation_runs").run();
      db.prepare("DELETE FROM validation_description_blacklist").run();
      db.prepare("DELETE FROM receipts").run();
    })();
  } finally {
    db.close();
  }
  rmSync(receiptsPath, { recursive: true, force: true });
}

export const test = base.extend({
  page: async ({ page }, use) => {
    resetE2eDatabase();
    await use(page);
  },
});

export { expect } from "@playwright/test";
export type { Locator, Page } from "@playwright/test";
