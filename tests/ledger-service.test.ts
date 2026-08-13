import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  readActualConfig,
  resolveActualCurrency,
  setActualAdapterForTests,
  type ActualAdapter,
  type ActualImportBatch,
  type ActualSnapshot,
} from "../lib/actual-adapter";
import {
  actualDateToUiDate,
  amountToCents,
  appendActualTags,
  filterLedgerTransactions,
  getLedgerAccount,
  getLedgerAccountSummaries,
  getLedgerCategory,
  getLedgerFilterOptions,
  getLedgerMonthlyCategoryTotals,
  getLedgerSnapshot,
  getLedgerStats,
  getLedgerTransactionPage,
  importSpendeeTransactions,
  normalizeActualSnapshot,
  parseActualTagTokens,
  prepareSpendeeImportBatches,
  setLedgerStartingBalance,
  spendeeImportedId,
  stripActualTagTokens,
} from "../lib/ledger-service";
import type { TransactionInput } from "../lib/types";

function rawSnapshot(): ActualSnapshot {
  return {
    currency: "CHF",
    accounts: [
      {
        id: "account-wallet",
        name: "Moon Wallet",
        offBudget: false,
        closed: false,
        balanceCents: 11_975,
      },
      {
        id: "account-vault",
        name: "Cloud Vault",
        offBudget: true,
        closed: false,
        balanceCents: 50_000,
      },
    ],
    categories: [
      {
        id: "category-food",
        name: "Stardust Snacks",
        groupId: "group-needs",
        isIncome: false,
        hidden: false,
      },
      {
        id: "category-travel",
        name: "Portal Travel",
        groupId: "group-needs",
        isIncome: false,
        hidden: false,
      },
      {
        id: "category-hidden",
        name: "Ancient Fees",
        groupId: "group-hidden",
        isIncome: false,
        hidden: true,
      },
    ],
    tags: [
      {
        id: "tag-Quest",
        name: "Quest",
        color: "#ffaa00",
        description: "Guild work",
      },
      {
        id: "tag-quest",
        name: "quest",
        color: null,
        description: null,
      },
      {
        id: "tag-team",
        name: "team",
        color: null,
        description: null,
      },
    ],
    payees: [
      {
        id: "payee-bakery",
        name: "Comet Bakery",
        transferAccountId: null,
      },
      {
        id: "payee-transfer",
        name: "Transfer: Cloud Vault",
        transferAccountId: "account-vault",
      },
    ],
    transactions: [
      {
        id: "transaction-expense",
        accountId: "account-wallet",
        categoryId: "category-food",
        payeeId: "payee-bakery",
        amountCents: -2_405,
        date: "2026-08-12",
        notes: "Nebula lunch #Quest #quest #Quest",
        importedId: "bank:expense",
        transferId: null,
        parentId: null,
        isParent: false,
        isChild: false,
        startingBalance: false,
        cleared: true,
        reconciled: false,
        sortOrder: 2,
        subtransactions: [],
      },
      {
        id: "transaction-income",
        accountId: "account-wallet",
        categoryId: null,
        payeeId: null,
        amountCents: 15_000,
        date: "2026-08-11",
        notes: "Dragon bounty #team",
        importedId: null,
        transferId: null,
        parentId: null,
        isParent: false,
        isChild: false,
        startingBalance: false,
        cleared: false,
        reconciled: false,
        sortOrder: 1,
        subtransactions: [],
      },
      {
        id: "transaction-transfer",
        accountId: "account-wallet",
        categoryId: "category-food",
        payeeId: "payee-transfer",
        amountCents: -1_000,
        date: "2026-07-30",
        notes: null,
        importedId: null,
        transferId: "transaction-transfer-peer",
        parentId: null,
        isParent: false,
        isChild: false,
        startingBalance: false,
        cleared: true,
        reconciled: true,
        sortOrder: 0,
        subtransactions: [],
      },
      {
        id: "transaction-split",
        accountId: "account-vault",
        categoryId: null,
        payeeId: null,
        amountCents: -3_000,
        date: "2026-07-15",
        notes: "Expedition #team",
        importedId: null,
        transferId: null,
        parentId: null,
        isParent: true,
        isChild: false,
        startingBalance: false,
        cleared: true,
        reconciled: false,
        sortOrder: 0,
        subtransactions: [
          {
            id: "transaction-split-food",
            accountId: "account-vault",
            categoryId: "category-food",
            payeeId: null,
            amountCents: -1_000,
            date: "2026-07-15",
            notes: "Rations #Quest",
            importedId: null,
            transferId: null,
            parentId: "transaction-split",
            isParent: false,
            isChild: true,
            startingBalance: false,
            cleared: true,
            reconciled: false,
            sortOrder: 0,
            subtransactions: [],
          },
          {
            id: "transaction-split-travel",
            accountId: "account-vault",
            categoryId: "category-travel",
            payeeId: null,
            amountCents: -2_000,
            date: "2026-07-15",
            notes: "Portal fee",
            importedId: null,
            transferId: null,
            parentId: "transaction-split",
            isParent: false,
            isChild: true,
            startingBalance: false,
            cleared: true,
            reconciled: false,
            sortOrder: 0,
            subtransactions: [],
          },
        ],
      },
      {
        id: "transaction-starting",
        accountId: "account-wallet",
        categoryId: null,
        payeeId: null,
        amountCents: 2_000,
        date: "2026-01-01",
        notes: "Starting Balance",
        importedId: null,
        transferId: null,
        parentId: null,
        isParent: false,
        isChild: false,
        startingBalance: true,
        cleared: true,
        reconciled: true,
        sortOrder: 0,
        subtransactions: [],
      },
    ],
    budgetMonths: ["2026-08", "2026-07", "2026-06"],
    syncedAt: "2026-08-13T10:00:00.000Z",
  };
}

