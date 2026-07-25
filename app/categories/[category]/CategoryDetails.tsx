"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import DayHeader from "@/app/DayHeader";
import { groupRowsByDay, type DayTotals } from "@/lib/day-groups";

type Row = {
  id: number;
  date: string;
  wallet: string;
  type: string;
  categoryName: string | null;
  amount: number;
  currency: string;
  note: string | null;
  labels: string | null;
  author: string | null;
  sourceFile: string;
  sourceRow: number;
};

type CategoryData = {
  category: string;
  rows: Row[];
  dayTotals: DayTotals;
  wallets: Array<{ wallet: string; transactionCount: number }>;
  spendingTotals: Array<{ currency: string; amount: number }>;
  availableTags: string[];
  selectedTags: string[];
  tagConfigSaved: boolean;
  segments: Array<{ tag: string; currency: string; amount: number; transactionCount: number }>;
  page: number;
  pages: number;
  pageSize: number;
  total: number;
};

const emptyData: CategoryData = {
  category: "",
  rows: [],
  dayTotals: {},
  wallets: [],
  spendingTotals: [],
  availableTags: [],
  selectedTags: [],
  tagConfigSaved: false,
  segments: [],
  page: 1,
  pages: 1,
  pageSize: 25,
  total: 0,
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-CH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("de-CH", { style: "currency", currency }).format(amount);
}

const chartColors = ["#12c48b", "#1eadcf", "#feb100", "#f964a0", "#7c6ee6", "#fb6666", "#53a653", "#8f6b4f", "#344554"];

