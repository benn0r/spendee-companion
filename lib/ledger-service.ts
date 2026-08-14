import { createHash } from "node:crypto";
import { calculateDayTotals } from "./day-groups";
import type { TransactionInput } from "./types";
import {
  getActualAdapter,
  type ActualAdapter,
  type ActualImportBatch,
  type ActualImportBatchResult,
  type ActualSnapshot,
  type ActualTransactionRecord,
} from "./actual-adapter";

/* node:coverage disable */
export type LedgerAccount = {
  id: string;
  name: string;
  offBudget: boolean;
  closed: boolean;
  balance: number;
};

export type LedgerCategory = {
  id: string;
  name: string;
  groupId: string;
  isIncome: boolean;
  hidden: boolean;
};

export type LedgerTag = {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
};

export type LedgerTagReference = {
  id: string | null;
  name: string;
};

export type LedgerPayee = {
  id: string;
  name: string;
  transferAccountId: string | null;
};

export type LedgerSubtransaction = {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  amount: number;
  amountCents: number;
  note: string | null;
  rawNotes: string | null;
  tags: LedgerTagReference[];
};

export type LedgerTransaction = {
  id: string;
  fingerprint: string;
  actualDate: string;
  date: string;
  accountId: string;
  wallet: string;
  type: "Expense" | "Income" | "Transfer";
  categoryId: string | null;
  categoryName: string | null;
  payeeId: string | null;
  payeeName: string | null;
  amount: number;
  amountCents: number;
  currency: string;
  note: string | null;
  rawNotes: string | null;
  tags: LedgerTagReference[];
  labels: string | null;
  author: null;
  importedId: string | null;
  transferId: string | null;
  parentId: string | null;
  startingBalance: boolean;
  cleared: boolean;
  reconciled: boolean;
  sortOrder: number;
  subtransactions: LedgerSubtransaction[];
};

export type LedgerSnapshot = {
  currency: string;
  accounts: LedgerAccount[];
  categories: LedgerCategory[];
  tags: LedgerTag[];
  payees: LedgerPayee[];
  transactions: LedgerTransaction[];
  budgetMonths: string[];
  syncedAt: string;
};

export type LedgerFilters = {
  dateFrom?: string;
  dateTo?: string;
  accountIds?: string[];
  wallets?: string[];
  types?: string[];
  categoryIds?: string[];
  categories?: string[];
  tags?: string[];
  payees?: string[];
  authors?: string[];
  amountOperator?: "gt" | "lt" | "eq";
  amount?: number;
};

export type LedgerPage = {
  rows: LedgerTransaction[];
  dayTotals: ReturnType<typeof calculateDayTotals>;
  page: number;
  pageSize: number;
  total: number;
  pages: number;
};

export type SpendeeImportRow = {
  transaction: TransactionInput;
  sourceRow?: number;
  raw?: unknown;
};

export type LedgerImportResult = {
  total: number;
  added: number;
  updated: number;
  errors: string[];
  batches: ActualImportBatchResult[];
};
/* node:coverage enable */

const ACTUAL_TAG_PATTERN = /(?<!#)#([^#\s]+)/gu;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function normalizedName(value: string): string {
  return value.trim().normalize("NFC").toLocaleLowerCase("en");
}

function centsToAmount(value: number): number {
  if (!Number.isSafeInteger(value)) {
    throw new Error("Actual returned an invalid integer amount.");
  }
  return value / 100;
}

export function amountToCents(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Amount must be finite.");
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents)) throw new Error("Amount is too large.");
  return cents;
}

export function assertActualDate(value: string): string {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) throw new Error("Actual returned an invalid transaction date.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error("Actual returned an invalid transaction date.");
  }
  return value;
}

/** Noon UTC keeps a date-only posting on the same calendar day in Zurich. */
export function actualDateToUiDate(value: string): string {
  return `${assertActualDate(value)}T12:00:00.000Z`;
}

export function parseActualTagTokens(notes: string | null): string[] {
  if (!notes) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const match of notes.matchAll(ACTUAL_TAG_PATTERN)) {
    const tag = match[1];
    if (!seen.has(tag)) {
      seen.add(tag);
      tags.push(tag);
    }
  }
  return tags;
}

