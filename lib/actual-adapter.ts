import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

/* node:coverage disable */
export type ActualAccountRecord = {
  id: string;
  name: string;
  offBudget: boolean;
  closed: boolean;
  balanceCents: number;
};

export type ActualCategoryRecord = {
  id: string;
  name: string;
  groupId: string;
  isIncome: boolean;
  hidden: boolean;
};

export type ActualTagRecord = {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
};

export type ActualPayeeRecord = {
  id: string;
  name: string;
  transferAccountId: string | null;
};

export type ActualTransactionRecord = {
  id: string;
  accountId: string;
  categoryId: string | null;
  payeeId: string | null;
  amountCents: number;
  date: string;
  notes: string | null;
  importedId: string | null;
  transferId: string | null;
  parentId: string | null;
  isParent: boolean;
  isChild: boolean;
  startingBalance: boolean;
  cleared: boolean;
  reconciled: boolean;
  sortOrder: number;
  subtransactions: ActualTransactionRecord[];
};

export type ActualSnapshot = {
  currency: string;
  accounts: ActualAccountRecord[];
  categories: ActualCategoryRecord[];
  tags: ActualTagRecord[];
  payees: ActualPayeeRecord[];
  transactions: ActualTransactionRecord[];
  budgetMonths: string[];
  syncedAt: string;
};

export type ActualImportTransaction = {
  account: string;
  date: string;
  amount: number;
  category?: string;
  payee?: string | null;
  imported_payee?: string;
  notes?: string;
  imported_id: string;
  cleared?: boolean;
};

export type ActualImportBatch = {
  accountId: string;
  transactions: ActualImportTransaction[];
};

export type ActualImportBatchResult = {
  accountId: string;
  addedIds: string[];
  updatedIds: string[];
  errors: string[];
};

export interface ActualAdapter {
  getSnapshot(options?: { forceSync?: boolean }): Promise<ActualSnapshot>;
  importTransactions(
    batches: ActualImportBatch[],
  ): Promise<ActualImportBatchResult[]>;
  updateTransactionAmount?(
    transactionId: string,
    amountCents: number,
  ): Promise<void>;
  invalidateSnapshot(): void;
}

export type ActualConfig = {
  serverUrl: string;
  password: string | null;
  sessionToken: string | null;
  dataDir: string;
  budgetId: string | null;
  syncId: string;
  budgetPassword: string | null;
  defaultCurrency: string | null;
  cacheTtlMs: number;
};
/* node:coverage enable */

const FIRST_ACTUAL_DATE = "0001-01-01";
const LAST_ACTUAL_DATE = "9999-12-31";
const DEFAULT_CACHE_TTL_MS = 5_000;

type ActualEnvironment = Readonly<Record<string, string | undefined>>;

