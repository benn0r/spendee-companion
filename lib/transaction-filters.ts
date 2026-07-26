import type { TransactionFilters } from "./db";

export function parseTransactionFilters(searchParams: URLSearchParams): TransactionFilters {
  const list = (name: string) => Array.from(new Set(
    searchParams.getAll(name).map((value) => value.trim()).filter(Boolean),
  ));
  const amountText = searchParams.get("amount");
  const amount = amountText !== null && amountText.trim() !== "" ? Number(amountText) : undefined;
  const operator = searchParams.get("amountOperator");
  const date = (name: string) => {
    const value = searchParams.get(name);
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
      ? value
      : undefined;
  };
  return {
    dateFrom: date("dateFrom"),
    dateTo: date("dateTo"),
    wallets: list("wallet"),
    types: list("type"),
    categories: list("category"),
    tags: list("tag"),
    authors: list("author"),
    amountOperator: operator === "gt" || operator === "lt" || operator === "eq"
      ? operator
      : undefined,
    amount: amount !== undefined && Number.isFinite(amount) ? amount : undefined,
  };
}