export function stripActualTagTokens(notes: string | null): string | null {
  if (!notes) return null;
  const stripped = notes
    .replace(ACTUAL_TAG_PATTERN, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +\n/g, "\n")
    .trim();
  return stripped || null;
}

function mappedTags(
  notes: string | null,
  tagsByName: Map<string, LedgerTag>,
): LedgerTagReference[] {
  return parseActualTagTokens(notes).map((name) => ({
    id: tagsByName.get(name)?.id ?? null,
    name: tagsByName.get(name)?.name ?? name,
  }));
}

function mapSubtransaction(
  transaction: ActualTransactionRecord,
  categories: Map<string, LedgerCategory>,
  tagsByName: Map<string, LedgerTag>,
): LedgerSubtransaction {
  const tags = mappedTags(transaction.notes, tagsByName);
  return {
    id: transaction.id,
    categoryId: transaction.categoryId,
    categoryName: transaction.categoryId
      ? (categories.get(transaction.categoryId)?.name ?? null)
      : null,
    amount: centsToAmount(transaction.amountCents),
    amountCents: transaction.amountCents,
    note: stripActualTagTokens(transaction.notes),
    rawNotes: transaction.notes,
    tags,
  };
}

export function normalizeActualSnapshot(raw: ActualSnapshot): LedgerSnapshot {
  const accounts = raw.accounts.map((account) => ({
    id: String(account.id),
    name: account.name,
    offBudget: account.offBudget,
    closed: account.closed,
    balance: centsToAmount(account.balanceCents),
  }));
  const categories = raw.categories.map((category) => ({
    id: String(category.id),
    name: category.name,
    groupId: String(category.groupId),
    isIncome: category.isIncome,
    hidden: category.hidden,
  }));
  const tags = raw.tags.map((tag) => ({ ...tag, id: String(tag.id) }));
  const payees = raw.payees.map((payee) => ({
    ...payee,
    id: String(payee.id),
  }));
  const accountsById = new Map(
    accounts.map((account) => [account.id, account]),
  );
  const categoriesById = new Map(
    categories.map((category) => [category.id, category]),
  );
  const tagsByName = new Map(tags.map((tag) => [tag.name, tag]));
  const payeesById = new Map(payees.map((payee) => [payee.id, payee]));

  const transactions = raw.transactions.map((transaction) => {
    const account = accountsById.get(transaction.accountId);
    if (!account) {
      throw new Error("Actual returned a transaction for an unknown account.");
    }
    const payee = transaction.payeeId
      ? payeesById.get(transaction.payeeId)
      : undefined;
    const tagsForTransaction = mappedTags(transaction.notes, tagsByName);
    const transfer = Boolean(
      transaction.transferId || payee?.transferAccountId,
    );
    return {
      id: String(transaction.id),
      fingerprint:
        transaction.importedId !== null
          ? `actual-import:${transaction.accountId}:${transaction.importedId}`
          : `actual-id:${transaction.id}`,
      actualDate: assertActualDate(transaction.date),
      date: actualDateToUiDate(transaction.date),
      accountId: account.id,
      wallet: account.name,
      type: transfer
        ? ("Transfer" as const)
        : transaction.amountCents < 0
          ? ("Expense" as const)
          : ("Income" as const),
      categoryId: transaction.categoryId,
      categoryName: transaction.categoryId
        ? (categoriesById.get(transaction.categoryId)?.name ?? null)
        : null,
      payeeId: transaction.payeeId,
      payeeName: payee?.name ?? null,
      amount: centsToAmount(transaction.amountCents),
      amountCents: transaction.amountCents,
      currency: raw.currency,
      note: stripActualTagTokens(transaction.notes) ?? payee?.name ?? null,
      rawNotes: transaction.notes,
      tags: tagsForTransaction,
      labels: tagsForTransaction.length
        ? tagsForTransaction.map((tag) => tag.name).join(", ")
        : null,
      author: null,
      importedId: transaction.importedId,
      transferId: transaction.transferId,
      parentId: transaction.parentId,
      startingBalance: transaction.startingBalance,
      cleared: transaction.cleared,
      reconciled: transaction.reconciled,
      sortOrder: transaction.sortOrder,
      subtransactions: transaction.subtransactions.map((child) =>
        mapSubtransaction(child, categoriesById, tagsByName),
      ),
    } satisfies LedgerTransaction;
  });

  return {
    currency: raw.currency,
    accounts,
    categories,
    tags,
    payees,
    transactions,
    budgetMonths: raw.budgetMonths.slice(),
    syncedAt: raw.syncedAt,
  };
}

