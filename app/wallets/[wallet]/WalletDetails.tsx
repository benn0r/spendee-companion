"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

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

type WalletData = {
  wallet: string;
  rows: Row[];
  totals: Array<{ currency: string; total: number }>;
  page: number;
  pages: number;
  pageSize: number;
  total: number;
};

const emptyData: WalletData = {
  wallet: "",
  rows: [],
  totals: [],
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

export default function WalletDetails({ wallet }: { wallet: string }) {
  const [data, setData] = useState<WalletData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (page: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/wallets/${encodeURIComponent(wallet)}?page=${page}&pageSize=25`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load this wallet.");
      setData(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load this wallet.");
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => { void load(1); }, [load]);

  return (
    <main>
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand brand-link" href="/">
            <span className="brandmark">S</span>
            <div><strong>Spendee</strong><small>Import companion</small></div>
          </Link>
          <Link className="back-home" href="/">← All wallets</Link>
        </div>
      </header>

      <div className="workspace wallet-page">
        <section className="wallet-hero">
          <div className="wallet-hero-title">
            <span className="wallet-symbol wallet-color-0">{wallet.slice(0, 1)}</span>
            <div>
              <p className="eyebrow">WALLET</p>
              <h1>{wallet}</h1>
              <p>{data.total.toLocaleString("en-CH")} active {data.total === 1 ? "transaction" : "transactions"}</p>
            </div>
          </div>
          <div className="balance-group">
            <small>Current amount</small>
            {loading && !data.totals.length ? (
              <strong>Loading…</strong>
            ) : data.totals.map((total) => (
              <strong className={total.total < 0 ? "negative" : ""} key={total.currency}>
                {formatAmount(total.total, total.currency)}
              </strong>
            ))}
          </div>
        </section>

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
                  ) : data.rows.map((row) => (
                    <tr key={row.id}>
                      <td><strong>{formatDate(row.date)}</strong><small>{row.sourceFile} · row {row.sourceRow}</small></td>
                      <td><span className={`type ${row.type.toLowerCase().replaceAll(" ", "-")}`}>{row.type}</span></td>
                      <td>{row.categoryName ?? "—"}</td>
                      <td>{row.note || row.labels ? <><span>{row.note ?? "—"}</span><small>{row.labels}</small></> : "—"}</td>
                      <td>{row.author ?? "—"}</td>
                      <td className="right"><span className={`amount ${row.amount < 0 ? "expense" : "income"}`}>{formatAmount(row.amount, row.currency)}</span></td>
                    </tr>
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
        )}
      </div>
      <footer>Spendee archive · Your data stays in your SQLite database.</footer>
    </main>
  );
}
