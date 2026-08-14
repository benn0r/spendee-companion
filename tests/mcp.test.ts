import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { after, test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createSplitFromTransactions, getDatabase } from "../lib/db";
import { saveLedgerMonthlyColumns } from "../lib/ledger-metadata";
import { normalizeActualSnapshot } from "../lib/ledger-service";
import { createReadOnlyMcpServer } from "../lib/mcp-server";
import {
  actualIds,
  createActualApiFixture,
  writeActualApiFixture,
} from "./support/actual-api-fixture";

const databasePath = `/tmp/spendee-mcp-fantasy-${crypto.randomUUID()}.db`;
const actualPath = `/tmp/spendee-mcp-fantasy-${crypto.randomUUID()}.json`;
process.env.SQLITE_PATH = databasePath;
process.env.ACTUAL_MOCK_DATA_PATH = actualPath;
for (const name of [
  "ACTUAL_SERVER_URL",
  "ACTUAL_PASSWORD",
  "ACTUAL_SESSION_TOKEN",
  "ACTUAL_BUDGET_ID",
  "ACTUAL_SYNC_ID",
  "ACTUAL_BUDGET_PASSWORD",
]) {
  delete process.env[name];
}
writeActualApiFixture(actualPath);

after(() => {
  getDatabase().close();
  for (const path of [
    databasePath,
    `${databasePath}-shm`,
    `${databasePath}-wal`,
    actualPath,
  ]) {
    rmSync(path, { force: true });
  }
});

function parseResult(result: Awaited<ReturnType<Client["callTool"]>>) {
  const content = result.content as
    Array<{ type: string; text?: string }> | undefined;
  const block = content?.[0];
  assert.equal(block?.type, "text");
  if (typeof block?.text !== "string") {
    assert.fail("Expected a text tool result.");
  }
  return JSON.parse(block.text) as any;
}

function sqliteTables(): string[] {
  return (
    getDatabase()
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as Array<{ name: string }>
  ).map((row) => row.name);
}

test("MCP reads Actual UUID data and retained SQLite companion state", async () => {
  const db = getDatabase();
  const snapshot = normalizeActualSnapshot(createActualApiFixture());
  saveLedgerMonthlyColumns(db, snapshot, [
    {
      name: "Magic life",
      categories: ["Enchanted Groceries"],
      budget: 80,
    },
  ]);
  const split = createSplitFromTransactions(
    db,
    "Guild expedition",
    snapshot.transactions.filter((transaction) =>
      [actualIds.groceryTransaction, actualIds.rewardTransaction].includes(
        transaction.id as
          | typeof actualIds.groceryTransaction
          | typeof actualIds.rewardTransaction,
      ),
    ),
    [{ description: "Potion credit", amount: 6 }],
    3,
  );
  assert.ok(split);
  assert.deepEqual(sqliteTables(), [
    "category_tag_config",
    "monthly_report_columns",
    "split_entries",
    "split_records",
    "validation_description_blacklist",
    "validation_manual_matches",
    "validation_runs",
  ]);

  const server = createReadOnlyMcpServer();
  const client = new Client({ name: "fantasy-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  try {
    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name).sort();
    assert.deepEqual(names, [
      "get_category",
      "get_monthly_categories",
      "get_overview",
      "get_split",
      "get_wallet",
      "list_splits",
      "list_transactions",
      "list_wallets",
    ]);
    assert.deepEqual(
      names.filter((name) =>
        /create|update|delete|import|approve|reject/.test(name),
      ),
      [],
    );

    const overview = parseResult(
      await client.callTool({ name: "get_overview", arguments: {} }),
    );
    assert.deepEqual(overview.counts, {
      transactions: 3,
      wallets: 2,
    });
    const moonOverview = overview.wallets.find(
      (wallet: { id: string }) => wallet.id === actualIds.moonAccount,
    );
    assert.equal(moonOverview.wallet, "Moon Purse");
    assert.equal(moonOverview.totals[0].startingAmount, 200);
    assert.ok(overview.filters.tags.includes("quest"));

    const transactions = parseResult(
      await client.callTool({
        name: "list_transactions",
        arguments: {
          page: 1,
          pageSize: 10,
          wallets: ["Moon Purse"],
          types: [],
          categories: [],
          tags: ["quest"],
          authors: [],
        },
      }),
    );
    assert.equal(transactions.total, 1);
    assert.equal(transactions.rows[0].id, actualIds.rewardTransaction);
    assert.equal(transactions.rows[0].accountId, actualIds.moonAccount);
    assert.equal(transactions.rows[0].categoryId, actualIds.dragonRewards);
    assert.deepEqual(transactions.rows[0].tags, [
      { id: actualIds.questTag, name: "quest" },
    ]);

    const wallets = parseResult(
      await client.callTool({ name: "list_wallets", arguments: {} }),
    );
    assert.ok(
      wallets.wallets.some(
        (wallet: { id: string }) => wallet.id === actualIds.moonAccount,
      ),
    );
    const wallet = parseResult(
      await client.callTool({
        name: "get_wallet",
        arguments: {
          wallet: actualIds.moonAccount,
          page: 1,
          pageSize: 10,
        },
      }),
    );
    assert.equal(wallet.account.id, actualIds.moonAccount);
    assert.equal(wallet.total, 2);

    const category = parseResult(
      await client.callTool({
        name: "get_category",
        arguments: {
          category: actualIds.enchantedGroceries,
          page: 1,
          pageSize: 10,
        },
      }),
    );
    assert.equal(category.categoryId, actualIds.enchantedGroceries);
    assert.equal(category.category, "Enchanted Groceries");
    assert.equal(category.rows[0].id, actualIds.groceryTransaction);

    const monthly = parseResult(
      await client.callTool({ name: "get_monthly_categories", arguments: {} }),
    );
    assert.equal(monthly.columns[0].name, "Magic life");
    assert.deepEqual(monthly.columns[0].categories, ["Enchanted Groceries"]);

    const splits = parseResult(
      await client.callTool({ name: "list_splits", arguments: {} }),
    );
    assert.equal(splits.splits[0].title, "Guild expedition");
    const oneSplit = parseResult(
      await client.callTool({
        name: "get_split",
        arguments: { id: split.id },
      }),
    );
    assert.equal(oneSplit.entries.length, 3);
    assert.deepEqual(
      oneSplit.entries
        .filter((entry: { kind: string }) => entry.kind === "transaction")
        .map((entry: { transactionId: string }) => entry.transactionId)
        .sort(),
      [actualIds.groceryTransaction, actualIds.rewardTransaction].sort(),
    );

    const invalid = await client.callTool({
      name: "list_transactions",
      arguments: { page: 0, pageSize: 500 },
    });
    assert.equal(invalid.isError, true);
    assert.ok(
      [
        "transactions",
        "imports",
        "duplicates",
        "wallet_starting_balances",
      ].every((name) => !sqliteTables().includes(name)),
    );
  } finally {
    await client.close();
    await server.close();
  }
});