function required(env: ActualEnvironment, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function optional(env: ActualEnvironment, name: string): string | null {
  return env[name]?.trim() || null;
}

export function readActualConfig(
  env: ActualEnvironment = process.env,
): ActualConfig {
  const serverUrl = required(env, "ACTUAL_SERVER_URL");
  let parsedServerUrl: URL;
  try {
    parsedServerUrl = new URL(serverUrl);
  } catch {
    throw new Error("ACTUAL_SERVER_URL must be a valid URL.");
  }
  if (!["http:", "https:"].includes(parsedServerUrl.protocol)) {
    throw new Error("ACTUAL_SERVER_URL must use HTTP or HTTPS.");
  }

  const password = optional(env, "ACTUAL_PASSWORD");
  const sessionToken = optional(env, "ACTUAL_SESSION_TOKEN");
  if (Boolean(password) === Boolean(sessionToken)) {
    throw new Error(
      "Configure exactly one of ACTUAL_PASSWORD or ACTUAL_SESSION_TOKEN.",
    );
  }

  const configuredCurrency = optional(env, "ACTUAL_DEFAULT_CURRENCY");
  const defaultCurrency = configuredCurrency?.toUpperCase() ?? null;
  if (defaultCurrency && !/^[A-Z]{3}$/.test(defaultCurrency)) {
    throw new Error("ACTUAL_DEFAULT_CURRENCY must be a three-letter code.");
  }

  const cacheTtlText = optional(env, "ACTUAL_CACHE_TTL_MS");
  const cacheTtlMs = cacheTtlText ? Number(cacheTtlText) : DEFAULT_CACHE_TTL_MS;
  if (!Number.isInteger(cacheTtlMs) || cacheTtlMs < 0 || cacheTtlMs > 60_000) {
    throw new Error(
      "ACTUAL_CACHE_TTL_MS must be a whole number from 0 through 60000.",
    );
  }

  return {
    serverUrl: parsedServerUrl.toString().replace(/\/$/, ""),
    password,
    sessionToken,
    dataDir: resolve(
      /* turbopackIgnore: true */ optional(env, "ACTUAL_DATA_DIR") ??
        "./data/actual",
    ),
    budgetId: optional(env, "ACTUAL_BUDGET_ID"),
    syncId: required(env, "ACTUAL_SYNC_ID"),
    budgetPassword:
      optional(env, "ACTUAL_BUDGET_ENCRYPTION_PASSWORD") ??
      optional(env, "ACTUAL_BUDGET_PASSWORD"),
    defaultCurrency,
    cacheTtlMs,
  };
}

export function resolveActualCurrency(
  configuredCurrency: string | null,
  preferenceCurrency: string | undefined,
): string {
  const configured = configuredCurrency?.trim().toUpperCase() || null;
  const preference = preferenceCurrency?.trim().toUpperCase() || null;
  if (configured && !/^[A-Z]{3}$/.test(configured)) {
    throw new Error("ACTUAL_DEFAULT_CURRENCY must be a three-letter code.");
  }
  if (preference && !/^[A-Z]{3}$/.test(preference)) {
    throw new Error(
      "Actual's default currency preference must be a three-letter code.",
    );
  }
  if (configured && preference && configured !== preference) {
    throw new Error(
      "ACTUAL_DEFAULT_CURRENCY does not match the budget's default currency.",
    );
  }
  const currency = configured ?? preference;
  if (!currency) {
    throw new Error(
      "Configure ACTUAL_DEFAULT_CURRENCY or set Actual's default currency preference.",
    );
  }
  return currency;
}

// The official client and cross-process file adapter are exercised by the
// browser/integration suite; unit tests inject `ActualAdapter` directly.
/* node:coverage disable */
type ActualApi = typeof import("@actual-app/api");

type InitializedActual = {
  api: ActualApi;
  config: ActualConfig;
};

type RuntimeState = {
  tail: Promise<void>;
  initialized?: Promise<InitializedActual>;
  snapshot?: { expiresAt: number; value: ActualSnapshot };
  refreshing?: Promise<ActualSnapshot>;
};

const RUNTIME_KEY = Symbol.for("spendee.actual-api.runtime.v1");

function runtimeState(): RuntimeState {
  const globals = globalThis as typeof globalThis & {
    [RUNTIME_KEY]?: RuntimeState;
  };
  globals[RUNTIME_KEY] ??= { tail: Promise.resolve() };
  return globals[RUNTIME_KEY];
}

function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const state = runtimeState();
  const result = state.tail.then(operation, operation);
  state.tail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function initializeActual(): Promise<InitializedActual> {
  const state = runtimeState();
  state.initialized ??= (async () => {
    const config = readActualConfig();
    mkdirSync(/* turbopackIgnore: true */ config.dataDir, { recursive: true });
    const api = await import("@actual-app/api");
    if (config.sessionToken) {
      await api.init({
        dataDir: config.dataDir,
        serverURL: config.serverUrl,
        sessionToken: config.sessionToken,
      });
    } else {
      await api.init({
        dataDir: config.dataDir,
        serverURL: config.serverUrl,
        password: config.password!,
      });
    }

    const budgets = await api.getBudgets();
    const localBudget = config.budgetId
      ? budgets.find((budget) => budget.id === config.budgetId)
      : budgets.find((budget) => budget.cloudFileId === config.syncId);
    if (localBudget?.id) {
      await api.loadBudget(localBudget.id);
    } else {
      await api.downloadBudget(config.syncId, {
        password: config.budgetPassword ?? undefined,
      });
    }
    return { api, config };
  })();
  return state.initialized;
}

function finiteInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`Actual returned an invalid ${label}.`);
  }
  return value;
}