export async function getLedgerSnapshot(options?: {
  forceSync?: boolean;
  adapter?: ActualAdapter;
}): Promise<LedgerSnapshot> {
  const adapter = options?.adapter ?? getActualAdapter();
  return normalizeActualSnapshot(
    await adapter.getSnapshot({ forceSync: options?.forceSync }),
  );
}

function transactionCategoryIds(transaction: LedgerTransaction): string[] {
  return transaction.subtransactions.length
    ? transaction.subtransactions.flatMap((child) =>
        child.categoryId ? [child.categoryId] : [],
      )
    : transaction.categoryId
      ? [transaction.categoryId]
      : [];
}

function matchesAny(values: string[], expected: string[] | undefined) {
  if (!expected?.length) return true;
  const available = new Set(values.map(normalizedName));
  return expected.some((value) => available.has(normalizedName(value)));
}

export function filterLedgerTransactions(
  snapshot: LedgerSnapshot,
  filters: LedgerFilters = {},
): LedgerTransaction[] {
  const categoriesById = new Map(
    snapshot.categories.map((category) => [category.id, category.name]),
  );
  return snapshot.transactions.filter((transaction) => {
    // Actual stores an account's opening amount as a special transaction.
    // This UI exposes it separately in account totals and the balance editor.
    if (transaction.startingBalance) return false;
    if (filters.dateFrom && transaction.actualDate < filters.dateFrom)
      return false;
    if (filters.dateTo && transaction.actualDate > filters.dateTo) return false;
    if (
      filters.accountIds?.length &&
      !filters.accountIds.includes(transaction.accountId)
    )
      return false;
    if (!matchesAny([transaction.wallet], filters.wallets)) return false;
    if (!matchesAny([transaction.type], filters.types)) return false;
    const categoryIds = transactionCategoryIds(transaction);
    if (
      filters.categoryIds?.length &&
      !categoryIds.some((id) => filters.categoryIds?.includes(id))
    )
      return false;
    if (
      !matchesAny(
        categoryIds.flatMap((id) => {
          const name = categoriesById.get(id);
          return name ? [name] : [];
        }),
        filters.categories,
      )
    )
      return false;
    const tagNames = [
      ...transaction.tags.map((tag) => tag.name),
      ...transaction.subtransactions.flatMap((child) =>
        child.tags.map((tag) => tag.name),
      ),
    ];
    if (
      filters.tags?.length &&
      !filters.tags.some((tag) => tagNames.includes(tag))
    )
      return false;
    if (
      !matchesAny(
        transaction.payeeName ? [transaction.payeeName] : [],
        filters.payees,
      )
    )
      return false;
    // Actual does not attach a Spendee author to transactions.
    if (filters.authors?.length) return false;
    if (
      filters.amount !== undefined &&
      Number.isFinite(filters.amount) &&
      filters.amountOperator
    ) {
      const actual = Math.abs(transaction.amount);
      const expected = Math.abs(filters.amount);
      if (filters.amountOperator === "gt" && actual <= expected) return false;
      if (filters.amountOperator === "lt" && actual >= expected) return false;
      if (
        filters.amountOperator === "eq" &&
        Math.abs(actual - expected) >= 0.005
      )
        return false;
    }
    return true;
  });
}

export function sortLedgerTransactions(
  transactions: LedgerTransaction[],
): LedgerTransaction[] {
  return transactions
    .slice()
    .sort(
      (left, right) =>
        right.actualDate.localeCompare(left.actualDate) ||
        right.sortOrder - left.sortOrder ||
        right.id.localeCompare(left.id),
    );
}

export function getLedgerTransactionPage(
  snapshot: LedgerSnapshot,
  filters: LedgerFilters,
  page: number,
  pageSize: number,
): LedgerPage {
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const safePageSize =
    Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : 25;
  const allRows = sortLedgerTransactions(
    filterLedgerTransactions(snapshot, filters),
  );
  const pages = Math.max(1, Math.ceil(allRows.length / safePageSize));
  const effectivePage = Math.min(safePage, pages);
  return {
    rows: allRows.slice(
      (effectivePage - 1) * safePageSize,
      effectivePage * safePageSize,
    ),
    dayTotals: calculateDayTotals(allRows),
    page: effectivePage,
    pageSize: safePageSize,
    total: allRows.length,
    pages,
  };
}

