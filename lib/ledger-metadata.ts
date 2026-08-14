import type { Db, MonthlyReportColumn, TransactionFilters } from "./db";
import { defaultCategoryColor } from "./category-appearance";
import { categorySlug } from "./category-slug";
import {
  filterLedgerTransactions,
  getLedgerCategory,
  getLedgerMonthlyCategoryTotals,
  type LedgerFilters,
  type LedgerSnapshot,
} from "./ledger-service";

function currentMonthKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

export function ledgerFilters(filters: TransactionFilters): LedgerFilters {
  return {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    wallets: filters.wallets,
    types: filters.types,
    categories: filters.categories,
    tags: filters.tags,
    authors: filters.authors,
    amountOperator: filters.amountOperator,
    amount: filters.amount,
  };
}

export function resolveLedgerAccount(snapshot: LedgerSnapshot, value: string) {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  return (
    snapshot.accounts.find((account) => account.id === decoded) ??
    snapshot.accounts.find((account) => account.name === decoded) ??
    null
  );
}

export function resolveLedgerCategory(snapshot: LedgerSnapshot, value: string) {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  return (
    snapshot.categories.find((category) => category.id === decoded) ??
    snapshot.categories.find((category) => category.name === decoded) ??
    snapshot.categories.find(
      (category) => categorySlug(category.name) === decoded,
    ) ??
    null
  );
}

type SavedCategoryConfig = {
  selectedTagsJson: string;
  enabled: number;
  iconId: number | null;
  color: string | null;
};

function savedCategoryConfig(db: Db, categoryId: string) {
  return db
    .prepare(
      `SELECT selected_tags_json AS selectedTagsJson, enabled,
        icon_id AS iconId, color
       FROM category_tag_config WHERE category = ?`,
    )
    .get(categoryId) as SavedCategoryConfig | undefined;
}

export function getLedgerCategoryDetails(
  db: Db,
  snapshot: LedgerSnapshot,
  categoryId: string,
  page: number,
  pageSize: number,
  filters: TransactionFilters,
  chartMonth?: string | null,
) {
  const category = snapshot.categories.find((item) => item.id === categoryId);
  if (!category) return null;
  const detail = getLedgerCategory(
    snapshot,
    categoryId,
    ledgerFilters({ ...filters, categories: [] }),
    page,
    pageSize,
  );
  const all = getLedgerCategory(snapshot, categoryId, {}, 1, 100);
  if (!detail || !all) return null;

  const allRows = filterLedgerTransactions(snapshot, {
    categoryIds: [categoryId],
  }).map((transaction) => {
    const amount = transaction.subtransactions.length
      ? transaction.subtransactions
          .filter((child) => child.categoryId === categoryId)
          .reduce((sum, child) => sum + child.amount, 0)
      : transaction.amount;
    const tags = Array.from(
      new Set([
        ...transaction.tags.map((tag) => tag.name),
        ...transaction.subtransactions
          .filter((child) => child.categoryId === categoryId)
          .flatMap((child) => child.tags.map((tag) => tag.name)),
      ]),
    );
    return { ...transaction, amount, tags };
  });
  const tagFrequency = new Map<string, number>();
  for (const row of allRows) {
    for (const tag of row.tags) {
      tagFrequency.set(tag, (tagFrequency.get(tag) ?? 0) + 1);
    }
  }
  const availableTags = Array.from(tagFrequency)
    .sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )
    .map(([tag]) => tag);
  const saved = savedCategoryConfig(db, categoryId);
  let storedTags: string[] = [];
  try {
    storedTags = saved ? (JSON.parse(saved.selectedTagsJson) as string[]) : [];
  } catch {
    storedTags = [];
  }
  const selectedTags = saved
    ? storedTags.filter((tag) => availableTags.includes(tag))
    : availableTags.slice(0, 6);
  const selectedSet = new Set(selectedTags);
  const currentMonth = currentMonthKey();
  const selectedChartMonth =
    chartMonth === undefined ? currentMonth : chartMonth;
  const spendingTotal = allRows
    .filter((row) => row.actualDate.slice(0, 7) === currentMonth)
    .reduce((sum, row) => sum + row.amount, 0);
  const chartRows =
    selectedChartMonth === null
      ? allRows
      : allRows.filter(
          (row) => row.actualDate.slice(0, 7) === selectedChartMonth,
        );
  const segmentTotals = new Map<
    string,
    { tag: string; currency: string; amount: number; transactionCount: number }
  >();
  for (const row of chartRows) {
    const matched = row.tags.filter((tag) => selectedSet.has(tag));
    const destinations = matched.length ? matched : ["Other"];
    for (const tag of destinations) {
      const current = segmentTotals.get(tag) ?? {
        tag,
        currency: snapshot.currency,
        amount: 0,
        transactionCount: 0,
      };
      current.amount += row.amount / destinations.length;
      current.transactionCount += 1;
      segmentTotals.set(tag, current);
    }
  }
  const chartTotal = chartRows.reduce((sum, row) => sum + row.amount, 0);
  return {
    ...detail,
    category: category.name,
    categoryId: category.id,
    spendingTotals: [{ currency: snapshot.currency, amount: spendingTotal }],
    chartTotals: [{ currency: snapshot.currency, amount: chartTotal }],
    currentMonth,
    chartMonth: selectedChartMonth,
    availableMonths: Array.from(
      new Set([
        currentMonth,
        ...allRows.map((row) => row.actualDate.slice(0, 7)),
      ]),
    )
      .sort()
      .reverse(),
    availableTags,
    selectedTags,
    spendingByTagEnabled: saved?.enabled !== 0,
    tagConfigSaved: Boolean(saved),
    appearance: {
      iconId: saved?.iconId ?? null,
      color: saved?.color ?? defaultCategoryColor,
    },
    segments: Array.from(segmentTotals.values())
      .filter((segment) => Math.abs(segment.amount) > 0.000001)
      .sort(
        (left, right) =>
          right.amount - left.amount || left.tag.localeCompare(right.tag),
      ),
  };
}

