import assert from "node:assert/strict";
import { after, test } from "node:test";
import { rmSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createReadOnlyMcpServer } from "../lib/mcp-server";
import {
  createSplit,
  getDatabase,
  importTransactions,
  setMonthlyReportColumns,
  setValidUntil,
  setWalletStartingBalance,
} from "../lib/db";
import type { TransactionInput } from "../lib/types";

const databasePath = `/tmp/spendee-mcp-fantasy-${crypto.randomUUID()}.db`;
process.env.SQLITE_PATH = databasePath;

after(() => {
  getDatabase().close();
  rmSync(databasePath, { force: true });
});

function fantasyTransaction(patch: Partial<TransactionInput> = {}): TransactionInput {
  return {
    date: "2026-07-11T10:00:00.000Z",
    wallet: "Phoenix Pouch",
    type: "Expense",
    categoryName: "Enchanted Groceries",
    amount: -36,
    currency: "CHF",
    note: "Moonberry basket",
    labels: "magic, pantry",
    author: "Nova Quill",
    ...patch,
  };
}

function parseResult(result: Awaited<ReturnType<Client["callTool"]>>) {
  const content = result.content as Array<{ type: string; text?: string }> | undefined;
  const block = content?.[0];
  assert.equal(block?.type, "text");
  if (typeof block?.text !== "string") assert.fail("Expected a text tool result.");
  return JSON.parse(block.text) as any;
}

test("read-only MCP exposes every UI data surface with fantasy data", async () => {
  const db = getDatabase();
  const grocery = fantasyTransaction();
  const reward = fantasyTransaction({
    date: "2026-07-12T12:00:00.000Z",
    type: "Income",
    categoryName: "Dragon Rewards",
    amount: 90,
    note: "Guild prize",
    labels: "quest",
    author: "Orion Vale",
  });
  importTransactions(db, "fantasy-ledger.csv", [grocery, reward].map((transaction, index) => ({
    transaction, sourceRow: index + 2, raw: transaction,
  })));
  importTransactions(db, "fantasy-repeat.csv", [{ transaction: grocery, sourceRow: 2, raw: grocery }]);
  setWalletStartingBalance(db, "Phoenix Pouch", "CHF", 200);
  setValidUntil(db, "2026-07-12");
  setMonthlyReportColumns(db, [{ name: "Magic life", categories: ["Enchanted Groceries"], budget: 80 }]);
  const transactionIds = (db.prepare("SELECT id FROM transactions ORDER BY id").all() as Array<{ id: number }>).map((row) => row.id);
  const split = createSplit(db, "Guild expedition", transactionIds, [{ description: "Potion credit", amount: 6 }], 3);
  assert.ok(split);

  const server = createReadOnlyMcpServer();
  const client = new Client({ name: "fantasy-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  try {
    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name).sort();
    assert.deepEqual(names, [
      "get_category",
      "get_monthly_categories",
      "get_overview",
      "get_split",
      "get_wallet",
      "import_transaction_files",
      "list_duplicates",
      "list_splits",
      "list_transactions",
      "list_wallets",
    ]);
    assert.deepEqual(names.filter((name) => /create|update|delete|import|approve|reject/.test(name)), ["import_transaction_files"]);

    const overview = parseResult(await client.callTool({ name: "get_overview", arguments: {} }));
    assert.equal(overview.counts.transactions, 2);
    assert.equal(overview.counts.duplicates, 1);
    assert.equal(overview.validUntil, "2026-07-12");
    assert.equal(overview.wallets[0].totals[0].startingAmount, 200);

    const transactions = parseResult(await client.callTool({
      name: "list_transactions",
      arguments: { page: 1, pageSize: 10, wallets: ["Phoenix Pouch"], types: [], categories: [], tags: ["quest"], authors: [] },
    }));
    assert.equal(transactions.total, 1);
    assert.equal(transactions.rows[0].categoryName, "Dragon Rewards");

    const duplicates = parseResult(await client.callTool({
      name: "list_duplicates",
      arguments: { page: 1, pageSize: 10, wallets: [], types: [], categories: [], tags: [], authors: [] },
    }));
    assert.equal(duplicates.total, 1);

    const wallets = parseResult(await client.callTool({ name: "list_wallets", arguments: {} }));
    assert.equal(wallets.wallets[0].wallet, "Phoenix Pouch");

    const wallet = parseResult(await client.callTool({
      name: "get_wallet", arguments: { wallet: "Phoenix Pouch", page: 1, pageSize: 10 },
    }));
    assert.equal(wallet.total, 2);

    const category = parseResult(await client.callTool({
      name: "get_category", arguments: { category: "enchanted-groceries", page: 1, pageSize: 10 },
    }));
    assert.equal(category.category, "Enchanted Groceries");

    const monthly = parseResult(await client.callTool({ name: "get_monthly_categories", arguments: {} }));
    assert.equal(monthly.columns[0].name, "Magic life");

    const splits = parseResult(await client.callTool({ name: "list_splits", arguments: {} }));
    assert.equal(splits.splits[0].title, "Guild expedition");
    const oneSplit = parseResult(await client.callTool({ name: "get_split", arguments: { id: split!.id } }));
    assert.equal(oneSplit.entries.length, 3);

    const replacementCsv = [
      "Date,Wallet,Type,Category name,Amount,Currency,Note,Labels,Author",
      "2026-07-11T10:00:00.000Z,Phoenix Pouch,Expense,Enchanted Groceries,-42,CHF,Fresh moonberries,magic,Nova Quill",
    ].join("\n");
    const imported = parseResult(await client.callTool({
      name: "import_transaction_files",
      arguments: {
        files: [{ filename: "phoenix-full.csv", contentBase64: Buffer.from(replacementCsv).toString("base64") }],
        full: true,
      },
    }));
    assert.deepEqual(imported.summary, {
      total: 1, imported: 1, duplicates: 0, replaced: 2, files: 1, failed: 0,
    });
    const replacedWallet = parseResult(await client.callTool({
      name: "get_wallet", arguments: { wallet: "Phoenix Pouch", page: 1, pageSize: 10 },
    }));
    assert.equal(replacedWallet.total, 1);
    assert.equal(replacedWallet.rows[0].amount, -42);

    const invalid = await client.callTool({
      name: "list_transactions", arguments: { page: 0, pageSize: 500 },
    });
    assert.equal(invalid.isError, true);
  } finally {
    await client.close();
    await server.close();
  }
});
