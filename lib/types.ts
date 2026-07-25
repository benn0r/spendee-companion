export const transactionColumns = [
  "Date",
  "Wallet",
  "Type",
  "Category name",
  "Amount",
  "Currency",
  "Note",
  "Labels",
  "Author",
] as const;

export type TransactionInput = {
  date: string;
  wallet: string;
  type: string;
  categoryName: string | null;
  amount: number;
  currency: string;
  note: string | null;
  labels: string | null;
  author: string | null;
};

export type TransactionRow = TransactionInput & {
  id: number;
  sourceFile: string;
  sourceRow: number;
  importedAt: string;
};

export type DuplicateRow = TransactionRow & {
  duplicateOfId: number;
};
