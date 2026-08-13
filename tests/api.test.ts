import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { after, test } from "node:test";
import type { ActualSnapshot } from "../lib/actual-adapter";
import { actualIds, writeActualApiFixture } from "./support/actual-api-fixture";

const databasePath = `/tmp/spendee-api-fantasy-${crypto.randomUUID()}.db`;
const actualPath = `/tmp/spendee-api-fantasy-${crypto.randomUUID()}.json`;
process.env.SQLITE_PATH = databasePath;
process.env.ACTUAL_MOCK_DATA_PATH = actualPath;
process.env.APP_VERSION = "fantasy-test-build";
process.env.OPENAI_VALIDATION_MOCK = JSON.stringify({
  title: "Moon Guild Statement",
  printDate: "2026-07-14",
  issuer: "Moon Guild Bank",
  accountReference: "4242",
  metadata: { cycle: "July" },
  transactions: [
    {
      date: "2026-07-01",
      description: "Nebula lunch",
      amount: -24,
      currency: "CHF",
    },
    {
      date: "2026-07-03",
      description: "Comet bakery",
      amount: -18,
      currency: "CHF",
    },
  ],
});
process.env.VALIDATION_THUMBNAIL_MOCK_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
process.env.VALIDATION_BACKGROUND_IMMEDIATE = "1";
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
writeActualApiFixture(actualPath, false);

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