function mapTransaction(
  transaction: Awaited<ReturnType<ActualApi["getTransactions"]>>[number],
  inheritedAccountId?: string,
): ActualTransactionRecord {
  const accountId = String(transaction.account || inheritedAccountId || "");
  if (!accountId)
    throw new Error("Actual returned a transaction without an account.");
  return {
    id: String(transaction.id),
    accountId,
    categoryId: transaction.category ? String(transaction.category) : null,
    payeeId: transaction.payee ? String(transaction.payee) : null,
    amountCents: finiteInteger(transaction.amount, "transaction amount"),
    date: String(transaction.date),
    notes: transaction.notes || null,
    importedId: transaction.imported_id || null,
    transferId: transaction.transfer_id || null,
    parentId: transaction.parent_id || null,
    isParent: transaction.is_parent === true,
    isChild: transaction.is_child === true,
    startingBalance: transaction.starting_balance_flag === true,
    cleared: transaction.cleared === true,
    reconciled: transaction.reconciled === true,
    sortOrder: transaction.sort_order ?? 0,
    subtransactions: (transaction.subtransactions ?? []).map((child) =>
      mapTransaction(child, accountId),
    ),
  };
}

async function readSnapshot(
  initialized: InitializedActual,
): Promise<ActualSnapshot> {
  const { api, config } = initialized;
  await api.sync();
  const [
    accounts,
    visibleCategories,
    hiddenCategories,
    tags,
    payees,
    budgetMonths,
    preferences,
  ] = await Promise.all([
    api.getAccounts(),
    api.getCategories(),
    api.getCategories({ hidden: true }),
    api.getTags(),
    api.getPayees(),
    api.getBudgetMonths(),
    api.getPreferences(),
  ]);
  const categories = Array.from(
    new Map(
      [...visibleCategories, ...hiddenCategories].map((category) => [
        category.id,
        category,
      ]),
    ).values(),
  );

  const currency = resolveActualCurrency(
    config.defaultCurrency,
    preferences.defaultCurrencyCode,
  );

  const [balances, transactionGroups] = await Promise.all([
    Promise.all(accounts.map((account) => api.getAccountBalance(account.id))),
    Promise.all(
      accounts.map((account) =>
        api.getTransactions(account.id, FIRST_ACTUAL_DATE, LAST_ACTUAL_DATE),
      ),
    ),
  ]);

  return {
    currency,
    accounts: accounts.map((account, index) => ({
      id: String(account.id),
      name: account.name,
      offBudget: account.offbudget === true,
      closed: account.closed === true,
      balanceCents: finiteInteger(balances[index], "account balance"),
    })),
    categories: categories.map((category) => ({
      id: String(category.id),
      name: category.name,
      groupId: String(category.group_id),
      isIncome: category.is_income === true,
      hidden: category.hidden === true,
    })),
    tags: tags.map((tag) => ({
      id: String(tag.id),
      name: tag.tag,
      color: tag.color || null,
      description: tag.description || null,
    })),
    payees: payees.map((payee) => ({
      id: String(payee.id),
      name: payee.name,
      transferAccountId: payee.transfer_acct || null,
    })),
    transactions: transactionGroups
      .flatMap((transactions) => transactions)
      .filter((transaction) => !transaction.tombstone && !transaction._deleted)
      .map((transaction) => mapTransaction(transaction)),
    budgetMonths: budgetMonths.slice().sort().reverse(),
    syncedAt: new Date().toISOString(),
  };
}

class OfficialActualAdapter implements ActualAdapter {
  async getSnapshot(
    options: { forceSync?: boolean } = {},
  ): Promise<ActualSnapshot> {
    const state = runtimeState();
    const now = Date.now();
    if (
      !options.forceSync &&
      state.snapshot &&
      state.snapshot.expiresAt > now
    ) {
      return state.snapshot.value;
    }
    if (state.refreshing) return state.refreshing;

    state.refreshing = serialized(async () => {
      const initialized = await initializeActual();
      const value = await readSnapshot(initialized);
      state.snapshot = {
        expiresAt: Date.now() + initialized.config.cacheTtlMs,
        value,
      };
      return value;
    }).finally(() => {
      state.refreshing = undefined;
    });
    return state.refreshing;
  }

  async importTransactions(
    batches: ActualImportBatch[],
  ): Promise<ActualImportBatchResult[]> {
    if (!batches.length) return [];
    return serialized(async () => {
      const state = runtimeState();
      state.snapshot = undefined;
      const { api } = await initializeActual();
      await api.sync();
      const results: ActualImportBatchResult[] = [];
      for (const batch of batches) {
        const result = await api.importTransactions(
          batch.accountId,
          batch.transactions,
          { defaultCleared: true, reimportDeleted: false },
        );
        results.push({
          accountId: batch.accountId,
          addedIds: result.added.map(String),
          updatedIds: result.updated.map(String),
          errors: result.errors.map((error) => error.message),
        });
      }
      await api.sync();
      state.snapshot = undefined;
      return results;
    });
  }

