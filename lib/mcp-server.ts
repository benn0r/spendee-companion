import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
  getCategoryDetails,
  getDatabase,
  getFilteredTransactionPage,
  getMonthlyReport,
  getSplit,
  getSplits,
  getTransactionFilterOptions,
  getValidUntil,
  getWalletSummaries,
  getWalletTransactions,
  resolveCategory,
  type TransactionFilters,
} from "./db";

const pageSchema = {
  page: z.number().int().min(1).default(1).describe("One-based page number"),
  pageSize: z.number().int().min(10).max(100).default(25).describe("Rows per page: 10 to 100"),
};

const filterSchema = {
  ...pageSchema,
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  wallets: z.array(z.string()).default([]),
  types: z.array(z.string()).default([]),
  categories: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  authors: z.array(z.string()).default([]),
  amountOperator: z.enum(["gt", "lt", "eq"]).optional(),
  amount: z.number().nonnegative().optional(),
};

function result(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function filters(input: z.infer<z.ZodObject<typeof filterSchema>>): TransactionFilters {
  return {
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    wallets: input.wallets,
    types: input.types,
    categories: input.categories,
    tags: input.tags,
    authors: input.authors,
    amountOperator: input.amountOperator,
    amount: input.amount,
  };
}

function groupedWallets() {
  const grouped = new Map<string, {
    wallet: string;
    transactionCount: number;
    totals: Array<{ currency: string; transactionTotal: number; startingAmount: number; total: number }>;
  }>();
  for (const row of getWalletSummaries(getDatabase())) {
    const wallet = grouped.get(row.wallet) ?? { wallet: row.wallet, transactionCount: 0, totals: [] };
    wallet.transactionCount += row.transactionCount;
    wallet.totals.push({
      currency: row.currency,
      transactionTotal: row.transactionTotal,
      startingAmount: row.startingAmount,
      total: row.total,
    });
    grouped.set(row.wallet, wallet);
  }
  return Array.from(grouped.values());
}

export function createReadOnlyMcpServer() {
  const server = new McpServer({ name: "spendee-read-only", version: "1.0.0" });

  server.registerTool("get_overview", {
    description: "Read global counts, wallets, filter options, and the persisted verification date.",
  }, async () => {
    const db = getDatabase();
    const counts = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM transactions WHERE deleted_at IS NULL) AS transactions,
        (SELECT COUNT(*) FROM duplicates) AS duplicates,
        (SELECT COUNT(*) FROM imports) AS imports,
        (SELECT COUNT(DISTINCT wallet) FROM transactions WHERE deleted_at IS NULL) AS wallets,
        (SELECT COUNT(*) FROM reconciliation_items WHERE status = 'pending') AS pending
    `).get();
    return result({ counts, validUntil: getValidUntil(db), wallets: groupedWallets(), filters: getTransactionFilterOptions(db) });
  });

  server.registerTool("list_transactions", {
    description: "Read active transactions with the same filters and pagination as the UI.",
    inputSchema: filterSchema,
  }, async (input) => result(getFilteredTransactionPage(
    getDatabase(), "transactions", filters(input), input.page, input.pageSize,
  )));

  server.registerTool("list_duplicates", {
    description: "Read separated duplicate records with filters and pagination.",
    inputSchema: filterSchema,
  }, async (input) => result(getFilteredTransactionPage(
    getDatabase(), "duplicates", filters(input), input.page, input.pageSize,
  )));

  server.registerTool("list_wallets", {
    description: "Read all wallet summaries, starting amounts, transaction totals, and current totals.",
  }, async () => result({ wallets: groupedWallets() }));

  server.registerTool("get_wallet", {
    description: "Read one wallet and its paginated transaction activity.",
    inputSchema: { wallet: z.string().min(1), ...pageSchema },
  }, async ({ wallet, page, pageSize }) => result(getWalletTransactions(getDatabase(), wallet, page, pageSize)));

  server.registerTool("get_category", {
    description: "Read one category across wallets, including tag chart data and paginated transactions.",
    inputSchema: { category: z.string().min(1), ...pageSchema },
  }, async ({ category, page, pageSize }) => {
    const db = getDatabase();
    const resolved = resolveCategory(db, category) ?? category;
    return result(getCategoryDetails(db, resolved, page, pageSize));
  });

  server.registerTool("get_monthly_categories", {
    description: "Read the configured monthly category columns, budgets, months, and totals.",
  }, async () => result(getMonthlyReport(getDatabase())));

  server.registerTool("list_splits", {
    description: "Read all saved split summaries, newest first.",
  }, async () => result({ splits: getSplits(getDatabase()) }));

  server.registerTool("get_split", {
    description: "Read a saved split with all immutable transaction snapshots and custom positions.",
    inputSchema: { id: z.number().int().positive() },
  }, async ({ id }) => result(getSplit(getDatabase(), id)));

  server.registerTool("list_pending_reconciliation", {
    description: "Read proposed full-import changes and deletions that are awaiting user approval.",
  }, async () => {
    const rows = getDatabase().prepare(`
      SELECT r.id, r.action, r.transaction_id AS transactionId, r.created_at AS createdAt,
        t.date, t.wallet, t.type, t.category_name AS categoryName, t.amount, t.currency,
        t.note, t.labels, t.author, t.deleted_at IS NOT NULL AS isDeleted,
        r.proposed_json AS proposedJson
      FROM reconciliation_items r
      JOIN transactions t ON t.id = r.transaction_id
      WHERE r.status = 'pending'
      ORDER BY r.created_at DESC, r.id DESC
    `).all().map((row) => {
      const item = row as Record<string, unknown> & { proposedJson: string | null };
      return { ...item, proposed: item.proposedJson ? JSON.parse(item.proposedJson) : null, proposedJson: undefined };
    });
    return result({ rows, total: rows.length });
  });

  return server;
}