export function saveLedgerCategorySettings(
  db: Db,
  snapshot: LedgerSnapshot,
  categoryId: string,
  selectedTags: string[],
  enabled: boolean,
  iconId: number | null,
  color: string,
) {
  const category = snapshot.categories.find((item) => item.id === categoryId);
  if (!category) throw new Error("Category not found.");
  const normalizedTags = Array.from(
    new Set(selectedTags.map((tag) => tag.trim()).filter(Boolean)),
  ).sort((left, right) => left.localeCompare(right));
  db.prepare(
    `INSERT INTO category_tag_config
      (category, selected_tags_json, enabled, icon_id, color)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(category) DO UPDATE SET
       selected_tags_json = excluded.selected_tags_json,
       enabled = excluded.enabled,
       icon_id = excluded.icon_id,
       color = excluded.color,
       updated_at = CURRENT_TIMESTAMP`,
  ).run(
    categoryId,
    JSON.stringify(normalizedTags),
    enabled ? 1 : 0,
    iconId,
    color,
  );
  return {
    category: category.name,
    categoryId,
    selectedTags: normalizedTags,
    spendingByTagEnabled: enabled,
    appearance: { iconId, color },
  };
}

export function getLedgerFilterOptionsWithMetadata(
  db: Db,
  snapshot: LedgerSnapshot,
) {
  const currentMonth = currentMonthKey();
  const categoryMonthlyTotals = new Map<
    string,
    Array<{ currency: string; amount: number }>
  >();
  for (const row of getLedgerMonthlyCategoryTotals(snapshot).totals) {
    if (row.month !== currentMonth || !row.categoryName) continue;
    categoryMonthlyTotals.set(row.categoryName, [
      { currency: row.currency, amount: row.amount },
    ]);
  }
  const configurations = db
    .prepare(
      `SELECT category AS categoryId, icon_id AS iconId,
        COALESCE(color, ?) AS color FROM category_tag_config`,
    )
    .all(defaultCategoryColor) as Array<{
    categoryId: string;
    iconId: number | null;
    color: string;
  }>;
  const categoryAppearances = Object.fromEntries(
    configurations.flatMap((row) => {
      const category = snapshot.categories.find(
        (item) => item.id === row.categoryId,
      );
      return category
        ? [[category.name, { iconId: row.iconId, color: row.color }]]
        : [];
    }),
  );
  return {
    wallets: snapshot.accounts.map((account) => account.name).sort(),
    types: ["Expense", "Income", "Transfer"],
    categories: snapshot.categories
      .filter((category) => !category.hidden)
      .map((category) => category.name)
      .sort(),
    tags: snapshot.tags.map((tag) => tag.name).sort(),
    authors: [] as string[],
    categoryAppearances,
    categoryMonthlyTotals: Object.fromEntries(categoryMonthlyTotals),
    currentMonth,
  };
}