  async updateTransactionAmount(
    transactionId: string,
    amountCents: number,
  ): Promise<void> {
    await serialized(async () => {
      const state = runtimeState();
      state.snapshot = undefined;
      const { api } = await initializeActual();
      await api.sync();
      await api.updateTransaction(transactionId, { amount: amountCents });
      await api.sync();
      state.snapshot = undefined;
    });
  }

  invalidateSnapshot(): void {
    runtimeState().snapshot = undefined;
  }
}

function readMockDataPath(env: NodeJS.ProcessEnv = process.env): string | null {
  const configured = optional(env, "ACTUAL_MOCK_DATA_PATH");
  if (!configured) return null;
  if (!isAbsolute(configured) || !configured.endsWith(".json")) {
    throw new Error("ACTUAL_MOCK_DATA_PATH must be an absolute JSON path.");
  }
  return resolve(/* turbopackIgnore: true */ configured);
}

function readMockSnapshot(path: string): ActualSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(/* turbopackIgnore: true */ path, "utf8"));
  } catch (error) {
    throw new Error(
      `Could not read the Actual mock snapshot: ${error instanceof Error ? error.message : "invalid JSON"}`,
    );
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("The Actual mock snapshot must be a JSON object.");
  }
  const snapshot = parsed as Partial<ActualSnapshot>;
  if (
    typeof snapshot.currency !== "string" ||
    !Array.isArray(snapshot.accounts) ||
    !Array.isArray(snapshot.categories) ||
    !Array.isArray(snapshot.tags) ||
    !Array.isArray(snapshot.payees) ||
    !Array.isArray(snapshot.transactions) ||
    !Array.isArray(snapshot.budgetMonths) ||
    typeof snapshot.syncedAt !== "string"
  ) {
    throw new Error("The Actual mock snapshot is missing required fields.");
  }
  return snapshot as ActualSnapshot;
}

