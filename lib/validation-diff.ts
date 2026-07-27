import type {
  ExtractedDocumentTransaction,
  ValidationAppTransaction,
  ValidationDiff,
} from "./validation-types";

function calendarDate(value: string) {
  return value.slice(0, 10);
}

function transactionKey(transaction: { date: string; amount: number; currency: string }) {
  return `${calendarDate(transaction.date)}|${transaction.currency.toUpperCase()}|${Math.round(transaction.amount * 100)}`;
}

export function compareValidationTransactions(
  documentTransactions: ExtractedDocumentTransaction[],
  appTransactions: ValidationAppTransaction[],
): ValidationDiff {
  const available = new Map<string, ValidationAppTransaction[]>();
  for (const transaction of appTransactions) {
    const key = transactionKey(transaction);
    const rows = available.get(key) ?? [];
    rows.push(transaction);
    available.set(key, rows);
  }

  const matching: ValidationDiff["matching"] = [];
  const missingInApp: ValidationDiff["missingInApp"] = [];
  for (const transaction of documentTransactions) {
    const candidates = available.get(transactionKey(transaction));
    const app = candidates?.shift();
    if (app) matching.push({ document: transaction, app });
    else missingInApp.push(transaction);
  }

  return {
    matching,
    missingInApp,
    missingInDocument: Array.from(available.values()).flat(),
  };
}

export function validationDateRange(transactions: ExtractedDocumentTransaction[]) {
  if (!transactions.length) throw new Error("The document does not contain any transactions.");
  const dates = transactions.map((transaction) => calendarDate(transaction.date)).sort();
  return { dateFrom: dates[0], dateTo: dates[dates.length - 1] };
}
