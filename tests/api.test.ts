import assert from "node:assert/strict";
import { after, test } from "node:test";
import { rmSync } from "node:fs";

const databasePath = `/tmp/spendee-api-fantasy-${crypto.randomUUID()}.db`;
process.env.SQLITE_PATH = databasePath;
process.env.APP_VERSION = "fantasy-test-build";

after(async () => {
  const { getDatabase } = await import("../lib/db");
  getDatabase().close();
  rmSync(databasePath, { force: true });
});

function jsonRequest(url: string, method: string, body: unknown) {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function body(response: Response) {
  return response.json() as Promise<Record<string, any>>;
}

test("API routes cover the complete fantasy-data workflow", async (t) => {
  const csv = [
    "Date,Wallet,Type,Category name,Amount,Currency,Note,Labels,Author",
    "2026-07-01T08:00:00+00:00,Moon Purse,Expense,Stardust Snacks,-24,CHF,Nebula lunch,cosmic;team,Nova Quill",
    "2026-07-02T09:00:00+00:00,Moon Purse,Income,Quest Rewards,120,CHF,Dragon bounty,quest,Orion Vale",
    "2026-07-03T10:00:00+00:00,Cloud Vault,Expense,Portal Travel,-45,CHF,Gate fare,travel,Lyra Moss",
  ].join("\n");

  await t.test("imports a CSV batch and reports validation failures", async () => {
    const route = await import("../app/api/import/route");
    const empty = await route.POST(new Request("http://test/api/import", { method: "POST", body: new FormData() }));
    assert.equal(empty.status, 400);

    const form = new FormData();
    form.append("files", new File([csv], "fantasy.csv", { type: "text/csv" }));
    const response = await route.POST(new Request("http://test/api/import", { method: "POST", body: form }));
    assert.equal(response.status, 200);
    assert.deepEqual((await body(response)).summary, {
      total: 3, imported: 3, duplicates: 0, replaced: 0, files: 1, failed: 0,
    });

    const invalid = new FormData();
    invalid.append("fullImport", "true");
    invalid.append("files", new File([csv], "two-wallets.csv", { type: "text/csv" }));
    const rejected = await route.POST(new Request("http://test/api/import", { method: "POST", body: invalid }));
    assert.equal(rejected.status, 400);
    assert.match(String((await body(rejected)).error), /exactly one wallet/);
  });

  await t.test("reads health, stats, filters, transactions, and wallets", async () => {
    const health = await import("../app/api/health/route");
    assert.deepEqual(await body(await health.GET()), { status: "ok", version: "fantasy-test-build" });

    const stats = await import("../app/api/stats/route");
    assert.equal((await body(await stats.GET())).transactions, 3);

    const filters = await import("../app/api/filter-options/route");
    const options = await body(await filters.GET());
    assert.deepEqual(options.wallets, ["Cloud Vault", "Moon Purse"]);
    assert.deepEqual(options.categories, ["Portal Travel", "Quest Rewards", "Stardust Snacks"]);

    const transactions = await import("../app/api/transactions/route");
    const page = await body(await transactions.GET(new Request(
      "http://test/api/transactions?page=1&pageSize=10&wallet=Moon%20Purse&tag=quest",
    )));
    assert.equal(page.total, 1);
    assert.equal(page.rows[0].author, "Orion Vale");
    const safePage = await body(await transactions.GET(new Request(
      "http://test/api/transactions?page=Infinity&pageSize=10.5",
    )));
    assert.equal(safePage.page, 1);
    assert.equal(safePage.pageSize, 10);

    const wallets = await import("../app/api/wallets/route");
    assert.equal((await body(await wallets.GET())).wallets.length, 2);

    const wallet = await import("../app/api/wallets/[wallet]/route");
    const params = { params: Promise.resolve({ wallet: "Moon Purse" }) };
    assert.equal((await body(await wallet.GET(new Request("http://test/api/wallets/Moon?pageSize=10"), params))).total, 2);
    const safeWalletPage = await body(await wallet.GET(
      new Request("http://test/api/wallets/Moon?page=2.9&pageSize=999"),
      params,
    ));
    assert.equal(safeWalletPage.page, 2);
    assert.equal(safeWalletPage.pageSize, 100);
    assert.equal((await wallet.GET(new Request("http://test/api/wallets/Unknown"), {
      params: Promise.resolve({ wallet: "Unknown" }),
    })).status, 404);
    assert.equal((await wallet.PUT(jsonRequest("http://test", "PUT", { currency: "", startingAmount: "nope" }), params)).status, 400);
    assert.equal((await wallet.PUT(jsonRequest("http://test", "PUT", { currency: "CHF", startingAmount: "" }), params)).status, 400);
    const updated = await body(await wallet.PUT(jsonRequest("http://test", "PUT", { currency: "CHF", startingAmount: 50 }), params));
    assert.equal(updated.startingAmount, 50);
  });

  await t.test("updates validation date and category appearance", async () => {
    const validUntil = await import("../app/api/valid-until/route");
    assert.equal((await body(await validUntil.GET())).validUntil, null);
    assert.equal((await validUntil.PUT(jsonRequest("http://test", "PUT", { validUntil: 7 }))).status, 400);
    assert.equal((await body(await validUntil.PUT(jsonRequest("http://test", "PUT", { validUntil: "2026-07-02" })))).validUntil, "2026-07-02");

    const category = await import("../app/api/categories/[category]/route");
    const params = { params: Promise.resolve({ category: "stardust-snacks" }) };
    const current = await body(await category.GET(new Request("http://test/api/categories/stardust-snacks?month=2026-07"), params));
    assert.equal(current.chartTotals[0].amount, -24);
    assert.equal((await category.GET(new Request("http://test/api/categories/stardust-snacks?month=wrong"), params)).status, 400);
    assert.equal((await category.GET(new Request("http://test/api/categories/stardust-snacks?month=2026-13"), params)).status, 400);
    const safeCategoryPage = await body(await category.GET(
      new Request("http://test/api/categories/stardust-snacks?page=Infinity&pageSize=10.5"),
      params,
    ));
    assert.equal(safeCategoryPage.page, 1);
    assert.equal(safeCategoryPage.pageSize, 10);
    assert.equal((await category.GET(new Request("http://test/api/categories/missing"), {
      params: Promise.resolve({ category: "missing" }),
    })).status, 404);
    assert.equal((await category.PUT(jsonRequest("http://test", "PUT", {
      selectedTags: [], spendingByTagEnabled: true, iconId: 999, color: "#12c48b",
    }), params)).status, 400);
    const saved = await body(await category.PUT(jsonRequest("http://test", "PUT", {
      selectedTags: ["cosmic"], spendingByTagEnabled: true, iconId: 3, color: "#12c48b",
    }), params));
    assert.deepEqual(saved.appearance, { iconId: 3, color: "#12c48b" });
  });

  await t.test("configures monthly reporting", async () => {
    const route = await import("../app/api/monthly-report/route");
    assert.equal((await body(await route.GET())).configured, false);
    assert.equal((await route.PUT(jsonRequest("http://test", "PUT", { columns: "invalid" }))).status, 400);
    const response = await route.PUT(jsonRequest("http://test", "PUT", {
      columns: [{ name: "Adventures", categories: ["Portal Travel", "Stardust Snacks"], budget: 100 }],
    }));
    assert.equal((await body(response)).columns[0].name, "Adventures");
  });

  await t.test("creates, reads, downloads, and deletes a split", async () => {
    const { getDatabase } = await import("../lib/db");
    const ids = (getDatabase().prepare("SELECT id FROM transactions ORDER BY id LIMIT 2").all() as Array<{ id: number }>).map((row) => row.id);
    const splits = await import("../app/api/splits/route");
    assert.equal((await splits.POST(jsonRequest("http://test", "POST", { title: "", transactionIds: [], customPositions: [], splitCount: 2 }))).status, 400);
    const created = await body(await splits.POST(jsonRequest("http://test", "POST", {
      title: "Airship voyage", transactionIds: ids, customPositions: [{ description: "Potion rebate", amount: 5 }], splitCount: 2, locale: "en",
    })));
    assert.equal(created.title, "Airship voyage");
    assert.equal(created.locale, "en");
    assert.equal((await body(await splits.GET())).splits.length, 1);

    const single = await import("../app/api/splits/[id]/route");
    const params = { params: Promise.resolve({ id: String(created.id) }) };
    assert.equal((await body(await single.GET(new Request("http://test"), params))).entries.length, 3);
    assert.equal((await single.GET(new Request("http://test"), { params: Promise.resolve({ id: "dragon" }) })).status, 404);

    const pdf = await import("../app/api/splits/[id]/pdf/route");
    const document = await pdf.GET(new Request("http://test"), params);
    assert.equal(document.status, 200);
    assert.match(document.headers.get("content-type") ?? "", /application\/pdf/);
    assert.equal((await single.DELETE(new Request("http://test"), params)).status, 200);
    assert.equal((await single.DELETE(new Request("http://test"), params)).status, 404);
  });

  await t.test("handles duplicate routes", async () => {
    const { getDatabase, importTransactions } = await import("../lib/db");
    const db = getDatabase();
    const original = db.prepare("SELECT date, wallet, type, category_name AS categoryName, amount, currency, note, labels, author FROM transactions LIMIT 1").get() as any;
    importTransactions(db, "repeat-fantasy.csv", [{ transaction: original, sourceRow: 2, raw: original }]);
    const duplicates = await import("../app/api/duplicates/route");
    const listed = await body(await duplicates.GET(new Request("http://test/api/duplicates?pageSize=10")));
    assert.equal(listed.total, 1);
    const safeDuplicatePage = await body(await duplicates.GET(
      new Request("http://test/api/duplicates?page=Infinity&pageSize=10.5"),
    ));
    assert.equal(safeDuplicatePage.page, 1);
    assert.equal(safeDuplicatePage.pageSize, 10);
    assert.equal((await duplicates.DELETE(jsonRequest("http://test", "DELETE", { ids: ["bad"] }))).status, 400);
    assert.equal((await body(await duplicates.DELETE(jsonRequest("http://test", "DELETE", { ids: [listed.rows[0].id] })))).deleted, 1);
  });

  await t.test("serves the MCP Streamable HTTP protocol and rejects GET", async () => {
    const route = await import("../app/mcp/route");
    const get = route.GET();
    assert.equal(get.status, 405);
    assert.equal(get.headers.get("allow"), "POST");
    const response = await route.POST(new Request("http://test/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "fantasy-http-client", version: "1.0.0" },
        },
      }),
    }));
    assert.equal(response.status, 200);
    const payload = await body(response);
    assert.equal(payload.jsonrpc, "2.0");
    assert.equal(payload.result.serverInfo.name, "spendee-read-only");
  });
});
