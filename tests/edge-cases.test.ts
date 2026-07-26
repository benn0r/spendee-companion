import assert from "node:assert/strict";
import { test } from "node:test";
import { categoryIconIds, validCategoryColor } from "../lib/category-appearance";
import { categorySlug } from "../lib/category-slug";
import { dayKey, formatDayLabel, groupRowsByDay } from "../lib/day-groups";
import { parseImportFile } from "../lib/import-xlsx";
import { parsePagination } from "../lib/pagination";
import { parseTransactionFilters } from "../lib/transaction-filters";
import { filterQuery, type FilterState } from "../app/TransactionFilters";

test("client filter queries round-trip through the API parser", () => {
  const filters: FilterState = {
    dateFrom: "2026-02-28",
    dateTo: "2026-03-01",
    wallets: ["Moon & Star"],
    types: ["Expense"],
    categories: ["Food / Potions"],
    tags: ["50%_magic"],
    authors: ["Nova Quill"],
    amountOperator: "gt",
    amount: "12.50",
  };

  assert.deepEqual(parseTransactionFilters(new URLSearchParams(filterQuery(filters))), {
    dateFrom: "2026-02-28",
    dateTo: "2026-03-01",
    wallets: ["Moon & Star"],
    types: ["Expense"],
    categories: ["Food / Potions"],
    tags: ["50%_magic"],
    authors: ["Nova Quill"],
    amountOperator: "gt",
    amount: 12.5,
  });

  const invalid = new URLSearchParams([
    ["dateFrom", "2026-02-30"],
    ["dateTo", "not-a-date"],
    ["wallet", " Moon Purse "],
    ["wallet", "Moon Purse"],
    ["wallet", " "],
    ["amountOperator", "between"],
    ["amount", "dragon"],
  ]);
  assert.deepEqual(parseTransactionFilters(invalid), {
    dateFrom: undefined,
    dateTo: undefined,
    wallets: ["Moon Purse"],
    types: [],
    categories: [],
    tags: [],
    authors: [],
    amountOperator: undefined,
    amount: undefined,
  });
});

test("pagination always returns finite integers inside the supported range", () => {
  assert.deepEqual(
    parsePagination(new URLSearchParams("page=Infinity&pageSize=10.5")),
    { page: 1, pageSize: 10 },
  );
  assert.deepEqual(
    parsePagination(new URLSearchParams("page=2.9&pageSize=999")),
    { page: 2, pageSize: 100 },
  );
  assert.deepEqual(
    parsePagination(new URLSearchParams("page=-4&pageSize=0")),
    { page: 1, pageSize: 10 },
  );
  assert.deepEqual(parsePagination(new URLSearchParams()), { page: 1, pageSize: 25 });
});

test("CSV parsing chooses one delimiter without shifting fields", async () => {
  const header = ["Date", "Wallet", "Type", "Category name", "Amount", "Currency", "Note", "Labels", "Author"];
  const fixtures = [
    {
      filename: "comma.csv",
      contents: [
        header.join(","),
        '2026-07-01T08:00:00+00:00,Moon Purse,Expense,Stardust Snacks,-24,chf,Moonberry; tea,"magic,pantry",Nova Quill',
      ].join("\n"),
    },
    {
      filename: "semicolon.csv",
      contents: [
        header.join(";"),
        '2026-07-01T08:00:00+00:00;Moon Purse;Expense;Stardust Snacks;-24;chf;"Moonberry, tea";magic,pantry;Nova Quill',
      ].join("\n"),
    },
    {
      filename: "tab.csv",
      contents: [
        header.join("\t"),
        "2026-07-01T08:00:00+00:00\tMoon Purse\tExpense\tStardust Snacks\t-24\tchf\tMoonberry, tea; chilled\tmagic,pantry\tNova Quill",
      ].join("\n"),
    },
  ];

  for (const fixture of fixtures) {
    const rows = await parseImportFile(Buffer.from(fixture.contents), fixture.filename);
    assert.equal(rows.length, 1, fixture.filename);
    assert.deepEqual(rows[0].transaction, {
      date: "2026-07-01T08:00:00.000Z",
      wallet: "Moon Purse",
      type: "Expense",
      categoryName: "Stardust Snacks",
      amount: -24,
      currency: "CHF",
      note: fixture.filename === "comma.csv" ? "Moonberry; tea" : fixture.filename === "semicolon.csv"
        ? "Moonberry, tea"
        : "Moonberry, tea; chilled",
      labels: "magic,pantry",
      author: "Nova Quill",
    }, fixture.filename);
  }
});

test("imports reject blank amounts and currencies that would break formatting", async () => {
  const header = "Date,Wallet,Type,Category name,Amount,Currency,Note,Labels,Author";
  await assert.rejects(
    () => parseImportFile(Buffer.from(
      `${header}\n2026-07-01T08:00:00+00:00,Moon Purse,Expense,Potions,,CHF,,,Nova Quill`,
    ), "blank-amount.csv"),
    /invalid amount/,
  );
  await assert.rejects(
    () => parseImportFile(Buffer.from(
      `${header}\n2026-07-01T08:00:00+00:00,Moon Purse,Expense,Potions,-4,DRAGON,,,Nova Quill`,
    ), "invalid-currency.csv"),
    /three-letter code/,
  );
});

test("Zurich day grouping is independent of the host timezone", () => {
  const previousTimeZone = process.env.TZ;
  process.env.TZ = "UTC";
  try {
    const now = new Date("2026-03-29T22:30:00.000Z");
    assert.equal(dayKey(now), "2026-03-30");
    assert.equal(formatDayLabel("2026-03-29", now), "Yesterday");
    assert.deepEqual(groupRowsByDay([
      { id: 1, date: "2026-03-29T22:30:00.000Z" },
      { id: 2, date: "2026-03-29T23:30:00.000Z" },
      { id: 3, date: "2026-03-28T21:30:00.000Z" },
    ]), [
      {
        key: "2026-03-30",
        rows: [
          { id: 1, date: "2026-03-29T22:30:00.000Z" },
          { id: 2, date: "2026-03-29T23:30:00.000Z" },
        ],
      },
      {
        key: "2026-03-28",
        rows: [{ id: 3, date: "2026-03-28T21:30:00.000Z" }],
      },
    ]);
  } finally {
    if (previousTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimeZone;
  }
});

test("category presentation helpers enforce supported values", () => {
  assert.equal(categorySlug("Café & Dragon’s Den"), "cafe-and-dragons-den");
  assert.equal(categorySlug("🐉"), "category");
  assert.equal(categoryIconIds.includes(47), false);
  assert.equal(categoryIconIds.includes(48), false);
  assert.equal(validCategoryColor("#12C48B"), true);
  assert.equal(validCategoryColor("#123"), false);
  assert.equal(validCategoryColor("12c48b"), false);
});