export function getLedgerStats(snapshot: LedgerSnapshot) {
  return {
    transactions: snapshot.transactions.filter(
      (transaction) => !transaction.startingBalance,
    ).length,
    accounts: snapshot.accounts.length,
    wallets: snapshot.accounts.length,
    categories: snapshot.categories.length,
    tags: snapshot.tags.length,
  };
}

export function getLedgerFilterOptions(snapshot: LedgerSnapshot) {
  const payees = snapshot.payees
    .filter((payee) => !payee.transferAccountId)
    .map((payee) => payee.name)
    .sort((a, b) => a.localeCompare(b));
  return {
    accounts: snapshot.accounts.map((account) => ({
      id: account.id,
      name: account.name,
    })),
    wallets: snapshot.accounts.map((account) => account.name),
    categories: snapshot.categories.map((category) => ({
      id: category.id,
      name: category.name,
      hidden: category.hidden,
    })),
    categoryNames: snapshot.categories.map((category) => category.name),
    tags: snapshot.tags.map((tag) => ({ id: tag.id, name: tag.name })),
    tagNames: snapshot.tags.map((tag) => tag.name),
    payees,
    authors: [] as string[],
    types: ["Expense", "Income", "Transfer"] as const,
  };
}

export function getLedgerAccountSummaries(snapshot: LedgerSnapshot) {
  const today = new Date().toISOString().slice(0, 10);
  return snapshot.accounts.map((account) => {
    const transactions = snapshot.transactions.filter(
      (transaction) =>
        transaction.accountId === account.id && transaction.actualDate <= today,
    );
    const startingAmount = transactions
      .filter((transaction) => transaction.startingBalance)
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const transactionTotal = transactions
      .filter((transaction) => !transaction.startingBalance)
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    return {
      id: account.id,
      wallet: account.name,
      name: account.name,
      closed: account.closed,
      offBudget: account.offBudget,
      transactionCount: transactions.filter(
        (transaction) => !transaction.startingBalance,
      ).length,
      totals: [
        {
          currency: snapshot.currency,
          transactionTotal,
          startingAmount,
          total: account.balance,
        },
      ],
    };
  });
}

export function getLedgerAccount(
  snapshot: LedgerSnapshot,
  accountId: string,
  page = 1,
  pageSize = 25,
) {
  const account = snapshot.accounts.find((item) => item.id === accountId);
  if (!account) return null;
  const summary = getLedgerAccountSummaries(snapshot).find(
    (item) => item.id === accountId,
  )!;
  return {
    account,
    wallet: account.name,
    totals: summary.totals,
    ...getLedgerTransactionPage(
      snapshot,
      { accountIds: [accountId] },
      page,
      pageSize,
    ),
  };
}

function amountForCategory(
  transaction: LedgerTransaction,
  categoryId: string,
): number {
  if (transaction.subtransactions.length) {
    return transaction.subtransactions
      .filter((child) => child.categoryId === categoryId)
      .reduce((sum, child) => sum + child.amount, 0);
  }
  return transaction.categoryId === categoryId ? transaction.amount : 0;
}

