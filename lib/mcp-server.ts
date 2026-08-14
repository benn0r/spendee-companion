import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
  getDatabase,
  getSplit,
  getSplits,
  type TransactionFilters,
} from "./db";
import {
  getLedgerCategoryDetails,
  getLedgerFilterOptionsWithMetadata,
  getLedgerMonthlyReport,
  ledgerFilters,
  resolveLedgerAccount,
  resolveLedgerCategory,
} from "./ledger-metadata";
import {
  getLedgerAccount,
  getLedgerAccountSummaries,
  getLedgerSnapshot,
  getLedgerStats,
  getLedgerTransactionPage,
} from "./ledger-service";

const pageSchema = {
  page: z.number().int().min(1).default(1).describe("One-based page number"),
  pageSize: z
    .number()
    .int()
    .min(10)
    .max(100)
    .default(25)
    .describe("Rows per page: 10 to 100"),
};

const filterSchema = {
  ...pageSchema,
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  wallets: z.array(z.string()).default([]),
  types: z.array(z.string()).default([]),
  categories: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  authors: z.array(z.string()).default([]),
  amountOperator: z.enum(["gt", "lt", "eq"]).optional(),
  amount: z.number().nonnegative().optional(),
};

function result(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function filters(
  input: z.infer<z.ZodObject<typeof filterSchema>>,
): TransactionFilters {
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

export function createReadOnlyMcpServer() {
  const server = new McpServer({ name: "spendee-read-only", version: "1.0.0" });

  server.registerTool(
    "get_overview",
    {
      description:
        "Read global counts, wallets, and filter options from Actual Budget.",
    },
    async () => {
      const db = getDatabase();
      const snapshot = await getLedgerSnapshot();
      const stats = getLedgerStats(snapshot);
      return result({
        counts: {
          transactions: stats.transactions,
          wallets: stats.wallets,
        },
        wallets: getLedgerAccountSummaries(snapshot),
        filters: getLedgerFilterOptionsWithMetadata(db, snapshot),
      });
    },
  );

  server.registerTool(
    "list_transactions",
    {
      description:
        "Read active transactions with the same filters and pagination as the UI.",
      inputSchema: filterSchema,
    },
    async (input) => {
      const snapshot = await getLedgerSnapshot();
      return result(
        getLedgerTransactionPage(
          snapshot,
          ledgerFilters(filters(input)),
          input.page,
          input.pageSize,
        ),
      );
    },
  );

  server.registerTool(
    "list_wallets",
    {
      description:
        "Read all wallet summaries, starting amounts, transaction totals, and current totals.",
    },
    async () => {
      const snapshot = await getLedgerSnapshot();
      return result({ wallets: getLedgerAccountSummaries(snapshot) });
    },
  );

  server.registerTool(
    "get_wallet",
    {
      description: "Read one wallet and its paginated transaction activity.",
      inputSchema: { wallet: z.string().min(1), ...pageSchema },
    },
    async ({ wallet, page, pageSize }) => {
      const snapshot = await getLedgerSnapshot();
      const account = resolveLedgerAccount(snapshot, wallet);
      return result(
        account ? getLedgerAccount(snapshot, account.id, page, pageSize) : null,
      );
    },
  );

  server.registerTool(
    "get_category",
    {
      description:
        "Read one category across wallets, including tag chart data and paginated transactions.",
      inputSchema: { category: z.string().min(1), ...pageSchema },
    },
    async ({ category, page, pageSize }) => {
      const db = getDatabase();
      const snapshot = await getLedgerSnapshot();
      const resolved = resolveLedgerCategory(snapshot, category);
      return result(
        resolved
          ? getLedgerCategoryDetails(
              db,
              snapshot,
              resolved.id,
              page,
              pageSize,
              {
                wallets: [],
                types: [],
                categories: [],
                tags: [],
                authors: [],
              },
            )
          : null,
      );
    },
  );

  server.registerTool(
    "get_monthly_categories",
    {
      description:
        "Read the configured monthly category columns, budgets, months, and totals.",
    },
    async () => {
      const snapshot = await getLedgerSnapshot();
      return result(getLedgerMonthlyReport(getDatabase(), snapshot));
    },
  );

  server.registerTool(
    "list_splits",
    {
      description: "Read all saved split summaries, newest first.",
    },
    async () => result({ splits: getSplits(getDatabase()) }),
  );

  server.registerTool(
    "get_split",
    {
      description:
        "Read a saved split with all immutable transaction snapshots and custom positions.",
      inputSchema: { id: z.number().int().positive() },
    },
    async ({ id }) => result(getSplit(getDatabase(), id)),
  );

  return server;
}