class FakeActualAdapter implements ActualAdapter {
  batches: ActualImportBatch[] = [];
  snapshotReads = 0;
  invalidations = 0;
  updates: Array<{ id: string; amountCents: number }> = [];

  constructor(private readonly snapshot: ActualSnapshot) {}

  async getSnapshot(): Promise<ActualSnapshot> {
    this.snapshotReads += 1;
    return structuredClone(this.snapshot);
  }

  async importTransactions(batches: ActualImportBatch[]) {
    this.batches = structuredClone(batches);
    return batches.map((batch) => ({
      accountId: batch.accountId,
      addedIds: batch.transactions.map(
        (transaction) => transaction.imported_id,
      ),
      updatedIds: [],
      errors: [],
    }));
  }

  async updateTransactionAmount(id: string, amountCents: number) {
    this.updates.push({ id, amountCents });
  }

  invalidateSnapshot(): void {
    this.invalidations += 1;
  }
}

afterEach(() => setActualAdapterForTests(null));

test("Actual configuration is validated without embedding deployment values", () => {
  const config = readActualConfig({
    ACTUAL_SERVER_URL: "https://budget.example.test/",
    ACTUAL_SESSION_TOKEN: "fantasy-session",
    ACTUAL_DATA_DIR: "./data/fantasy-actual",
    ACTUAL_BUDGET_ID: "fantasy-budget",
    ACTUAL_SYNC_ID: "fantasy-sync",
    ACTUAL_BUDGET_ENCRYPTION_PASSWORD: "canonical-secret",
    ACTUAL_BUDGET_PASSWORD: "legacy-secret",
    ACTUAL_CACHE_TTL_MS: "1234",
  });
  assert.equal(config.serverUrl, "https://budget.example.test");
  assert.equal(config.password, null);
  assert.equal(config.sessionToken, "fantasy-session");
  assert.equal(config.defaultCurrency, null);
  assert.equal(config.budgetPassword, "canonical-secret");
  assert.equal(config.cacheTtlMs, 1234);
  assert.equal(resolveActualCurrency(null, "chf"), "CHF");
  assert.equal(resolveActualCurrency("chf", undefined), "CHF");
  assert.throws(() => resolveActualCurrency(null, undefined), /Configure/);
  assert.throws(() => resolveActualCurrency("CHF", "EUR"), /does not match/);
  assert.throws(() => resolveActualCurrency(null, "francs"), /three-letter/);

  const passwordConfig = readActualConfig({
    ACTUAL_SERVER_URL: "http://budget.example.test",
    ACTUAL_PASSWORD: "fantasy-password",
    ACTUAL_SYNC_ID: "fantasy-sync",
    ACTUAL_BUDGET_PASSWORD: "legacy-secret",
    ACTUAL_DEFAULT_CURRENCY: "chf",
  });
  assert.equal(passwordConfig.defaultCurrency, "CHF");
  assert.equal(passwordConfig.budgetPassword, "legacy-secret");
  assert.equal(passwordConfig.cacheTtlMs, 5_000);

  assert.throws(
    () =>
      readActualConfig({
        ACTUAL_SERVER_URL: "not a URL",
        ACTUAL_PASSWORD: "fantasy-password",
        ACTUAL_SYNC_ID: "fantasy-sync",
      }),
    /valid URL/,
  );

  assert.throws(
    () =>
      readActualConfig({
        ACTUAL_SERVER_URL: "file:///budget",
        ACTUAL_PASSWORD: "fantasy-password",
        ACTUAL_SYNC_ID: "fantasy-sync",
      }),
    /HTTP or HTTPS/,
  );
  assert.throws(
    () =>
      readActualConfig({
        ACTUAL_SERVER_URL: "https://budget.example.test",
        ACTUAL_PASSWORD: "fantasy-password",
        ACTUAL_SESSION_TOKEN: "fantasy-session",
        ACTUAL_SYNC_ID: "fantasy-sync",
      }),
    /exactly one/,
  );
  assert.throws(
    () =>
      readActualConfig({
        ACTUAL_SERVER_URL: "https://budget.example.test",
        ACTUAL_PASSWORD: "fantasy-password",
        ACTUAL_SYNC_ID: "fantasy-sync",
        ACTUAL_DEFAULT_CURRENCY: "francs",
      }),
    /three-letter code/,
  );
  assert.throws(
    () =>
      readActualConfig({
        ACTUAL_SERVER_URL: "https://budget.example.test",
        ACTUAL_PASSWORD: "fantasy-password",
        ACTUAL_SYNC_ID: "fantasy-sync",
        ACTUAL_CACHE_TTL_MS: "60001",
      }),
    /0 through 60000/,
  );
});

