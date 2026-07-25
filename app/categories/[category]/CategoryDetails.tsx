"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import DayHeader from "@/app/DayHeader";
import TopNavigation from "@/app/TopNavigation";
import PageSizeSelect from "@/app/PageSizeSelect";
import TransactionFilters, { emptyFilters, filterQuery, type FilterOptions, type FilterState } from "@/app/TransactionFilters";
import { dayKey, groupRowsByDay, type DayTotals } from "@/lib/day-groups";

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
};

type CategoryData = {
  category: string;
  rows: Row[];
  dayTotals: DayTotals;
  validUntil: string | null;
  wallets: Array<{ wallet: string; transactionCount: number }>;
  spendingTotals: Array<{ currency: string; amount: number }>;
  availableTags: string[];
  selectedTags: string[];
  spendingByTagEnabled: boolean;
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
  validUntil: null,
  wallets: [],
  spendingTotals: [],
  availableTags: [],
  selectedTags: [],
  spendingByTagEnabled: true,
  tagConfigSaved: false,
  segments: [],
  page: 1,
  pages: 1,
  pageSize: 25,
  total: 0,
};

const emptyFilterOptions: FilterOptions = { wallets: [], types: [], categories: [], tags: [], authors: [] };

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
    cursor += total ? (Math.abs(segment.amount) / total) * 100 : 0;
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
  const [pageSize, setPageSize] = useState(25);
  const [tagMessage, setTagMessage] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [spendingByTagEnabled, setSpendingByTagEnabled] = useState(true);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>(emptyFilterOptions);
  const [draftFilters, setDraftFilters] = useState<FilterState>(emptyFilters);
  const [activeFilterQuery, setActiveFilterQuery] = useState("");

  const load = useCallback(async (page: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/categories/${category}?page=${page}&pageSize=${pageSize}${activeFilterQuery ? `&${activeFilterQuery}` : ""}`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load this category.");
      setData(result);
      setSelectedTags(result.selectedTags);
      setSpendingByTagEnabled(result.spendingByTagEnabled);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load this category.");
    } finally {
      setLoading(false);
    }
  }, [activeFilterQuery, category, pageSize]);

  useEffect(() => { void load(1); }, [load]);
  useEffect(() => {
    void fetch("/api/filter-options", { cache: "no-store" })
      .then((response) => response.json())
      .then((options: FilterOptions) => setFilterOptions(options));
  }, []);

  const chartGroups = useMemo(() => data.spendingTotals.map((total) => {
    const segments = data.segments.filter((segment) => segment.currency === total.currency);
    return {
      ...total,
      segments,
      magnitude: segments.reduce((sum, segment) => sum + Math.abs(segment.amount), 0),
    };
  }), [data.spendingTotals, data.segments]);

  async function saveTagSelection() {
    setSavingTags(true);
    setTagMessage(null);
    try {
      const response = await fetch(`/api/categories/${category}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedTags, spendingByTagEnabled }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save tag selection.");
      await load(data.page);
      setTagMessage("Category settings saved.");
      setSettingsOpen(false);
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
            <div><strong>Spendee companion</strong><small>Transaction archive</small></div>
          </Link>
          <TopNavigation />
        </div>
      </header>

      <div className="workspace category-page">
        <section className="category-hero">
          <div className="category-title">
            <span className="category-symbol">#</span>
            <div>
              <p className="eyebrow">CATEGORY</p>
              <h1>{data.category || "Category"}</h1>
              <p>{data.total.toLocaleString("en-CH")} matching {data.total === 1 ? "transaction" : "transactions"} across {data.wallets.length} {data.wallets.length === 1 ? "wallet" : "wallets"}</p>
            </div>
          </div>
          <div className="category-summary-actions">
            <div className="category-spend">
              <small>Net category total</small>
              {loading && !data.spendingTotals.length ? <strong>Loading…</strong> : data.spendingTotals.map((total) => (
                <strong key={total.currency}>{formatAmount(total.amount, total.currency)}</strong>
              ))}
            </div>
            <button aria-label="Category settings" className="settings-cog-button" onClick={() => setSettingsOpen(true)} title="Category settings">⚙</button>
          </div>
        </section>

        {settingsOpen && (
          <div className="dialog-backdrop" role="presentation" onMouseDown={() => setSettingsOpen(false)}>
            <section
              aria-labelledby="category-settings-title"
              aria-modal="true"
              className="category-settings-dialog"
              role="dialog"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="dialog-head">
                <div>
                  <p className="eyebrow">CATEGORY</p>
                  <h2 id="category-settings-title">Category settings</h2>
                  <span>Choose which insights are shown for {data.category}.</span>
                </div>
                <button aria-label="Close settings" onClick={() => setSettingsOpen(false)}>×</button>
              </div>
              <label className="setting-toggle">
                <span><b>Spending by tag</b><small>Include expenses and income to show the net amount for each tag.</small></span>
                <input
                  checked={spendingByTagEnabled}
                  onChange={(event) => setSpendingByTagEnabled(event.target.checked)}
                  type="checkbox"
                />
              </label>
              {spendingByTagEnabled && (
                <div className="dialog-tag-settings">
                  <div className="tag-config-head">
                    <div><b>Tags in the chart</b><span>{selectedTags.length} of {data.availableTags.length} selected</span></div>
                    <div>
                      <button type="button" onClick={() => setSelectedTags(data.availableTags)}>Select all</button>
                      <button type="button" onClick={() => setSelectedTags([])}>Clear</button>
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
                </div>
              )}
              {tagMessage && <p className="dialog-message">{tagMessage}</p>}
              <div className="dialog-actions">
                <button className="cancel" onClick={() => setSettingsOpen(false)}>Cancel</button>
                <button className="save" disabled={savingTags} onClick={() => void saveTagSelection()}>
                  {savingTags ? "Saving…" : "Save settings"}
                </button>
              </div>
            </section>
          </div>
        )}

        {error ? (
          <section className="wallet-error">
            <h2>{error}</h2>
            <Link href="/">Return to transactions</Link>
          </section>
        ) : (
          <>
            {data.spendingByTagEnabled && <section className="tag-chart-card">
              <div className="section-heading">
                <div><h2>Spending by tag</h2><p>Net expenses and income; selected tags are shown separately and everything else is Other</p></div>
              </div>
              {chartGroups.length === 0 && !loading ? (
                <div className="chart-empty">No transactions in this category.</div>
              ) : chartGroups.map((group) => (
                <div className="pie-chart-group" key={group.currency}>
                  <div
                    aria-label={`${group.currency} spending pie chart`}
                    className="pie-chart"
                    role="img"
                    style={{ background: pieGradient(group.segments, group.magnitude) }}
                  >
                    <span>{group.currency}<b>{formatAmount(group.amount, group.currency)}</b></span>
                  </div>
                  <div className="pie-legend">
                    {group.segments.map((segment, index) => (
                      <div key={`${segment.currency}-${segment.tag}`}>
                        <span style={{ background: chartColors[index % chartColors.length] }}></span>
                        <b>{segment.tag}</b>
                        <small>{group.magnitude ? ((Math.abs(segment.amount) / group.magnitude) * 100).toFixed(1) : "0.0"}%</small>
                        <strong>{formatAmount(segment.amount, segment.currency)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <p className="chart-note">Income offsets expenses within each tag. Pie sizes use the magnitude of each resulting net amount.</p>
            </section>}

            <section className="ledger">
              <div className="ledger-head">
                <div><h2>Category transactions</h2><p>All matching wallets, newest first</p></div>
              </div>
              <TransactionFilters
                active={Boolean(activeFilterQuery)}
                hideCategories
                onApply={() => setActiveFilterQuery(filterQuery(draftFilters))}
                onChange={setDraftFilters}
                onClear={() => {
                  setDraftFilters(emptyFilters);
                  setActiveFilterQuery("");
                }}
                options={filterOptions}
                value={draftFilters}
              />
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
                            <td>
                              <strong>{formatDate(row.date)}</strong>
                              {data.validUntil && dayKey(row.date) <= data.validUntil && <span className="verified-badge">✓ Verified</span>}
                            </td>
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
                <div className="pagination-summary">
                  <span>{data.total ? `${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)} of ${data.total}` : "0 records"}</span>
                  <PageSizeSelect value={pageSize} onChange={setPageSize} />
                </div>
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
    </main>
  );
}