after(async () => {
  const { getDatabase } = await import("../lib/db");
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

function jsonRequest(url: string, method: string, value: unknown) {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
}

async function body(response: Response) {
  return response.json() as Promise<Record<string, any>>;
}

function actualSnapshot(): ActualSnapshot {
  return JSON.parse(readFileSync(actualPath, "utf8")) as ActualSnapshot;
}

async function importCsv(csv: string, filename: string) {
  const route = await import("../app/api/import/route");
  const form = new FormData();
  form.append("files", new File([csv], filename, { type: "text/csv" }));
  return route.POST(
    new Request("http://test/api/import", { method: "POST", body: form }),
  );
}

async function retainedSqliteTables() {
  const { getDatabase } = await import("../lib/db");
  return (
    getDatabase()
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as Array<{ name: string }>
  ).map((row) => row.name);
}

test("API routes use Actual while SQLite retains only companion state", async (t) => {
  const csv = [
    "Date,Wallet,Type,Category name,Amount,Currency,Note,Labels,Author",
    "2026-07-01T08:00:00+00:00,Moon Purse,Expense,Stardust Snacks,-24,CHF,Nebula lunch,cosmic;team,Nova Quill",
    "2026-07-02T09:00:00+00:00,Moon Purse,Income,Quest Rewards,120,CHF,Dragon bounty,quest,Orion Vale",
    "2026-07-03T10:00:00+00:00,Cloud Vault,Expense,Portal Travel,-45,CHF,Gate fare,travel,Lyra Moss",
  ].join("\n");

  await t.test(
    "opens only retained SQLite tables and checks Actual readiness",
    async () => {
      assert.deepEqual(await retainedSqliteTables(), [
        "app_settings",
        "category_tag_config",
        "monthly_report_columns",
        "split_entries",
        "split_records",
        "validation_description_blacklist",
        "validation_manual_matches",
        "validation_runs",
      ]);

      const health = await import("../app/api/health/route");
      assert.deepEqual(await body(await health.GET()), {
        status: "ok",
        sqlite: "ok",
        actual: "not-checked",
        version: "fantasy-test-build",
      });
      assert.deepEqual(
        await body(
          await health.GET(new Request("http://test/api/health?ready=1")),
        ),
        {
          status: "ok",
          sqlite: "ok",
          actual: "ok",
          version: "fantasy-test-build",
        },
      );
    },
  );

  await t.test(
    "imports into Actual and keeps UUID transaction identities",
    async () => {
      const route = await import("../app/api/import/route");
      assert.equal(
        (
          await route.POST(
            new Request("http://test/api/import", {
              method: "POST",
              body: new FormData(),
            }),
          )
        ).status,
        400,
      );

      const response = await importCsv(csv, "fantasy.csv");
      assert.equal(response.status, 200);
      assert.deepEqual((await body(response)).summary, {
        total: 3,
        imported: 3,
        duplicates: 0,
        replaced: 0,
        files: 1,
        failed: 0,
      });
      const imported = actualSnapshot().transactions.filter((transaction) =>
        transaction.importedId?.startsWith("spendee:"),
      );
      assert.equal(imported.length, 3);
      assert.ok(
        imported.every((transaction) => uuidPattern.test(transaction.id)),
      );
      assert.deepEqual(
        new Set(imported.map((transaction) => transaction.accountId)),
        new Set([actualIds.moonAccount, actualIds.cloudAccount]),
      );

      const repeated = await body(await importCsv(csv, "fantasy-repeat.csv"));
      assert.deepEqual(repeated.summary, {
        total: 3,
        imported: 0,
        duplicates: 0,
        replaced: 0,
        files: 1,
        failed: 0,
      });
      assert.equal(repeated.results[0].updated, 3);
      assert.equal(
        actualSnapshot().transactions.filter((transaction) =>
          transaction.importedId?.startsWith("spendee:"),
        ).length,
        3,
      );

      const invalid = new FormData();
      invalid.append("fullImport", "true");
      invalid.append(
        "files",
        new File([csv], "two-wallets.csv", { type: "text/csv" }),
      );
      const rejected = await route.POST(
        new Request("http://test/api/import", {
          method: "POST",
          body: invalid,
        }),
      );
      assert.equal(rejected.status, 400);
      assert.match(String((await body(rejected)).error), /exactly one wallet/);
      assert.ok(!(await retainedSqliteTables()).includes("transactions"));
    },
  );

  await t.test(
    "reads Actual account, category, and tag paths by UUID",
    async () => {
      const stats = await import("../app/api/stats/route");
      assert.deepEqual(await body(await stats.GET()), {
        transactions: 3,
        accounts: 2,
        wallets: 2,
        categories: 6,
        tags: 6,
        duplicates: 0,
        imports: 0,
      });

      const filters = await import("../app/api/filter-options/route");
      const options = await body(await filters.GET());
      assert.ok(options.wallets.includes("Moon Purse"));
      assert.ok(options.categories.includes("Stardust Snacks"));
      assert.ok(options.tags.includes("quest"));
      assert.deepEqual(options.authors, []);

      const transactions = await import("../app/api/transactions/route");
      const transactionPage = await body(
        await transactions.GET(
          new Request(
            "http://test/api/transactions?page=1&pageSize=10&wallet=Moon%20Purse&tag=quest",
          ),
        ),
      );
      assert.equal(transactionPage.total, 1);
      assert.match(transactionPage.rows[0].id, uuidPattern);
      assert.equal(transactionPage.rows[0].accountId, actualIds.moonAccount);
      assert.equal(transactionPage.rows[0].categoryId, actualIds.questRewards);
      assert.deepEqual(transactionPage.rows[0].tags, [
        { id: actualIds.questTag, name: "quest" },
      ]);
      assert.equal(transactionPage.rows[0].author, null);

      const wallets = await import("../app/api/wallets/route");
      const walletList = await body(await wallets.GET());
      assert.equal(walletList.wallets[0].id, actualIds.moonAccount);
      const wallet = await import("../app/api/wallets/[wallet]/route");
      const walletParams = {
        params: Promise.resolve({ wallet: actualIds.moonAccount }),
      };
      const walletDetail = await body(
        await wallet.GET(
          new Request("http://test/api/wallets/moon?pageSize=10"),
          walletParams,
        ),
      );
      assert.equal(walletDetail.account.id, actualIds.moonAccount);
      assert.equal(walletDetail.total, 2);
      assert.equal(
        (
          await wallet.GET(new Request("http://test/api/wallets/missing"), {
            params: Promise.resolve({
              wallet: "90000000-0000-4000-8000-000000000099",
            }),
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await wallet.PUT(
            jsonRequest("http://test", "PUT", {
              currency: "",
              startingAmount: "nope",
            }),
            walletParams,
          )
        ).status,
        400,
      );
      const updated = await body(
        await wallet.PUT(
          jsonRequest("http://test", "PUT", {
            currency: "CHF",
            startingAmount: 50,
          }),
          walletParams,
        ),
      );
      assert.deepEqual(updated, {
        accountId: actualIds.moonAccount,
        wallet: "Moon Purse",
        currency: "CHF",
        startingAmount: 50,
      });
      assert.equal(
        actualSnapshot().transactions.find(
          (transaction) => transaction.id === actualIds.startingTransaction,
        )?.amountCents,
        5_000,
      );

      const category = await import("../app/api/categories/[category]/route");
      const categoryParams = {
        params: Promise.resolve({ category: actualIds.stardustSnacks }),
      };
      const categoryDetail = await body(
        await category.GET(
          new Request(
            `http://test/api/categories/${actualIds.stardustSnacks}?month=2026-07`,
          ),
          categoryParams,
        ),
      );
      assert.equal(categoryDetail.categoryId, actualIds.stardustSnacks);
      assert.equal(categoryDetail.chartTotals[0].amount, -24);
      assert.equal(
        (
          await category.GET(
            new Request("http://test/api/categories/category?month=wrong"),
            categoryParams,
          )
        ).status,
        400,
      );
      const saved = await body(
        await category.PUT(
          jsonRequest("http://test", "PUT", {
            selectedTags: ["cosmic"],
            spendingByTagEnabled: true,
            iconId: 3,
            color: "#8719e0",
          }),
          categoryParams,
        ),
      );
      assert.equal(saved.categoryId, actualIds.stardustSnacks);
      assert.deepEqual(saved.appearance, { iconId: 3, color: "#8719e0" });
      const { getDatabase } = await import("../lib/db");
      assert.equal(
        (
          getDatabase()
            .prepare("SELECT category FROM category_tag_config")
            .get() as { category: string }
        ).category,
        actualIds.stardustSnacks,
      );
    },
  );

  await t.test(
    "persists verification and monthly settings in SQLite",
    async () => {
      const validUntil = await import("../app/api/valid-until/route");
      assert.equal((await body(await validUntil.GET())).validUntil, null);
      assert.equal(
        (
          await validUntil.PUT(
            jsonRequest("http://test", "PUT", { validUntil: 7 }),
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await body(
            await validUntil.PUT(
              jsonRequest("http://test", "PUT", { validUntil: "2026-07-02" }),
            ),
          )
        ).validUntil,
        "2026-07-02",
      );

      const monthly = await import("../app/api/monthly-report/route");
      assert.equal((await body(await monthly.GET())).configured, false);
      assert.equal(
        (
          await monthly.PUT(
            jsonRequest("http://test", "PUT", { columns: "invalid" }),
          )
        ).status,
        400,
      );
      const saved = await body(
        await monthly.PUT(
          jsonRequest("http://test", "PUT", {
            columns: [
              {
                name: "Adventures",
                categories: ["Portal Travel", "Stardust Snacks"],
                budget: 100,
              },
            ],
          }),
        ),
      );
      assert.equal(saved.columns[0].name, "Adventures");
      assert.equal(saved.configured, true);
    },
  );

  await t.test("validates against live Actual transactions", async () => {
    const candidateCsv = [
      "Date,Wallet,Type,Category name,Amount,Currency,Note,Labels,Author",
      "2026-07-02T10:00:00+00:00,Moon Purse,Expense,Comet Food,-18,CHF,Comet cafe,cosmic,Nova Quill",
    ].join("\n");
    assert.equal((await importCsv(candidateCsv, "candidate.csv")).status, 200);

    const route = await import("../app/api/validations/route");
    const form = new FormData();
    form.append("wallet", actualIds.moonAccount);
    form.append(
      "file",
      new File(["%PDF-1.4 fantasy statement"], "moon-statement.pdf", {
        type: "application/pdf",
      }),
    );
    const response = await route.POST(
      new Request("http://test/api/validations", {
        method: "POST",
        body: form,
      }),
    );
    assert.equal(response.status, 202);
    const created = await body(response);
    assert.equal(created.status, "processing");
    const summary = (await body(await route.GET())).validations[0];
    assert.equal(summary.accountId, actualIds.moonAccount);
    assert.equal(summary.counts.matching, 1);
    assert.equal(summary.counts.missingInApp, 1);

    const detail = await import("../app/api/validations/[id]/route");
    const params = { params: Promise.resolve({ id: String(created.id) }) };
    const completed = await body(
      await detail.GET(new Request("http://test"), params),
    );
    assert.equal(completed.status, "complete");
    assert.equal(completed.accountId, actualIds.moonAccount);
    assert.equal(completed.diff.matching.length, 1);
    assert.equal(completed.diff.missingInApp.length, 1);
    assert.equal(completed.diff.missingInDocument.length, 2);
    assert.equal(completed.rawOpenAI.output.title, "Moon Guild Statement");
    assert.equal(completed.suggestions[0].app.note, "Comet cafe");

    const manuallyMatched = await body(
      await detail.POST(
        jsonRequest("http://test", "POST", {
          documentKey: completed.suggestions[0].documentKey,
          appFingerprint: completed.suggestions[0].app.fingerprint,
        }),
        params,
      ),
    );
    assert.equal(manuallyMatched.diff.matching.length, 2);
    const matches = await import("../app/api/validations/[id]/matches/route");
    assert.equal(
      (
        await body(
          await matches.DELETE(
            jsonRequest("http://test", "DELETE", {
              documentKey: completed.suggestions[0].documentKey,
            }),
            params,
          ),
        )
      ).diff.matching.length,
      1,
    );

    const thumbnail =
      await import("../app/api/validations/[id]/thumbnail/route");
    const image = await thumbnail.GET(new Request("http://test"), params);
    assert.equal(image.headers.get("content-type"), "image/png");
    assert.ok((await image.arrayBuffer()).byteLength > 10);
    assert.equal(
      (await detail.DELETE(new Request("http://test"), params)).status,
      200,
    );
  });

  await t.test(
    "stores immutable split snapshots with Actual UUIDs",
    async () => {
      const transactions = await import("../app/api/transactions/route");
      const transactionPage = await body(
        await transactions.GET(
          new Request("http://test/api/transactions?pageSize=100"),
        ),
      );
      const ids = transactionPage.rows
        .filter((row: { startingBalance: boolean }) => !row.startingBalance)
        .slice(0, 2)
        .map((row: { id: string }) => row.id);
      assert.equal(ids.length, 2);
      assert.ok(ids.every((id: string) => uuidPattern.test(id)));

      const splits = await import("../app/api/splits/route");
      assert.equal(
        (
          await splits.POST(
            jsonRequest("http://test", "POST", {
              title: "",
              transactionIds: [],
              customPositions: [],
              splitCount: 2,
            }),
          )
        ).status,
        400,
      );
      const created = await body(
        await splits.POST(
          jsonRequest("http://test", "POST", {
            title: "Airship voyage",
            transactionIds: ids,
            customPositions: [{ description: "Potion rebate", amount: 5 }],
            splitCount: 2,
            locale: "en",
          }),
        ),
      );
      assert.equal(created.title, "Airship voyage");
      assert.equal((await body(await splits.GET())).splits.length, 1);

      const single = await import("../app/api/splits/[id]/route");
      const params = { params: Promise.resolve({ id: String(created.id) }) };
      const saved = await body(
        await single.GET(new Request("http://test"), params),
      );
      assert.equal(saved.entries.length, 3);
      assert.deepEqual(
        saved.entries
          .filter((entry: { kind: string }) => entry.kind === "transaction")
          .map((entry: { transactionId: string }) => entry.transactionId)
          .sort(),
        ids.slice().sort(),
      );
      const pdf = await import("../app/api/splits/[id]/pdf/route");
      const document = await pdf.GET(new Request("http://test"), params);
      assert.equal(document.status, 200);
      assert.match(
        document.headers.get("content-type") ?? "",
        /application\/pdf/,
      );
      assert.equal(
        (await single.DELETE(new Request("http://test"), params)).status,
        200,
      );
    },
  );

  await t.test(
    "exposes empty compatibility duplicates without SQLite",
    async () => {
      const duplicates = await import("../app/api/duplicates/route");
      const listed = await body(
        await duplicates.GET(
          new Request("http://test/api/duplicates?page=2&pageSize=10"),
        ),
      );
      assert.deepEqual(listed, {
        rows: [],
        dayTotals: {},
        page: 2,
        pageSize: 10,
        total: 0,
        pages: 1,
      });
      assert.equal(
        (
          await duplicates.DELETE(
            jsonRequest("http://test", "DELETE", { ids: [null] }),
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await body(
            await duplicates.DELETE(
              jsonRequest("http://test", "DELETE", {
                ids: [actualIds.groceryTransaction],
              }),
            ),
          )
        ).deleted,
        0,
      );
      assert.ok(!(await retainedSqliteTables()).includes("duplicates"));
    },
  );

  await t.test("serves MCP Streamable HTTP and rejects GET", async () => {
    const route = await import("../app/mcp/route");
    const get = route.GET();
    assert.equal(get.status, 405);
    assert.equal(get.headers.get("allow"), "POST");
    const response = await route.POST(
      new Request("http://test/mcp", {
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
      }),
    );
    assert.equal(response.status, 200);
    const payload = await body(response);
    assert.equal(payload.result.serverInfo.name, "spendee-read-only");
  });

  const finalTables = await retainedSqliteTables();
  assert.ok(
    ["transactions", "imports", "duplicates", "wallet_starting_balances"].every(
      (name) => !finalTables.includes(name),
    ),
  );
});