test("normalization preserves Actual IDs, cents, dates, payees, and exact-case tags", () => {
  assert.equal(actualDateToUiDate("2026-08-12"), "2026-08-12T12:00:00.000Z");
  assert.throws(() => actualDateToUiDate("2026-02-30"), /invalid/);
  assert.equal(amountToCents(-24.05), -2405);
  assert.throws(() => amountToCents(Number.POSITIVE_INFINITY), /finite/);
  assert.deepEqual(
    parseActualTagTokens("Text #Quest #quest #Quest ##ignored"),
    ["Quest", "quest"],
  );
  assert.equal(
    stripActualTagTokens("Nebula lunch #Quest #quest"),
    "Nebula lunch",
  );
  assert.equal(
    appendActualTags("Already #Quest", ["Quest", "quest"]),
    "Already #Quest #quest",
  );

  const snapshot = normalizeActualSnapshot(rawSnapshot());
  const expense = snapshot.transactions[0];
  assert.equal(expense.id, "transaction-expense");
  assert.equal(
    expense.fingerprint,
    "actual-import:account-wallet:bank:expense",
  );
  assert.equal(expense.date, "2026-08-12T12:00:00.000Z");
  assert.equal(expense.amount, -24.05);
  assert.equal(expense.wallet, "Moon Wallet");
  assert.equal(expense.categoryName, "Stardust Snacks");
  assert.equal(expense.payeeName, "Comet Bakery");
  assert.equal(expense.type, "Expense");
  assert.equal(expense.note, "Nebula lunch");
  assert.deepEqual(expense.tags, [
    { id: "tag-Quest", name: "Quest" },
    { id: "tag-quest", name: "quest" },
  ]);
  assert.equal(snapshot.transactions[1].type, "Income");
  assert.equal(
    snapshot.transactions[1].fingerprint,
    "actual-id:transaction-income",
  );
  assert.equal(snapshot.transactions[2].type, "Transfer");
  assert.deepEqual(
    snapshot.transactions[3].subtransactions.map((row) => [
      row.id,
      row.categoryName,
      row.amount,
    ]),
    [
      ["transaction-split-food", "Stardust Snacks", -10],
      ["transaction-split-travel", "Portal Travel", -20],
    ],
  );
});