function pieGradient(segments: Array<{ amount: number }>, total: number) {
  let cursor = 0;
  const stops = segments.map((segment, index) => {
    const start = cursor;
    cursor += total ? (segment.amount / total) * 100 : 0;
    return `${chartColors[index % chartColors.length]} ${start}% ${cursor}%`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

export default function CategoryDetails({ category }: { category: string }) {
  const [data, setData] = useState<CategoryData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [savingTags, setSavingTags] = useState(false);
  const [tagMessage, setTagMessage] = useState<string | null>(null);

  const load = useCallback(async (page: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/categories/${encodeURIComponent(category)}?page=${page}&pageSize=25`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load this category.");
      setData(result);
      setSelectedTags(result.selectedTags);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load this category.");
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => { void load(1); }, [load]);

  const chartGroups = useMemo(() => data.spendingTotals.map((total) => {
    const segments = data.segments.filter((segment) => segment.currency === total.currency);
    return {
      ...total,
      segments,
    };
  }), [data.spendingTotals, data.segments]);

  async function saveTagSelection() {
    setSavingTags(true);
    setTagMessage(null);
    try {
      const response = await fetch(`/api/categories/${encodeURIComponent(category)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedTags }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save tag selection.");
      await load(data.page);
      setTagMessage("Tag selection saved.");
    } catch (reason) {
      setTagMessage(reason instanceof Error ? reason.message : "Could not save tag selection.");
    } finally {
      setSavingTags(false);
    }
  }

  return (
    <main>
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand brand-link" href="/">
            <span className="brandmark">S</span>
            <div><strong>Spendee</strong><small>Import companion</small></div>
          </Link>
          <Link className="back-home" href="/">← Transactions</Link>
        </div>
      </header>

      <div className="workspace category-page">
        <section className="category-hero">
          <div className="category-title">
            <span className="category-symbol">#</span>
            <div>
              <p className="eyebrow">CATEGORY</p>
              <h1>{category}</h1>
              <p>{data.total.toLocaleString("en-CH")} matching {data.total === 1 ? "transaction" : "transactions"} across {data.wallets.length} {data.wallets.length === 1 ? "wallet" : "wallets"}</p>
            </div>
          </div>
          <div className="category-spend">
            <small>Total spent</small>
            {loading && !data.spendingTotals.length ? <strong>Loading…</strong> : data.spendingTotals.map((total) => (
              <strong key={total.currency}>{formatAmount(total.amount, total.currency)}</strong>
            ))}
          </div>
        </section>

        {error ? (
          <section className="wallet-error">
            <h2>{error}</h2>
            <Link href="/">Return to transactions</Link>
          </section>
        ) : (
          <>
            <section className="tag-chart-card">
              <div className="section-heading">
                <div><h2>Spending by tag</h2><p>Selected tags are shown separately; everything else is grouped as Other</p></div>
              </div>
              <div className="tag-config">
                <div className="tag-config-head">
                  <div><b>Tags in this chart</b><span>{selectedTags.length} of {data.availableTags.length} selected</span></div>
                  <div>
                    <button type="button" onClick={() => setSelectedTags(data.availableTags)}>Select all</button>
                    <button type="button" onClick={() => setSelectedTags([])}>Clear</button>
                    <button className="save-tags" disabled={savingTags} type="button" onClick={() => void saveTagSelection()}>
                      {savingTags ? "Saving…" : "Save selection"}
                    </button>
                  </div>
                </div>
                <div className="tag-options">
                  {data.availableTags.map((tag) => (
                    <label key={tag}>
                      <input
                        checked={selectedTags.includes(tag)}
                        onChange={(event) => setSelectedTags((current) =>
                          event.target.checked ? [...current, tag] : current.filter((item) => item !== tag)
                        )}
                        type="checkbox"
                      />
                      <span>{tag}</span>
                    </label>
                  ))}
                </div>
                {!data.tagConfigSaved && <p>Top tags are selected by default. Save a selection to customize this category.</p>}
                {tagMessage && <p>{tagMessage}</p>}
              </div>
              {chartGroups.length === 0 && !loading ? (
                <div className="chart-empty">No expense transactions in this category.</div>
              ) : chartGroups.map((group) => (
                <div className="pie-chart-group" key={group.currency}>
                  <div
                    aria-label={`${group.currency} spending pie chart`}
                    className="pie-chart"
                    role="img"
                    style={{ background: pieGradient(group.segments, group.amount) }}
                  >
                    <span>{group.currency}<b>{formatAmount(group.amount, group.currency)}</b></span>
                  </div>
                  <div className="pie-legend">
                    {group.segments.map((segment, index) => (
                      <div key={`${segment.currency}-${segment.tag}`}>
                        <span style={{ background: chartColors[index % chartColors.length] }}></span>
                        <b>{segment.tag}</b>
                        <small>{group.amount ? ((segment.amount / group.amount) * 100).toFixed(1) : "0.0"}%</small>
                        <strong>{formatAmount(segment.amount, segment.currency)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <p className="chart-note">When a transaction has multiple selected tags, its amount is split evenly between them so the pie always equals total spending.</p>
            </section>

            <section className="category-wallets">
              <div className="section-heading">
                <div><h2>Wallets</h2><p>Where these transactions occurred</p></div>
              </div>
              <div>
                {data.wallets.map((wallet) => (
                  <Link href={`/wallets/${encodeURIComponent(wallet.wallet)}`} key={wallet.wallet}>
                    <span className="wallet">{wallet.wallet.slice(0, 1)}</span>
                    <b>{wallet.wallet}</b>
                    <small>{wallet.transactionCount}</small>
                  </Link>
                ))}
              </div>
            </section>

            <section className="ledger">
              <div className="ledger-head">
                <div><h2>Category transactions</h2><p>All matching wallets, newest first</p></div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Date</th><th>Wallet</th><th>Type</th><th>Note & labels</th><th>Author</th><th className="right">Amount</th></tr></thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={6} className="empty">Loading category…</td></tr>
                    ) : groupRowsByDay(data.rows).map((group) => (
                      <Fragment key={group.key}>
                        <DayHeader colSpan={6} day={group.key} totals={data.dayTotals[group.key] ?? []} />
                        {group.rows.map((row) => (
                          <tr key={row.id}>
                            <td><strong>{formatDate(row.date)}</strong><small>{row.sourceFile} · row {row.sourceRow}</small></td>
                            <td><Link className="wallet-link" href={`/wallets/${encodeURIComponent(row.wallet)}`}><span className="wallet">{row.wallet.slice(0, 1)}</span>{row.wallet}</Link></td>
                            <td><span className={`type ${row.type.toLowerCase().replaceAll(" ", "-")}`}>{row.type}</span></td>
                            <td>{row.note || row.labels ? <><span>{row.note ?? "—"}</span><small>{row.labels}</small></> : "—"}</td>
                            <td>{row.author ?? "—"}</td>
                            <td className="right"><span className={`amount ${row.amount < 0 ? "expense" : "income"}`}>{formatAmount(row.amount, row.currency)}</span></td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pagination">
                <span>{data.total ? `${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)} of ${data.total}` : "0 records"}</span>
                <div>
                  <button disabled={data.page <= 1 || loading} onClick={() => void load(data.page - 1)}>←</button>
                  <span>Page {data.page} of {data.pages}</span>
                  <button disabled={data.page >= data.pages || loading} onClick={() => void load(data.page + 1)}>→</button>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
      <footer>Spendee archive · Your data stays in your SQLite database.</footer>
    </main>
  );
}