function savedMonthlyColumns(db: Db) {
  return db
    .prepare(
      `SELECT id, name, categories_json AS categoriesJson, budget
       FROM monthly_report_columns ORDER BY position, id`,
    )
    .all() as Array<{
    id: number;
    name: string;
    categoriesJson: string;
    budget: number | null;
  }>;
}

export function getLedgerMonthlyReport(db: Db, snapshot: LedgerSnapshot) {
  const availableCategories = snapshot.categories
    .filter((category) => !category.hidden)
    .map((category) => category.name)
    .sort((left, right) => left.localeCompare(right));
  const available = new Set(availableCategories);
  const saved = savedMonthlyColumns(db);
  const columns: MonthlyReportColumn[] = saved.length
    ? saved.map((row) => {
        let categories: string[] = [];
        try {
          categories = (JSON.parse(row.categoriesJson) as string[]).filter(
            (category) => available.has(category),
          );
        } catch {
          categories = [];
        }
        return {
          id: row.id,
          name: row.name,
          budget: row.budget,
          categories,
        };
      })
    : availableCategories.map((category) => ({
        name: category,
        categories: [category],
        budget: null,
      }));
  const report = getLedgerMonthlyCategoryTotals(snapshot);
  const values = new Map<string, number>();
  for (const total of report.totals) {
    if (!total.categoryName) continue;
    columns.forEach((column, index) => {
      if (!column.categories.includes(total.categoryName!)) return;
      const key = `${total.month}\u0000${index}`;
      values.set(key, (values.get(key) ?? 0) + total.amount);
    });
  }
  const months = report.months.map((month) => ({
    month,
    cells: columns.map((_, index) => {
      const amount = values.get(`${month}\u0000${index}`);
      return amount == null ? [] : [{ currency: snapshot.currency, amount }];
    }),
  }));
  const yearValues = new Map<string, number>();
  for (const month of months) {
    month.cells.forEach((cell, index) => {
      const key = `${month.month.slice(0, 4)}\u0000${index}`;
      yearValues.set(key, (yearValues.get(key) ?? 0) + (cell[0]?.amount ?? 0));
    });
  }
  const years = Array.from(
    new Set(months.map((month) => month.month.slice(0, 4))),
  )
    .sort()
    .reverse()
    .map((year) => ({
      year,
      cells: columns.map((_, index) => {
        const amount = yearValues.get(`${year}\u0000${index}`);
        return amount == null ? [] : [{ currency: snapshot.currency, amount }];
      }),
    }));
  return {
    categories: availableCategories,
    columns,
    months,
    years,
    configured: saved.length > 0,
  };
}

export function saveLedgerMonthlyColumns(
  db: Db,
  snapshot: LedgerSnapshot,
  columns: MonthlyReportColumn[],
) {
  const available = new Set(
    snapshot.categories.map((category) => category.name),
  );
  const normalized = columns.map((column) => ({
    name: column.name.trim(),
    budget: column.budget == null ? null : Number(column.budget),
    categories: Array.from(
      new Set(column.categories.map((category) => category.trim())),
    ).filter((category) => available.has(category)),
  }));
  if (!normalized.length) throw new Error("Add at least one column.");
  if (normalized.some((column) => !column.name))
    throw new Error("Every column needs a name.");
  if (normalized.some((column) => !column.categories.length))
    throw new Error("Every column needs at least one category.");
  if (
    normalized.some(
      (column) =>
        column.budget !== null &&
        (!Number.isFinite(column.budget) || column.budget <= 0),
    )
  ) {
    throw new Error("Budgets must be positive numbers or left empty.");
  }
  db.transaction(() => {
    db.prepare("DELETE FROM monthly_report_columns").run();
    const insert = db.prepare(
      `INSERT INTO monthly_report_columns
        (name, categories_json, budget, position) VALUES (?, ?, ?, ?)`,
    );
    normalized.forEach((column, position) => {
      insert.run(
        column.name,
        JSON.stringify(column.categories),
        column.budget,
        position,
      );
    });
  })();
  return normalized;
}
