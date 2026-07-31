"use client";

import Brand from "@/app/Brand";
import TopNavigation from "@/app/TopNavigation";
import { Fragment, useCallback, useEffect, useState } from "react";
import { useI18n } from "@/app/I18nProvider";

type Column = {
  id?: number;
  name: string;
  categories: string[];
  budget?: number | null;
};
type Cell = Array<{ currency: string; amount: number }>;
type Report = {
  categories: string[];
  columns: Column[];
  months: Array<{ month: string; cells: Cell[] }>;
  years: Array<{ year: string; cells: Cell[] }>;
  configured: boolean;
};

const emptyReport: Report = {
  categories: [],
  columns: [],
  months: [],
  years: [],
  configured: false,
};

function monthLabel(value: string, locale: string) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

function money(amount: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function budgetClass(cell: Cell, budget?: number | null) {
  if (budget == null) return "";
  const spend = cell.reduce(
    (total, value) => total + Math.max(0, -value.amount),
    0,
  );
  if (spend <= budget) return "budget-ok";
  if (spend <= budget * 1.2) return "budget-warning";
  return "budget-over";
}

export default function MonthlyReport() {
  const { intlLocale } = useI18n();
  const [report, setReport] = useState<Report>(emptyReport);
  const [columns, setColumns] = useState<Column[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const unassignedCategories = report.categories.filter(
    (category) =>
      !columns.some((column) => column.categories.includes(category)),
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/monthly-report", {
        cache: "no-store",
      });
      const data = (await response.json()) as Report;
      setReport(data);
      setColumns(data.columns);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function updateColumn(index: number, patch: Partial<Column>) {
    setColumns((current) =>
      current.map((column, columnIndex) =>
        columnIndex === index ? { ...column, ...patch } : column,
      ),
    );
  }

  function openSettings() {
    setColumns(report.columns);
    setEditing(true);
  }

  function closeSettings() {
    setColumns(report.columns);
    setEditing(false);
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/monthly-report", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columns }),
      });
      const result = (await response.json()) as Report & { error?: string };
      if (!response.ok)
        throw new Error(result.error ?? "Could not save the columns.");
      setReport(result);
      setColumns(result.columns);
      setEditing(false);
      setMessage("Monthly report columns saved.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not save the columns.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main>
      <header className="topbar">
        <div className="topbar-inner">
          <Brand />
          <TopNavigation active="monthly" />
        </div>
      </header>
      <div className="workspace monthly-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">SPENDING OVER TIME</p>
            <h1>Monthly</h1>
            <p>
              Compare net category totals by month and combine categories into
              custom columns.
            </p>
          </div>
          <button
            aria-label="Monthly settings"
            className="settings-cog-button"
            onClick={openSettings}
            title="Monthly settings"
          >
            ⚙
          </button>
        </section>

        {message && <div className="notice success">{message}</div>}

        {editing && (
          <div
            className="dialog-backdrop"
            role="presentation"
            onMouseDown={closeSettings}
          >
            <section
              aria-labelledby="monthy-settings-title"
              aria-modal="true"
              className="dialog-surface category-settings-dialog monthy-settings-dialog"
              role="dialog"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="dialog-head">
                <div>
                  <p className="eyebrow">MONTHLY</p>
                  <h2 id="monthy-settings-title">Table columns</h2>
                  <span>
                    Name each column, set its budget, and select the categories
                    it includes.
                  </span>
                </div>
                <button aria-label="Close settings" onClick={closeSettings}>
                  ×
                </button>
              </div>
              <div className="monthy-settings-body">
                <div className="report-column-list">
                  {columns.map((column, index) => (
                    <article
                      aria-label={`Column settings: ${column.name}`}
                      className="report-column-editor"
                      key={`${column.id ?? "new"}-${index}`}
                    >
                      <div className="report-column-head">
                        <label>
                          <span>Column name</span>
                          <input
                            value={column.name}
                            onChange={(event) =>
                              updateColumn(index, { name: event.target.value })
                            }
                          />
                        </label>
                        <button
                          aria-label={`Remove ${column.name}`}
                          disabled={columns.length === 1}
                          onClick={() =>
                            setColumns((current) =>
                              current.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            )
                          }
                        >
                          ×
                        </button>
                      </div>
                      <label className="report-budget">
                        <span>Monthly budget</span>
                        <input
                          min="1"
                          placeholder="No budget"
                          step="1"
                          type="number"
                          value={column.budget ?? ""}
                          onChange={(event) =>
                            updateColumn(index, {
                              budget:
                                event.target.value === ""
                                  ? null
                                  : Number(event.target.value),
                            })
                          }
                        />
                      </label>
                      <div className="report-category-options">
                        {report.categories.map((category) => (
                          <label key={category}>
                            <input
                              type="checkbox"
                              checked={column.categories.includes(category)}
                              onChange={(event) =>
                                updateColumn(index, {
                                  categories: event.target.checked
                                    ? [...column.categories, category]
                                    : column.categories.filter(
                                        (item) => item !== category,
                                      ),
                                })
                              }
                            />
                            {category}
                          </label>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
                <button
                  className="add-report-column"
                  onClick={() =>
                    setColumns((current) => [
                      ...current,
                      { name: "New column", categories: [], budget: null },
                    ])
                  }
                >
                  ＋ Add column
                </button>
                {unassignedCategories.length > 0 && (
                  <div
                    aria-live="polite"
                    className="unassigned-categories-notice"
                    role="status"
                  >
                    <strong>Categories without a column</strong>
                    <span>{unassignedCategories.join(", ")}</span>
                  </div>
                )}
              </div>
              {message && <p className="dialog-message">{message}</p>}
              <div className="dialog-actions">
                <button className="cancel" onClick={closeSettings}>
                  Cancel
                </button>
                <button
                  className="save"
                  disabled={saving}
                  onClick={() => void save()}
                >
                  {saving ? "Saving…" : "Save columns"}
                </button>
              </div>
            </section>
          </div>
        )}

        <section className="ledger monthly-report">
          <div className="ledger-head">
            <div>
              <h2>Monthly totals</h2>
              <p>
                Expenses plus income across all active transactions and wallets
              </p>
            </div>
            <span>
              {report.columns.length}{" "}
              {report.columns.length === 1 ? "column" : "columns"}
            </span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  {report.columns.map((column, index) => (
                    <th className="right" key={`${column.name}-${index}`}>
                      <span className="monthly-column-heading">
                        <strong>{column.name}</strong>
                        <span
                          aria-label={`Selected categories: ${column.categories.join(", ")}`}
                          className="category-tooltip"
                          tabIndex={0}
                        >
                          <span aria-hidden="true">ⓘ</span>
                          <span
                            className="category-tooltip-content"
                            role="tooltip"
                          >
                            <b>Selected categories</b>
                            {column.categories.join(", ")}
                          </span>
                        </span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      className="empty"
                      colSpan={Math.max(1, report.columns.length + 1)}
                    >
                      Loading report…
                    </td>
                  </tr>
                ) : report.months.length === 0 ? (
                  <tr>
                    <td
                      className="empty"
                      colSpan={Math.max(1, report.columns.length + 1)}
                    >
                      No categorized transactions yet.
                    </td>
                  </tr>
                ) : (
                  report.months.map((row, rowIndex) => {
                    const year = row.month.slice(0, 4);
                    const previousYear = report.months[
                      rowIndex - 1
                    ]?.month.slice(0, 4);
                    const yearTotals = report.years.find(
                      (totals) => totals.year === year,
                    );
                    return (
                      <Fragment key={row.month}>
                        {year !== previousYear && (
                          <tr className="monthly-year-row">
                            <td>
                              <strong>{year}</strong>
                            </td>
                            {yearTotals?.cells.map((cell, index) => (
                              <td className="right monthly-value" key={index}>
                                {cell.length ? (
                                  cell.map((value) => (
                                    <strong key={value.currency}>
                                      {money(
                                        value.amount,
                                        value.currency,
                                        intlLocale,
                                      )}
                                    </strong>
                                  ))
                                ) : (
                                  <span>—</span>
                                )}
                              </td>
                            ))}
                          </tr>
                        )}
                        <tr>
                          <td>
                            <strong>{monthLabel(row.month, intlLocale)}</strong>
                          </td>
                          {row.cells.map((cell, index) => (
                            <td
                              className={`right monthly-value ${budgetClass(cell, report.columns[index]?.budget)}`}
                              key={index}
                            >
                              {cell.length ? (
                                cell.map((value) => (
                                  <strong key={value.currency}>
                                    {money(
                                      value.amount,
                                      value.currency,
                                      intlLocale,
                                    )}
                                  </strong>
                                ))
                              ) : (
                                <span>—</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
