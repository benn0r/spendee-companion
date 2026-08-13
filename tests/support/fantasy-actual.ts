import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parse } from "csv-parse/sync";
import type { ActualSnapshot } from "../../lib/actual-adapter";

export const actualMockDataPath = "/tmp/spendee-playwright-fantasy-actual.json";

const fixedSyncedAt = "2026-08-13T10:00:00.000Z";
const tagColors = [
  "#45b29d",
  "#efc94c",
  "#e27a3f",
  "#df5a49",
  "#5f91b8",
  "#e2a37f",
  "#55dbc1",
  "#efda97",
  "#df948a",
];

function stableId(kind: string, name: string): string {
  return `${kind}-${createHash("sha256")
    .update(name.trim().normalize("NFC"))
    .digest("hex")
    .slice(0, 20)}`;
}

function normalized(value: string): string {
  return value.trim().normalize("NFC").toLocaleLowerCase("en");
}

export function createFantasyActualSnapshot(): ActualSnapshot {
  return {
    currency: "CHF",
    accounts: [
      {
        id: "style-audit-wallet",
        name: "Style Audit Wallet",
        offBudget: false,
        closed: false,
        balanceCents: -1_200,
      },
    ],
    categories: [
      {
        id: "style-audit-category",
        name: "Style Audit Category",
        groupId: "fantasy-expenses",
        isIncome: false,
        hidden: false,
      },
      {
        id: "fantasy-category-quest-rewards",
        name: "Quest Rewards",
        groupId: "fantasy-income",
        isIncome: true,
        hidden: false,
      },
    ],
    tags: [
      {
        id: "fantasy-tag-cosmic",
        name: "cosmic",
        color: tagColors[0],
        description: "Fantasy data for browser tests",
      },
    ],
    payees: [
      {
        id: "fantasy-payee-stationer",
        name: "Astral Stationer",
        transferAccountId: null,
      },
    ],
    transactions: [
      {
        id: "style-audit-transaction",
        accountId: "style-audit-wallet",
        categoryId: "style-audit-category",
        payeeId: "fantasy-payee-stationer",
        amountCents: -1_200,
        date: "2026-08-01",
        notes: "Astral stationery #cosmic",
        importedId: "fantasy:style-audit",
        transferId: null,
        parentId: null,
        isParent: false,
        isChild: false,
        startingBalance: false,
        cleared: true,
        reconciled: false,
        sortOrder: 0,
        subtransactions: [],
      },
    ],
    budgetMonths: ["2026-08", "2026-07", "2026-06"],
    syncedAt: fixedSyncedAt,
  };
}

function writeSnapshot(path: string, snapshot: ActualSnapshot): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  renameSync(temporaryPath, path);
}

export function resetFantasyActualData(
  path: string = actualMockDataPath,
): void {
  writeSnapshot(path, createFantasyActualSnapshot());
}

function readSnapshot(path: string): ActualSnapshot {
  return JSON.parse(readFileSync(path, "utf8")) as ActualSnapshot;
}

type CsvRow = Record<string, string | undefined>;

function parseCsv(csv: string): CsvRow[] {
  const header = csv.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [",", ";", "\t"].reduce(
    (best, candidate) => {
      const matches = header.split(candidate).length - 1;
      return matches > best.matches ? { value: candidate, matches } : best;
    },
    { value: ",", matches: -1 },
  ).value;
  return parse(csv, {
    bom: true,
    columns: true,
    delimiter,
    relax_column_count: true,
    skip_empty_lines: true,
  }) as CsvRow[];
}

/**
 * Actual requires accounts and categories to exist before an import. Browser
 * tests seed those reference records from their fantasy CSV before uploading.
 */
export function seedFantasyActualFromCsv(
  csv: string,
  path: string = actualMockDataPath,
): void {
  const snapshot = readSnapshot(path);
  const accountNames = new Set(
    snapshot.accounts.map((item) => normalized(item.name)),
  );
  const categories = new Map(
    snapshot.categories.map((item) => [normalized(item.name), item]),
  );
  const tagNames = new Set(snapshot.tags.map((item) => normalized(item.name)));
  const months = new Set(snapshot.budgetMonths);

  for (const row of parseCsv(csv)) {
    const accountName = row.Wallet?.trim();
    if (accountName && !accountNames.has(normalized(accountName))) {
      accountNames.add(normalized(accountName));
      const accountId = stableId("fantasy-account", accountName);
      snapshot.accounts.push({
        id: accountId,
        name: accountName,
        offBudget: false,
        closed: false,
        balanceCents: 0,
      });
      snapshot.transactions.push({
        id: stableId("fantasy-starting-balance", accountName),
        accountId,
        categoryId: null,
        payeeId: null,
        amountCents: 0,
        date: "1970-01-01",
        notes: "Starting Balance",
        importedId: `fantasy:starting-balance:${accountId}`,
        transferId: null,
        parentId: null,
        isParent: false,
        isChild: false,
        startingBalance: true,
        cleared: true,
        reconciled: true,
        sortOrder: -1,
        subtransactions: [],
      });
    }

    const categoryName = row["Category name"]?.trim();
    if (categoryName) {
      const key = normalized(categoryName);
      const income = normalized(row.Type ?? "") === "income";
      const existing = categories.get(key);
      if (existing) {
        existing.isIncome ||= income;
      } else {
        const category = {
          id: stableId("fantasy-category", categoryName),
          name: categoryName,
          groupId: income ? "fantasy-income" : "fantasy-expenses",
          isIncome: income,
          hidden: false,
        };
        categories.set(key, category);
        snapshot.categories.push(category);
      }
    }

    for (const rawTag of row.Labels?.split(/[,;]/) ?? []) {
      const tagName = rawTag.trim().replace(/^#/, "");
      if (!tagName || tagNames.has(normalized(tagName))) continue;
      tagNames.add(normalized(tagName));
      snapshot.tags.push({
        id: stableId("fantasy-tag", tagName),
        name: tagName,
        color: tagColors[snapshot.tags.length % tagColors.length],
        description: null,
      });
    }

    const month = row.Date?.trim().slice(0, 7);
    if (month && /^\d{4}-\d{2}$/.test(month)) months.add(month);
  }

  snapshot.budgetMonths = Array.from(months).sort().reverse();
  writeSnapshot(path, snapshot);
}