test("validation fingerprints survive Actual row replacement and remain account-scoped", () => {
  const original = rawSnapshot();
  const replacement = rawSnapshot();
  replacement.transactions[0].id = "replacement-expense-row";
  const movedToAnotherAccount = rawSnapshot();
  movedToAnotherAccount.transactions[0].accountId = "account-vault";

  const originalExpense = normalizeActualSnapshot(original).transactions[0];
  const replacementExpense =
    normalizeActualSnapshot(replacement).transactions[0];
  const movedExpense = normalizeActualSnapshot(movedToAnotherAccount)
    .transactions[0];

  assert.notEqual(originalExpense.id, replacementExpense.id);
  assert.equal(originalExpense.fingerprint, replacementExpense.fingerprint);
  assert.notEqual(originalExpense.fingerprint, movedExpense.fingerprint);
});

test("pure ledger queries cover filters, pagination, accounts, categories, and months", () => {
  const snapshot = normalizeActualSnapshot(rawSnapshot());
  assert.deepEqual(getLedgerStats(snapshot), {
    transactions: 4,
    accounts: 2,
    wallets: 2,
    categories: 3,
    tags: 3,
    duplicates: 0,
    imports: 0,
  });
  assert.deepEqual(getLedgerFilterOptions(snapshot).types, [
    "Expense",
    "Income",
    "Transfer",
  ]);
  assert.equal(
    getLedgerFilterOptions(snapshot).payees.includes("Comet Bakery"),
    true,
  );
  assert.equal(
    getLedgerFilterOptions(snapshot).payees.includes("Transfer: Cloud Vault"),
    false,
  );
  assert.deepEqual(
    filterLedgerTransactions(snapshot, { tags: ["quest"] }).map(
      (row) => row.id,
    ),
    ["transaction-expense"],
  );
  assert.deepEqual(
    filterLedgerTransactions(snapshot, {
      categoryIds: ["category-travel"],
    }).map((row) => row.id),
    ["transaction-split"],
  );
  assert.deepEqual(
    filterLedgerTransactions(snapshot, {
      accountIds: ["account-wallet"],
      dateFrom: "2026-08-01",
      amountOperator: "gt",
      amount: 25,
    }).map((row) => row.id),
    ["transaction-income"],
  );
  assert.deepEqual(
    filterLedgerTransactions(snapshot, {
      wallets: ["Moon Wallet"],
      types: ["Expense"],
      categories: ["Stardust Snacks"],
      payees: ["Comet Bakery"],
      amountOperator: "eq",
      amount: 24.05,
      dateTo: "2026-08-12",
    }).map((row) => row.id),
    ["transaction-expense"],
  );
  assert.deepEqual(
    filterLedgerTransactions(snapshot, {
      amountOperator: "lt",
      amount: 11,
    }).map((row) => row.id),
    ["transaction-transfer"],
  );
  assert.deepEqual(
    filterLedgerTransactions(snapshot, { authors: ["Nobody"] }),
    [],
  );

  const page = getLedgerTransactionPage(snapshot, {}, 1, 2);
  assert.equal(page.total, 4);
  assert.equal(page.pages, 2);
  assert.deepEqual(
    page.rows.map((row) => row.id),
    ["transaction-expense", "transaction-income"],
  );
  assert.deepEqual(page.dayTotals["2026-08-12"], [
    { currency: "CHF", total: -24.05 },
  ]);
  assert.deepEqual(
    getLedgerTransactionPage(snapshot, {}, Number.NaN, Number.NaN).rows.length,
    4,
  );

  const summaries = getLedgerAccountSummaries(snapshot);
  assert.equal(summaries[0].id, "account-wallet");
  assert.equal(summaries[0].totals[0].startingAmount, 20);
  assert.equal(summaries[0].totals[0].transactionTotal, 115.95);
  assert.equal(summaries[0].totals[0].total, 119.75);
  assert.equal(getLedgerAccount(snapshot, "missing"), null);
  assert.equal(
    getLedgerAccount(snapshot, "account-vault")?.rows[0].id,
    "transaction-split",
  );

  const category = getLedgerCategory(snapshot, "category-food", {}, 1, 25);
  assert.ok(category);
  assert.equal(category.total, 3);
  assert.equal(
    category.rows.find((row) => row.id === "transaction-split")?.amount,
    -10,
  );
  assert.equal(getLedgerCategory(snapshot, "missing"), null);

  const constrainedCategory = getLedgerCategory(
    snapshot,
    "category-food",
    { accountIds: ["account-wallet"] },
    9,
    Number.NaN,
  );
  assert.equal(constrainedCategory?.page, 1);
  assert.equal(constrainedCategory?.pageSize, 25);
  assert.equal(constrainedCategory?.total, 2);

  const monthly = getLedgerMonthlyCategoryTotals(snapshot);
  assert.deepEqual(monthly.months, [
    "2026-08",
    "2026-07",
    "2026-06",
    "2026-01",
  ]);
  assert.deepEqual(
    monthly.totals
      .filter((row) => row.month === "2026-07")
      .map((row) => [row.categoryId, row.amount]),
    [
      ["category-travel", -20],
      ["category-food", -20],
    ],
  );
});

