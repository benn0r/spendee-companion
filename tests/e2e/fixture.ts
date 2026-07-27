import { test as base } from "@playwright/test";
import { openDatabase } from "../../lib/db";

const databasePath = "/tmp/spendee-playwright-fantasy.db";

function resetE2eDatabase() {
  const db = openDatabase(databasePath);
  try {
    // The browser projects share one server, so isolate each flow at the database
    // boundary instead of relying on filenames or execution order for cleanup.
    db.transaction(() => {
      db.prepare("DELETE FROM split_entries").run();
      db.prepare("DELETE FROM split_records").run();
      db.prepare("DELETE FROM duplicates").run();
      db.prepare("DELETE FROM transactions").run();
      db.prepare("DELETE FROM imports").run();
      db.prepare("DELETE FROM wallet_starting_balances").run();
      db.prepare("DELETE FROM category_tag_config").run();
      db.prepare("DELETE FROM monthly_report_columns").run();
      db.prepare("DELETE FROM app_settings").run();
      db.prepare("DELETE FROM validation_runs").run();
      db.prepare("DELETE FROM validation_description_blacklist").run();
    })();
  } finally {
    db.close();
  }
}

export const test = base.extend({
  page: async ({ page }, use) => {
    resetE2eDatabase();
    await use(page);
  },
});

export { expect } from "@playwright/test";
export type { Locator, Page } from "@playwright/test";
