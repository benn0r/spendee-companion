"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Column = { id?: number; name: string; categories: string[] };
type Cell = Array<{ currency: string; amount: number }>;
type Report = {
  categories: string[];
  columns: Column[];
  months: Array<{ month: string; cells: Cell[] }>;
  configured: boolean;
};

const emptyReport: Report = { categories: [], columns: [], months: [], configured: false };

function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric" })
    .format(new Date(year, month - 1, 1));
}

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("de-CH", { style: "currency", currency }).format(amount);
}

export default function MonthlyReport() {
  const [report, setReport] = useState<Report>(emptyReport);
  const [columns, setColumns] = useState<Column[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/monthly-report", { cache: "no-store" });
      const data = await response.json() as Report;
      setReport(data);
      setColumns(data.columns);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function updateColumn(index: number, patch: Partial<Column>) {
    setColumns((current) => current.map((column, columnIndex) =>
      columnIndex === index ? { ...column, ...patch } : column
    ));
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
      const result = await response.json() as Report & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not save the columns.");
      setReport(result);
      setColumns(result.columns);
      setEditing(false);
      setMessage("Monthly report columns saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the columns.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main>
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand brand-link" href="/">
            <span className="brandmark">S</span>
            <div><strong>Spendee companion</strong><small>Transaction archive</small></div>
          </Link>
          <Link className="back-home" href="/">← Transactions</Link>
        </div>
      </header>
      <div className="workspace monthly-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">SPENDING OVER TIME</p>
            <h1>Monthly categories</h1>
            <p>Compare net category totals by month and combine categories into custom columns.</p>
          </div>
          <button className="report-config-button" onClick={() => setEditing((value) => !value)}>
            {editing ? "Close settings" : "Configure columns"}
          </button>
        </section>

        {message && <div className="notice success">{message}</div>}

        {editing && (
          <section className="report-config">
            <div className="section-heading">
              <div><h2>Table columns</h2><p>Name each column and select the categories it includes.</p></div>
              <button className="save-report" disabled={saving} onClick={() => void save()}>
                {saving ? "Saving…" : "Save columns"}
              </button>
            </div>
            <div className="report-column-list">
              {columns.map((column, index) => (
                <article className="report-column-editor" key={`${column.id ?? "new"}-${index}`}>
                  <div className="report-column-head">
                    <label>
                      <span>Column name</span>
                      <input
                        value={column.name}
                        onChange={(event) => updateColumn(index, { name: event.target.value })}
                      />
                    </label>
                    <button
                      aria-label={`Remove ${column.name}`}
                      disabled={columns.length === 1}
                      onClick={() => setColumns((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                    >×</button>
                  </div>
                  <div className="report-category-options">
                    {report.categories.map((category) => (
                      <label key={category}>
                        <input
                          type="checkbox"
                          checked={column.categories.includes(category)}
                          onChange={(event) => updateColumn(index, {
                            categories: event.target.checked
                              ? [...column.categories, category]
                              : column.categories.filter((item) => item !== category),
                          })}
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
              onClick={() => setColumns((current) => [...current, { name: "New column", categories: [] }])}
            >＋ Add column</button>
          </section>
        )}

        <section className="ledger monthly-report">
          <div className="ledger-head">
            <div><h2>Monthly totals</h2><p>Expenses plus income across all active transactions and wallets</p></div>
            <span>{report.columns.length} {report.columns.length === 1 ? "column" : "columns"}</span>
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
                          <span className="category-tooltip-content" role="tooltip">
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
                  <tr><td className="empty" colSpan={Math.max(1, report.columns.length + 1)}>Loading report…</td></tr>
                ) : report.months.length === 0 ? (
                  <tr><td className="empty" colSpan={Math.max(1, report.columns.length + 1)}>No categorized transactions yet.</td></tr>
                ) : report.months.map((row) => (
                  <tr key={row.month}>
                    <td><strong>{monthLabel(row.month)}</strong></td>
                    {row.cells.map((cell, index) => (
                      <td className="right monthly-value" key={index}>
                        {cell.length ? cell.map((value) => (
                          <strong key={value.currency}>{money(value.amount, value.currency)}</strong>
                        )) : <span>—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