function writeMockSnapshot(path: string, snapshot: ActualSnapshot): void {
  mkdirSync(/* turbopackIgnore: true */ dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(
    /* turbopackIgnore: true */ temporaryPath,
    `${JSON.stringify(snapshot, null, 2)}\n`,
    {
      encoding: "utf8",
      mode: 0o600,
    },
  );
  renameSync(/* turbopackIgnore: true */ temporaryPath, path);
}

function deterministicMockId(kind: string, ...parts: string[]): string {
  const hex = createHash("sha256")
    .update(JSON.stringify([kind, ...parts]))
    .digest("hex")
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

/**
 * A cross-process test adapter backed by a JSON snapshot. It is selected only
 * through ACTUAL_MOCK_DATA_PATH and never initializes the official client.
 */
export class ActualMockFileAdapter implements ActualAdapter {
  constructor(private readonly path: string) {}

  async getSnapshot(): Promise<ActualSnapshot> {
    return readMockSnapshot(this.path);
  }

  async importTransactions(
    batches: ActualImportBatch[],
  ): Promise<ActualImportBatchResult[]> {
    return serialized(async () => {
      const snapshot = readMockSnapshot(this.path);
      const results: ActualImportBatchResult[] = [];

      for (const batch of batches) {
        const addedIds: string[] = [];
        const updatedIds: string[] = [];
        const errors: string[] = [];
        const account = snapshot.accounts.find(
          (candidate) => candidate.id === batch.accountId,
        );
        if (!account) {
          results.push({
            accountId: batch.accountId,
            addedIds,
            updatedIds,
            errors: [`Mock account ${batch.accountId} was not found.`],
          });
          continue;
        }

        for (const imported of batch.transactions) {
          if (imported.account !== batch.accountId) {
            errors.push(
              `Mock transaction ${imported.imported_id} targets a different account.`,
            );
            continue;
          }
          if (
            imported.category &&
            !snapshot.categories.some(
              (category) => category.id === imported.category,
            )
          ) {
            errors.push(
              `Mock category ${imported.category} was not found for ${imported.imported_id}.`,
            );
            continue;
          }

          let payeeId = imported.payee ?? null;
          if (
            payeeId &&
            !snapshot.payees.some((payee) => payee.id === payeeId)
          ) {
            errors.push(
              `Mock payee ${payeeId} was not found for ${imported.imported_id}.`,
            );
            continue;
          }
          if (!payeeId && imported.imported_payee?.trim()) {
            const payeeName = imported.imported_payee.trim();
            const existingPayee = snapshot.payees.find(
              (payee) =>
                payee.name.localeCompare(payeeName, undefined, {
                  sensitivity: "accent",
                }) === 0,
            );
            payeeId =
              existingPayee?.id ?? deterministicMockId("mock-payee", payeeName);
            if (!existingPayee) {
              snapshot.payees.push({
                id: payeeId,
                name: payeeName,
                transferAccountId: null,
              });
            }
          }

          const transactionIndex = snapshot.transactions.findIndex(
            (transaction) =>
              transaction.accountId === batch.accountId &&
              transaction.importedId === imported.imported_id,
          );
          const existing =
            transactionIndex >= 0
              ? snapshot.transactions[transactionIndex]
              : undefined;
          const id =
            existing?.id ??
            deterministicMockId(
              "mock-transaction",
              batch.accountId,
              imported.imported_id,
            );
          const amountCents = finiteInteger(
            imported.amount,
            "mock transaction amount",
          );
          const transaction: ActualTransactionRecord = {
            id,
            accountId: batch.accountId,
            categoryId: imported.category ?? null,
            payeeId,
            amountCents,
            date: imported.date,
            notes: imported.notes ?? null,
            importedId: imported.imported_id,
            transferId: null,
            parentId: null,
            isParent: false,
            isChild: false,
            startingBalance: false,
            cleared: imported.cleared ?? true,
            reconciled: false,
            sortOrder: existing?.sortOrder ?? snapshot.transactions.length,
            subtransactions: [],
          };

          account.balanceCents += amountCents - (existing?.amountCents ?? 0);
          if (existing) {
            snapshot.transactions[transactionIndex] = transaction;
            updatedIds.push(id);
          } else {
            snapshot.transactions.push(transaction);
            addedIds.push(id);
          }
          const month = imported.date.slice(0, 7);
          if (!snapshot.budgetMonths.includes(month)) {
            snapshot.budgetMonths.push(month);
          }
        }

        results.push({
          accountId: batch.accountId,
          addedIds,
          updatedIds,
          errors,
        });
      }

      snapshot.budgetMonths.sort().reverse();
      writeMockSnapshot(this.path, snapshot);
      return results;
    });
  }

  async updateTransactionAmount(
    transactionId: string,
    amountCents: number,
  ): Promise<void> {
    await serialized(async () => {
      const snapshot = readMockSnapshot(this.path);
      const transaction = snapshot.transactions.find(
        (candidate) => candidate.id === transactionId,
      );
      if (!transaction) {
        throw new Error(`Mock transaction ${transactionId} was not found.`);
      }
      const account = snapshot.accounts.find(
        (candidate) => candidate.id === transaction.accountId,
      );
      if (!account) {
        throw new Error(`Mock account ${transaction.accountId} was not found.`);
      }
      const nextAmount = finiteInteger(amountCents, "mock transaction amount");
      account.balanceCents += nextAmount - transaction.amountCents;
      transaction.amountCents = nextAmount;
      writeMockSnapshot(this.path, snapshot);
    });
  }

  invalidateSnapshot(): void {
    // Every read comes from disk so Playwright can reset state cross-process.
  }
}

const officialAdapter = new OfficialActualAdapter();
let testAdapter: ActualAdapter | null = null;
let mockAdapter: { path: string; value: ActualMockFileAdapter } | null = null;

export function getActualAdapter(): ActualAdapter {
  if (testAdapter) return testAdapter;
  const mockDataPath = readMockDataPath();
  if (!mockDataPath) return officialAdapter;
  if (mockAdapter?.path !== mockDataPath) {
    mockAdapter = {
      path: mockDataPath,
      value: new ActualMockFileAdapter(mockDataPath),
    };
  }
  return mockAdapter.value;
}
/* node:coverage enable */

/** Installs a deterministic adapter without loading or contacting Actual. */
export function setActualAdapterForTests(adapter: ActualAdapter | null): void {
  testAdapter = adapter;
}