export function getLedgerCategory(
  snapshot: LedgerSnapshot,
  categoryId: string,
  filters: LedgerFilters = {},
  page = 1,
  pageSize = 25,
) {
  const category = snapshot.categories.find((item) => item.id === categoryId);
  if (!category) return null;
  const matched = filterLedgerTransactions(snapshot, {
    ...filters,
    categoryIds: [categoryId],
    categories: undefined,
  }).map((transaction) => ({
    ...transaction,
    amount: amountForCategory(transaction, categoryId),
  }));
  const sorted = sortLedgerTransactions(matched);
  const safeSize =
    Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : 25;
  const pages = Math.max(1, Math.ceil(sorted.length / safeSize));
  const safePage = Math.min(
    Number.isInteger(page) && page > 0 ? page : 1,
    pages,
  );
  const totalsByTag = new Map<string, number>();
  for (const transaction of matched) {
    const destinations = transaction.tags.length
      ? transaction.tags.map((tag) => tag.name)
      : ["Other"];
    for (const tag of destinations) {
      totalsByTag.set(
        tag,
        (totalsByTag.get(tag) ?? 0) + transaction.amount / destinations.length,
      );
    }
  }
  const accounts = new Map<string, number>();
  matched.forEach((transaction) =>
    accounts.set(
      transaction.accountId,
      (accounts.get(transaction.accountId) ?? 0) + 1,
    ),
  );
  return {
    category,
    rows: sorted.slice((safePage - 1) * safeSize, safePage * safeSize),
    dayTotals: calculateDayTotals(sorted),
    total: sorted.length,
    page: safePage,
    pageSize: safeSize,
    pages,
    wallets: Array.from(accounts, ([id, transactionCount]) => ({
      id,
      wallet:
        snapshot.accounts.find((account) => account.id === id)?.name ?? id,
      transactionCount,
    })),
    segments: Array.from(totalsByTag, ([tag, amount]) => ({
      tag,
      currency: snapshot.currency,
      amount,
    })).sort((left, right) => right.amount - left.amount),
  };
}

export function getLedgerMonthlyCategoryTotals(snapshot: LedgerSnapshot) {
  const values = new Map<string, number>();
  for (const transaction of snapshot.transactions) {
    const postings = transaction.subtransactions.length
      ? transaction.subtransactions
      : [
          {
            categoryId: transaction.categoryId,
            amount: transaction.amount,
          },
        ];
    for (const posting of postings) {
      if (!posting.categoryId) continue;
      const key = `${transaction.actualDate.slice(0, 7)}\u0000${posting.categoryId}`;
      values.set(key, (values.get(key) ?? 0) + posting.amount);
    }
  }
  const months = new Set(snapshot.budgetMonths);
  for (const transaction of snapshot.transactions) {
    months.add(transaction.actualDate.slice(0, 7));
  }
  return {
    currency: snapshot.currency,
    months: Array.from(months).sort().reverse(),
    categories: snapshot.categories,
    totals: Array.from(values, ([key, amount]) => {
      const [month, categoryId] = key.split("\u0000");
      return {
        month,
        categoryId,
        categoryName:
          snapshot.categories.find((category) => category.id === categoryId)
            ?.name ?? null,
        currency: snapshot.currency,
        amount,
      };
    }).sort(
      (left, right) =>
        right.month.localeCompare(left.month) ||
        String(left.categoryName).localeCompare(String(right.categoryName)),
    ),
  };
}

export function getLedgerTransactionsByIds(
  snapshot: LedgerSnapshot,
  ids: string[],
): LedgerTransaction[] {
  const requested = new Set(ids);
  return snapshot.transactions.filter(
    (transaction) =>
      !transaction.startingBalance && requested.has(transaction.id),
  );
}

export async function setLedgerStartingBalance(
  snapshot: LedgerSnapshot,
  accountId: string,
  currency: string,
  amount: number,
  adapter: ActualAdapter = getActualAdapter(),
) {
  const account = snapshot.accounts.find((item) => item.id === accountId);
  if (!account) throw new Error("Account not found.");
  if (currency.toUpperCase() !== snapshot.currency)
    throw new Error("Account currency not found.");
  const startingBalance = snapshot.transactions.find(
    (transaction) =>
      transaction.accountId === accountId && transaction.startingBalance,
  );
  if (!startingBalance) {
    throw new Error(
      "This Actual account does not have an editable starting balance transaction.",
    );
  }
  if (!adapter.updateTransactionAmount) {
    throw new Error("This Actual adapter cannot update transactions.");
  }
  await adapter.updateTransactionAmount(
    startingBalance.id,
    amountToCents(amount),
  );
  adapter.invalidateSnapshot();
  return {
    accountId,
    wallet: account.name,
    currency: snapshot.currency,
    startingAmount: amount,
  };
}

function importDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf()))
    throw new Error("Import date is invalid.");
  return date.toISOString().slice(0, 10);
}

