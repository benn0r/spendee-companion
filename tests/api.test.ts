import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { after, test } from "node:test";
import type { ActualSnapshot } from "../lib/actual-adapter";
import { actualIds, writeActualApiFixture } from "./support/actual-api-fixture";

const databasePath = `/tmp/spendee-api-fantasy-${crypto.randomUUID()}.db`;
const actualPath = `/tmp/spendee-api-fantasy-${crypto.randomUUID()}.json`;
const receiptsPath = `/tmp/spendee-api-receipts-${crypto.randomUUID()}`;
process.env.SQLITE_PATH = databasePath;
process.env.ACTUAL_MOCK_DATA_PATH = actualPath;
process.env.RECEIPTS_DIR = receiptsPath;
process.env.RECEIPT_BACKGROUND_IMMEDIATE = "1";
process.env.OPENAI_RECEIPT_MOCK = JSON.stringify({
  merchant: "Moonberry Market",
  date: "2026-07-15",
  amount: -12.5,
  currency: "CHF",
  category: actualIds.enchantedGroceries,
  notes: "Moonberry tonic",
  tags: [actualIds.pantryTag],
  items: [
    {
      description: "Moonberry tonic",
      quantity: 1,
      unitAmount: -12.5,
      totalAmount: -12.5,
      category: actualIds.enchantedGroceries,
    },
  ],
  splits: [],
  confidence: 0.98,
});
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
writeActualApiFixture(actualPath);

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
    receiptsPath,
  ]) {
    rmSync(path, { force: true, recursive: path === receiptsPath });
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
  await t.test(
    "opens only retained SQLite tables and checks Actual readiness",
    async () => {
      assert.deepEqual(await retainedSqliteTables(), [
        "category_tag_config",
        "monthly_report_columns",
        "receipts",
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
    "reads Actual account, category, and tag paths by UUID",
    async () => {
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
      assert.equal(transactionPage.rows[0].categoryId, actualIds.dragonRewards);
      assert.deepEqual(transactionPage.rows[0].tags, [
        { id: actualIds.questTag, name: "quest" },
      ]);
      assert.equal(transactionPage.rows[0].author, null);
      assert.equal(transactionPage.rows[0].cleared, true);

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
        params: Promise.resolve({ category: actualIds.enchantedGroceries }),
      };
      const categoryDetail = await body(
        await category.GET(
          new Request(
            `http://test/api/categories/${actualIds.enchantedGroceries}?month=2026-07`,
          ),
          categoryParams,
        ),
      );
      assert.equal(categoryDetail.categoryId, actualIds.enchantedGroceries);
      assert.equal(categoryDetail.chartTotals[0].amount, -36);
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
      assert.equal(saved.categoryId, actualIds.enchantedGroceries);
      assert.deepEqual(saved.appearance, { iconId: 3, color: "#8719e0" });
      const { getDatabase } = await import("../lib/db");
      assert.equal(
        (
          getDatabase()
            .prepare("SELECT category FROM category_tag_config")
            .get() as { category: string }
        ).category,
        actualIds.enchantedGroceries,
      );
    },
  );

  await t.test("persists monthly settings in SQLite", async () => {
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
  });

  await t.test("validates against live Actual transactions", async () => {
    const snapshot = actualSnapshot();
    snapshot.transactions.push({
      id: "40000000-0000-4000-8000-000000000005",
      accountId: actualIds.moonAccount,
      categoryId: actualIds.cometFood,
      payeeId: actualIds.grocerPayee,
      amountCents: -1_800,
      date: "2026-07-03",
      notes: "Comet cafe #cosmic",
      importedId: "fantasy:comet-cafe",
      transferId: null,
      parentId: null,
      isParent: false,
      isChild: false,
      startingBalance: false,
      cleared: true,
      reconciled: false,
      sortOrder: 4,
      subtransactions: [],
    });
    snapshot.transactions.push({
      id: "40000000-0000-4000-8000-000000000006",
      accountId: actualIds.moonAccount,
      categoryId: actualIds.cometFood,
      payeeId: actualIds.grocerPayee,
      amountCents: -2_400,
      date: "2026-07-02",
      notes: "Nebula canteen",
      importedId: "fantasy:nebula-canteen",
      transferId: null,
      parentId: null,
      isParent: false,
      isChild: false,
      startingBalance: false,
      cleared: false,
      reconciled: false,
      sortOrder: 5,
      subtransactions: [],
    });
    writeFileSync(actualPath, JSON.stringify(snapshot, null, 2));

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
    assert.equal(completed.diff.missingInDocument.length, 1);
    assert.equal(completed.rawOpenAI.output.title, "Moon Guild Statement");
    assert.equal(completed.suggestions[0].app.note, "Nebula canteen");

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

  await t.test("creates mobile transactions and reviews receipts", async () => {
    const references = await import("../app/api/references/route");
    const referencePayload = await body(await references.GET());
    assert.equal(referencePayload.accounts[0].id, actualIds.moonAccount);
    assert.ok(
      referencePayload.categories.some(
        ({ id }: { id: string }) => id === actualIds.enchantedGroceries,
      ),
    );

    const transactions = await import("../app/api/transactions/route");
    assert.equal(
      (
        await transactions.POST(
          new Request("http://test/api/transactions", {
            method: "POST",
            body: "not-json",
          }),
        )
      ).status,
      400,
    );
    const income = await body(
      await transactions.POST(
        jsonRequest("http://test/api/transactions", "POST", {
          account: actualIds.moonAccount,
          category: actualIds.dragonRewards,
          date: "2026-07-16",
          amount: 25,
          payee: "Phoenix Guild",
          notes: "Tournament prize",
          tags: [actualIds.questTag],
        }),
      ),
    );
    assert.match(income.id, uuidPattern);
    assert.equal(income.status, "created");
    const transactionDetail =
      await import("../app/api/transactions/[id]/route");
    assert.equal(
      (
        await transactionDetail.DELETE(new Request("http://test"), {
          params: Promise.resolve({ id: income.id }),
        })
      ).status,
      204,
    );

    const receipts = await import("../app/api/receipts/route");
    const upload = new FormData();
    upload.set("account", actualIds.moonAccount);
    upload.set(
      "receipt",
      new File(
        [
          Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
            "base64",
          ),
        ],
        "moonberry-receipt.png",
        { type: "image/png" },
      ),
    );
    const uploadedResponse = await receipts.POST(
      new Request("http://test/api/receipts", {
        method: "POST",
        body: upload,
      }),
    );
    assert.equal(uploadedResponse.status, 202);
    const uploaded = await body(uploadedResponse);
    const listing = await body(await receipts.GET());
    assert.equal(listing.receipts[0].id, uploaded.id);
    assert.equal(listing.receipts[0].status, "processed");
    assert.equal(listing.receipts[0].suggestion.merchant, "Moonberry Market");
    assert.equal(listing.receipts[0].filePath, undefined);

    const receipt = await import("../app/api/receipts/[id]/route");
    const params = { params: Promise.resolve({ id: String(uploaded.id) }) };
    assert.equal(
      (await body(await receipt.GET(new Request("http://test"), params))).id,
      uploaded.id,
    );

    const receiptFile = await import("../app/api/receipts/[id]/file/route");
    const fileResponse = await receiptFile.GET(
      new Request("http://test"),
      params,
    );
    assert.equal(fileResponse.headers.get("content-type"), "image/png");
    assert.ok((await fileResponse.arrayBuffer()).byteLength > 10);

    const submit = await import("../app/api/receipts/[id]/submit/route");
    const submittedResponse = await submit.POST(
      jsonRequest("http://test", "POST", {
        account: actualIds.moonAccount,
        category: actualIds.enchantedGroceries,
        date: "2026-07-15",
        amount: -12.5,
        payee: "Moonberry Market",
        notes: "Moonberry tonic",
        tags: [actualIds.pantryTag],
      }),
      params,
    );
    assert.equal(submittedResponse.status, 201);
    const submitted = await body(submittedResponse);
    assert.match(submitted.id, uuidPattern);
    assert.equal(
      (await submit.POST(jsonRequest("http://test", "POST", {}), params))
        .status,
      409,
    );
    const createdReceiptTransaction = actualSnapshot().transactions.find(
      ({ id }) => id === submitted.id,
    );
    assert.equal(createdReceiptTransaction?.cleared, false);
    assert.equal(
      createdReceiptTransaction?.importedId,
      `spendee-receipt:${uploaded.id}`,
    );

    assert.equal(
      (await receipt.DELETE(new Request("http://test"), params)).status,
      204,
    );
    assert.deepEqual((await body(await receipts.GET())).receipts, []);
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
