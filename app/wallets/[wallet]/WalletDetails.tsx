"use client";

import Link from "next/link";
import Brand from "@/app/Brand";
import { Fragment, useCallback, useEffect, useState } from "react";
import DayHeader from "@/app/DayHeader";
import TopNavigation from "@/app/TopNavigation";
import PageSizeSelect from "@/app/PageSizeSelect";
import { dayKey, groupRowsByDay, type DayTotals } from "@/lib/day-groups";
import { categorySlug } from "@/lib/category-slug";
import CategoryIcon from "@/app/CategoryIcon";
import type { CategoryAppearance } from "@/lib/category-appearance";
import { useI18n } from "@/app/I18nProvider";

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

type WalletData = {
  wallet: string;
  rows: Row[];
  dayTotals: DayTotals;
  validUntil: string | null;
  totals: Array<{ currency: string; transactionTotal: number; startingAmount: number; total: number }>;
  page: number;
  pages: number;
  pageSize: number;
  total: number;
};

const emptyData: WalletData = {
  wallet: "",
  rows: [],
  dayTotals: {},
  validUntil: null,
  totals: [],
  page: 1,
  pages: 1,
  pageSize: 25,
  total: 0,
};

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatAmount(amount: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
}

export default function WalletDetails({ wallet }: { wallet: string }) {
  const { intlLocale } = useI18n();
  const [data, setData] = useState<WalletData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingAmounts, setStartingAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(25);
  const [categoryAppearances, setCategoryAppearances] = useState<Record<string, CategoryAppearance>>({});

  const load = useCallback(async (page: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/wallets/${encodeURIComponent(wallet)}?page=${page}&pageSize=${pageSize}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load this wallet.");
      setData(result);
      setStartingAmounts(Object.fromEntries(
        result.totals.map((total: { currency: string; startingAmount: number }) =>
          [total.currency, String(total.startingAmount)]
        ),
      ));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load this wallet.");
    } finally {
      setLoading(false);
    }
  }, [wallet, pageSize]);

  useEffect(() => { void load(1); }, [load]);
  useEffect(() => {
    void fetch("/api/filter-options", { cache: "no-store" })
      .then((response) => response.json())
      .then((result: { categoryAppearances?: Record<string, CategoryAppearance> }) =>
        setCategoryAppearances(result.categoryAppearances ?? {})
      );
  }, []);

  async function saveStartingAmount(currency: string) {
    const amount = Number(startingAmounts[currency]);
    if (!Number.isFinite(amount)) {
      setSettingsError("Enter a valid starting amount.");
      return;
    }
    setSaving(currency);
    setSaved(null);
    setSettingsError(null);
    try {
      const response = await fetch(`/api/wallets/${encodeURIComponent(wallet)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency, startingAmount: amount }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save the starting amount.");
      await load(data.page);
      setSaved(currency);
    } catch (reason) {
      setSettingsError(reason instanceof Error ? reason.message : "Could not save the starting amount.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <main>
      <header className="topbar">
        <div className="topbar-inner">
          <Brand />
          <TopNavigation />
        </div>
      </header>

      <div className="workspace wallet-page">
        <section className="category-hero wallet-detail-hero">
          <div className="category-title">
            <span className="wallet-symbol wallet-color-0">{wallet.slice(0, 1)}</span>
            <div>
              <p className="eyebrow">WALLET</p>
              <h1>{wallet}</h1>
              <p>{data.total.toLocaleString(intlLocale)} active {data.total === 1 ? "transaction" : "transactions"}</p>
            </div>
          </div>
          <div className="category-summary-actions">
            <div className="category-spend wallet-balance-summary">
              <small>Current amount</small>
              {loading && !data.totals.length ? <strong>Loading…</strong> : data.totals.map((total) => (
                <strong className={total.total < 0 ? "negative" : ""} key={total.currency}>
                  {formatAmount(total.total, total.currency, intlLocale)}
                </strong>
              ))}
            </div>
            <button aria-label="Wallet settings" className="settings-cog-button" onClick={() => setSettingsOpen(true)} title="Wallet settings">⚙</button>
          </div>
        </section>

        {settingsOpen && (
          <div className="dialog-backdrop" role="presentation" onMouseDown={() => setSettingsOpen(false)}>
            <section
              aria-labelledby="wallet-settings-title"
              aria-modal="true"
              className="category-settings-dialog wallet-settings-dialog"
              role="dialog"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="dialog-head">
                <div>
                  <p className="eyebrow">WALLET</p>
                  <h2 id="wallet-settings-title">Wallet settings</h2>
                  <span>Set the starting amount for each currency.</span>
                </div>
                <button aria-label="Close settings" onClick={() => setSettingsOpen(false)}>×</button>
              </div>
              <div className="wallet-starting-settings">
                <div className="wallet-settings-heading">
                  <b>Starting amounts</b>
                  <span>Starting amounts are added to the imported transaction total.</span>
                </div>
                {data.totals.map((total) => (
                  <label className="wallet-starting-row" key={total.currency}>
                    <span>Starting amount</span>
                    <div>
                      <input
                        aria-label={`Starting amount in ${total.currency}`}
                        inputMode="decimal"
                        type="number"
                        step="0.01"
                        value={startingAmounts[total.currency] ?? ""}
                        onChange={(event) => setStartingAmounts((current) => ({ ...current, [total.currency]: event.target.value }))}
                      />
                      <b>{total.currency}</b>
                      <button disabled={saving === total.currency} onClick={() => void saveStartingAmount(total.currency)} type="button">
                        {saving === total.currency ? "Saving…" : saved === total.currency ? "Saved" : "Save"}
                      </button>
                    </div>
                  </label>
                ))}
              </div>
              {settingsError && <p className="dialog-message error">{settingsError}</p>}
              <div className="dialog-actions">
                <button className="cancel" onClick={() => setSettingsOpen(false)}>Close</button>
              </div>
            </section>
          </div>
        )}

        {error ? (
          <section className="wallet-error">
            <h2>{error}</h2>
            <Link href="/">Return to all wallets</Link>
          </section>
        ) : (
          <section className="ledger">
            <div className="ledger-head">
              <div><h2>Wallet activity</h2><p>Active transactions, newest first</p></div>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Note & labels</th><th>Author</th><th className="right">Amount</th></tr></thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} className="empty">Loading wallet…</td></tr>
                  ) : groupRowsByDay(data.rows).map((group) => (
                    <Fragment key={group.key}>
                      <DayHeader colSpan={6} day={group.key} totals={data.dayTotals[group.key] ?? []} />
                      {group.rows.map((row) => (
                        <tr key={row.id}>
                          <td>
                            <strong>{formatDate(row.date, intlLocale)}</strong>
                            {data.validUntil && dayKey(row.date) <= data.validUntil && <span className="verified-badge">✓ Verified</span>}
                          </td>
                          <td><span className={`type ${row.type.toLowerCase().replaceAll(" ", "-")}`}>{row.type}</span></td>
                          <td>{row.categoryName ? <Link className="category-link category-link-with-icon" href={`/categories/${categorySlug(row.categoryName)}`}><CategoryIcon appearance={categoryAppearances[row.categoryName]} />{row.categoryName}</Link> : "—"}</td>
                          <td>{row.note || row.labels ? <><span>{row.note ?? "—"}</span><small>{row.labels}</small></> : "—"}</td>
                          <td>{row.author ?? "—"}</td>
                          <td className="right"><span className={`amount ${row.amount < 0 ? "expense" : "income"}`}>{formatAmount(row.amount, row.currency, intlLocale)}</span></td>
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
        )}
      </div>
    </main>
  );
}