function splitImportTags(labels: string | null): string[] {
  if (!labels) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of labels.split(/[,;]/)) {
    const tag = part.trim().replace(/^#/, "");
    if (!tag) continue;
    if (/\s|#/.test(tag)) {
      throw new Error(`Tag "${tag}" cannot contain whitespace or #.`);
    }
    if (!seen.has(tag)) {
      seen.add(tag);
      tags.push(tag);
    }
  }
  return tags;
}

export function appendActualTags(
  note: string | null,
  tagNames: string[],
): string | undefined {
  const existing = new Set(parseActualTagTokens(note));
  const additions = tagNames.filter((tag) => !existing.has(tag));
  const pieces = [note?.trim(), ...additions.map((tag) => `#${tag}`)].filter(
    (value): value is string => Boolean(value),
  );
  return pieces.length ? pieces.join(" ") : undefined;
}

export function spendeeImportedId(transaction: TransactionInput): string {
  const stableFields = [
    transaction.date,
    transaction.wallet,
    transaction.type,
    transaction.categoryName,
    transaction.amount.toFixed(2),
    transaction.currency.toUpperCase(),
    transaction.note,
    transaction.labels,
    transaction.author,
  ].map((value) =>
    value == null ? "" : String(value).trim().normalize("NFC"),
  );
  return `spendee:${createHash("sha256")
    .update(JSON.stringify(stableFields))
    .digest("hex")}`;
}

function uniqueByName<T extends { name: string }>(
  values: T[],
  requested: string,
  kind: string,
): T {
  const matches = values.filter(
    (value) => normalizedName(value.name) === normalizedName(requested),
  );
  if (!matches.length)
    throw new Error(`${kind} "${requested}" was not found in Actual.`);
  if (matches.length > 1)
    throw new Error(`${kind} "${requested}" is ambiguous in Actual.`);
  return matches[0];
}

export function prepareSpendeeImportBatches(
  snapshot: LedgerSnapshot,
  rows: SpendeeImportRow[],
): ActualImportBatch[] {
  const batches = new Map<string, ActualImportBatch>();
  for (const row of rows) {
    const transaction = row.transaction;
    const currency = transaction.currency.trim().toUpperCase();
    if (currency !== snapshot.currency) {
      throw new Error(
        `Transaction currency ${currency} does not match ACTUAL_DEFAULT_CURRENCY.`,
      );
    }
    const account = uniqueByName(
      snapshot.accounts,
      transaction.wallet,
      "Account",
    );
    const category = transaction.categoryName
      ? uniqueByName(snapshot.categories, transaction.categoryName, "Category")
      : null;
    const payee = transaction.note
      ? snapshot.payees.find(
          (candidate) =>
            normalizedName(candidate.name) ===
            normalizedName(transaction.note!),
        )
      : undefined;
    const tagNames = splitImportTags(transaction.labels);
    const imported = {
      account: account.id,
      date: importDate(transaction.date),
      amount: amountToCents(transaction.amount),
      ...(category && !payee?.transferAccountId
        ? { category: category.id }
        : {}),
      ...(payee ? { payee: payee.id } : {}),
      ...(transaction.note ? { imported_payee: transaction.note } : {}),
      ...(appendActualTags(transaction.note, tagNames)
        ? { notes: appendActualTags(transaction.note, tagNames) }
        : {}),
      imported_id: spendeeImportedId(transaction),
      cleared: true,
    } satisfies ActualImportBatch["transactions"][number];
    const batch = batches.get(account.id) ?? {
      accountId: account.id,
      transactions: [],
    };
    batch.transactions.push(imported);
    batches.set(account.id, batch);
  }
  return Array.from(batches.values());
}

export async function importSpendeeTransactions(
  rows: SpendeeImportRow[],
  options?: { adapter?: ActualAdapter },
): Promise<LedgerImportResult> {
  if (!rows.length)
    throw new Error("Choose at least one transaction to import.");
  const adapter = options?.adapter ?? getActualAdapter();
  const snapshot = normalizeActualSnapshot(await adapter.getSnapshot());
  const batches = prepareSpendeeImportBatches(snapshot, rows);
  const results = await adapter.importTransactions(batches);
  const errors = results.flatMap((result) => result.errors);
  return {
    total: rows.length,
    added: results.reduce((sum, result) => sum + result.addedIds.length, 0),
    updated: results.reduce((sum, result) => sum + result.updatedIds.length, 0),
    errors,
    batches: results,
  };
}