test("Spendee import resolves Actual entities, validates currency, and uses stable IDs", async () => {
  const snapshot = normalizeActualSnapshot(rawSnapshot());
  const transaction: TransactionInput = {
    date: "2026-08-12T23:30:00+02:00",
    wallet: "moon wallet",
    type: "Expense",
    categoryName: "stardust snacks",
    amount: -24.05,
    currency: "chf",
    note: "Comet Bakery",
    labels: "Quest,quest,team",
    author: "Fantasy User",
  };
  const batches = prepareSpendeeImportBatches(snapshot, [{ transaction }]);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].accountId, "account-wallet");
  assert.deepEqual(batches[0].transactions[0], {
    account: "account-wallet",
    date: "2026-08-12",
    amount: -2405,
    category: "category-food",
    payee: "payee-bakery",
    imported_payee: "Comet Bakery",
    notes: "Comet Bakery #Quest #quest #team",
    imported_id: spendeeImportedId(transaction),
    cleared: true,
  });
  assert.equal(
    spendeeImportedId(transaction),
    spendeeImportedId(structuredClone(transaction)),
  );
  assert.throws(
    () =>
      prepareSpendeeImportBatches(snapshot, [
        { transaction: { ...transaction, currency: "EUR" } },
      ]),
    /ACTUAL_DEFAULT_CURRENCY/,
  );
  assert.throws(
    () =>
      prepareSpendeeImportBatches(snapshot, [
        { transaction: { ...transaction, wallet: "Unknown" } },
      ]),
    /was not found/,
  );

  const adapter = new FakeActualAdapter(rawSnapshot());
  setActualAdapterForTests(adapter);
  const injected = await getLedgerSnapshot();
  assert.equal(injected.transactions.length, 5);
  const result = await importSpendeeTransactions([{ transaction }]);
  assert.equal(result.total, 1);
  assert.equal(result.added, 1);
  assert.equal(result.updated, 0);
  assert.equal(adapter.snapshotReads, 2);
  assert.equal(
    adapter.batches[0].transactions[0].imported_id,
    result.batches[0].addedIds[0],
  );

  const balance = await setLedgerStartingBalance(
    injected,
    "account-wallet",
    "chf",
    42.5,
    adapter,
  );
  assert.deepEqual(balance, {
    accountId: "account-wallet",
    wallet: "Moon Wallet",
    currency: "CHF",
    startingAmount: 42.5,
  });
  assert.deepEqual(adapter.updates, [
    { id: "transaction-starting", amountCents: 4250 },
  ]);
  assert.equal(adapter.invalidations, 1);
  await assert.rejects(
    () => setLedgerStartingBalance(injected, "missing", "CHF", 1, adapter),
    /Account not found/,
  );
  await assert.rejects(
    () =>
      setLedgerStartingBalance(injected, "account-wallet", "EUR", 1, adapter),
    /currency not found/,
  );
  await assert.rejects(
    () =>
      setLedgerStartingBalance(injected, "account-vault", "CHF", 1, adapter),
    /does not have/,
  );
  await assert.rejects(
    () =>
      setLedgerStartingBalance(injected, "account-wallet", "CHF", 1, {
        getSnapshot: () => Promise.resolve(rawSnapshot()),
        importTransactions: () => Promise.resolve([]),
        invalidateSnapshot: () => undefined,
      }),
    /cannot update/,
  );
});
