"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import DayHeader from "./DayHeader";
import { groupRowsByDay, type DayTotals } from "@/lib/day-groups";

type Stats = { transactions: number; duplicates: number; imports: number; wallets: number; pending: number };
type Row = {
  id: number;
  duplicateOfId?: number;
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
type PageData = { rows: Row[]; dayTotals: DayTotals; page: number; pages: number; total: number; pageSize: number };
type ReviewItem = Row & { action: "update" | "delete"; transactionId: number; isDeleted: number; proposed: (Row & { fingerprint: string; identityKey: string }) | null };
type ImportResult = { summary: { total: number; imported: number; duplicates: number; changes: number; deletions: number; files: number; failed: number } };
type WalletSummary = {
  wallet: string;
  transactionCount: number;
  totals: Array<{ currency: string; transactionTotal: number; startingAmount: number; total: number }>;
};

const emptyStats = { transactions: 0, duplicates: 0, imports: 0, wallets: 0, pending: 0 };
const emptyPage = { rows: [], dayTotals: {}, page: 1, pages: 1, total: 0, pageSize: 25 };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-CH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function Amount({ row }: { row: Row }) {
  return (
    <span className={row.amount < 0 ? "amount expense" : "amount income"}>
      {new Intl.NumberFormat("de-CH", { style: "currency", currency: row.currency }).format(row.amount)}
    </span>
  );
}

export default function Dashboard() {
  const [tab, setTab] = useState<"transactions" | "duplicates">("transactions");
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [data, setData] = useState<PageData>(emptyPage);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fullImport, setFullImport] = useState(false);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [wallets, setWallets] = useState<WalletSummary[]>([]);
  const [selectedReviews, setSelectedReviews] = useState<number[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (targetTab = tab, page = 1) => {
    setLoading(true);
    try {
      const [statsResponse, pageResponse, reviewResponse, walletsResponse] = await Promise.all([
        fetch("/api/stats", { cache: "no-store" }),
        fetch(`/api/${targetTab}?page=${page}&pageSize=25`, { cache: "no-store" }),
        fetch("/api/reconciliation", { cache: "no-store" }),
        fetch("/api/wallets", { cache: "no-store" }),
      ]);
      setStats(await statsResponse.json());
      setData(await pageResponse.json());
      const reviewData = await reviewResponse.json();
      setReviews(reviewData.rows);
      const walletData = await walletsResponse.json();
      setWallets(walletData.wallets);
      setSelectedReviews([]);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { void load(tab, 1); }, [tab, load]);

  async function upload(files: FileList | File[]) {
    if (!files.length) return;
    setUploading(true);
    setMessage(null);
    const form = new FormData();
    form.set("fullImport", String(fullImport));
    Array.from(files).forEach((file) => form.append("files", file));
    try {
      const response = await fetch("/api/import", { method: "POST", body: form });
      const result = await response.json() as ImportResult & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Import failed.");
      setMessage({
        tone: result.summary.failed ? "error" : "success",
        text: `${result.summary.files} file${result.summary.files === 1 ? "" : "s"} processed · ${result.summary.imported} imported · ${result.summary.duplicates} duplicate${result.summary.duplicates === 1 ? "" : "s"} separated${result.summary.changes || result.summary.deletions ? ` · ${result.summary.changes + result.summary.deletions} awaiting approval` : ""}${result.summary.failed ? ` · ${result.summary.failed} file${result.summary.failed === 1 ? "" : "s"} failed` : ""}`,
      });
      await load(tab, 1);
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Import failed." });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function review(decision: "approved" | "rejected") {
    if (!selectedReviews.length) return;
    setReviewing(true);
    try {
      const response = await fetch("/api/reconciliation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedReviews, decision }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Review failed.");
      setMessage({
        tone: "success",
        text: `${result.reviewed} pending ${result.reviewed === 1 ? "item" : "items"} ${decision}.`,
      });
      await load(tab, data.page);
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Review failed." });
    } finally {
      setReviewing(false);
    }
  }

  return (
    <main>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brandmark">S</span>
            <div><strong>Spendee</strong><small>Import companion</small></div>
          </div>
          <button className="top-upload" disabled={uploading} onClick={() => inputRef.current?.click()}>
            <span>＋</span>{uploading ? "Importing…" : "Import files"}
          </button>
        </div>
      </header>

      <div className="workspace">
        <section className="page-heading">
          <div>
            <p className="eyebrow">TRANSACTION ARCHIVE</p>
            <h1>Transactions</h1>
            <p>Import and review your Spendee exports in one place.</p>
          </div>
          <div className="database-status"><span></span> SQLite connected</div>
        </section>

        {message && <div className={`notice ${message.tone}`}>{message.text}</div>}

        {wallets.length > 0 && (
          <section className="wallet-overview" aria-labelledby="wallet-overview-title">
            <div className="section-heading">
              <div><h2 id="wallet-overview-title">Wallet totals</h2><p>Current balance from active transactions</p></div>
              <span>{wallets.length} {wallets.length === 1 ? "wallet" : "wallets"}</span>
            </div>
            <div className="wallet-grid">
              {wallets.map((wallet, index) => (
                <Link className="wallet-card" href={`/wallets/${encodeURIComponent(wallet.wallet)}`} key={wallet.wallet}>
                  <span className={`wallet-symbol wallet-color-${index % 4}`}>{wallet.wallet.slice(0, 1)}</span>
                  <span className="wallet-card-copy">
                    <strong>{wallet.wallet}</strong>
                    <small>{wallet.transactionCount.toLocaleString("en-CH")} {wallet.transactionCount === 1 ? "transaction" : "transactions"}</small>
                  </span>
                  <span className="wallet-totals">
                    {wallet.totals.map((total) => (
                      <b className={total.total < 0 ? "negative" : ""} key={total.currency}>
                        {new Intl.NumberFormat("de-CH", { style: "currency", currency: total.currency }).format(total.total)}
                      </b>
                    ))}
                  </span>
                  <span className="wallet-arrow">→</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="overview-grid">
          <div
            className={`dropzone ${dragging ? "dragging" : ""}`}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); setDragging(false); void upload(event.dataTransfer.files); }}
          >
            <div className="upload-icon">↑</div>
            <div className="upload-copy">
              <h2>{uploading ? "Importing your files…" : "Import Spendee exports"}</h2>
              <p>Drop a batch of XLSX or CSV files here, or browse from your computer.</p>
              <span>Duplicates are detected automatically and kept separately.</span>
              <label className="full-import">
                <input type="checkbox" checked={fullImport} onChange={(event) => setFullImport(event.target.checked)} />
                <span><b>Full import</b> · find changed and missing transactions per wallet</span>
              </label>
            </div>
            <button disabled={uploading} onClick={() => inputRef.current?.click()}>
              {uploading ? "Please wait" : "Choose files"}
            </button>
            <input ref={inputRef} type="file" accept=".xlsx,.csv,text/csv" multiple hidden onChange={(event) => event.target.files && void upload(event.target.files)} />
          </div>

          <div className="stats">
            <article><span className="metric-icon green">↕</span><div><small>Transactions</small><strong>{stats.transactions.toLocaleString("en-CH")}</strong></div></article>
            <article><span className="metric-icon blue">◫</span><div><small>Wallets</small><strong>{stats.wallets.toLocaleString("en-CH")}</strong></div></article>
            <article><span className="metric-icon yellow">⇧</span><div><small>Imports</small><strong>{stats.imports.toLocaleString("en-CH")}</strong></div></article>
            <article><span className="metric-icon pink">!</span><div><small>Duplicates</small><strong>{stats.duplicates.toLocaleString("en-CH")}</strong></div></article>
          </div>
        </section>

        {reviews.length > 0 && (
          <section className="review-card">
            <div className="review-head">
              <div>
                <div className="review-title"><span>!</span><div><h2>Approval required</h2><p>{reviews.length} proposed {reviews.length === 1 ? "change needs" : "changes need"} your review</p></div></div>
              </div>
              <div className="review-actions">
                <button className="reject" disabled={!selectedReviews.length || reviewing} onClick={() => void review("rejected")}>Keep current</button>
                <button className="approve" disabled={!selectedReviews.length || reviewing} onClick={() => void review("approved")}>Approve selected</button>
              </div>
            </div>
            <div className="review-list">
              {reviews.map((item) => (
                <label className="review-item" key={item.id}>
                  <input
                    type="checkbox"
                    checked={selectedReviews.includes(item.id)}
                    onChange={(event) => setSelectedReviews((current) =>
                      event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id)
                    )}
                  />
                  <span className={`review-kind ${item.action}`}>{item.action === "delete" ? "Missing" : item.isDeleted ? "Restore" : "Changed"}</span>
                  <span className="review-identity"><b>{item.wallet}</b><small>{formatDate(item.date)} · {item.type}</small></span>
                  {item.action === "delete" ? (
                    <span className="review-detail">Remove <Amount row={item} /> from the active ledger</span>
                  ) : item.isDeleted ? (
                    <span className="review-detail">Restore this transaction to the active ledger</span>
                  ) : (
                    <span className="review-detail">
                      Amount <b>{new Intl.NumberFormat("de-CH", { style: "currency", currency: item.currency }).format(item.amount)}</b>
                      <span>→</span>
                      <b>{new Intl.NumberFormat("de-CH", { style: "currency", currency: item.proposed?.currency ?? item.currency }).format(item.proposed?.amount ?? item.amount)}</b>
                      {item.categoryName !== item.proposed?.categoryName && <small>{item.categoryName ?? "No category"} → {item.proposed?.categoryName ?? "No category"}</small>}
                    </span>
                  )}
                </label>
              ))}
            </div>
          </section>
        )}

        <section className="ledger">
          <div className="ledger-head">
            <div>
              <h2>Transaction history</h2>
              <p>All imported records, newest first</p>
            </div>
            <div className="tabs">
              <button className={tab === "transactions" ? "active" : ""} onClick={() => setTab("transactions")}>Transactions <span>{stats.transactions}</span></button>
              <button className={tab === "duplicates" ? "active" : ""} onClick={() => setTab("duplicates")}>Duplicates <span>{stats.duplicates}</span></button>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Wallet</th><th>Type</th><th>Category</th><th>Note & labels</th><th>Author</th><th className="right">Amount</th></tr></thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="empty">Loading transactions…</td></tr>
                ) : data.rows.length === 0 ? (
                  <tr><td colSpan={7} className="empty">{tab === "transactions" ? "Import an XLSX or CSV export to begin." : "No duplicates have been found."}</td></tr>
                ) : groupRowsByDay(data.rows).map((group) => (
                  <Fragment key={group.key}>
                    <DayHeader colSpan={7} day={group.key} totals={data.dayTotals[group.key] ?? []} />
                    {group.rows.map((row) => (
                      <tr key={row.id}>
                        <td><strong>{formatDate(row.date)}</strong><small>{row.sourceFile} · row {row.sourceRow}</small></td>
                        <td><Link className="wallet-link" href={`/wallets/${encodeURIComponent(row.wallet)}`}><span className="wallet">{row.wallet.slice(0, 1)}</span>{row.wallet}</Link></td>
                        <td><span className={`type ${row.type.toLowerCase().replaceAll(" ", "-")}`}>{row.type}</span></td>
                        <td>{row.categoryName ? <Link className="category-link" href={`/categories/${encodeURIComponent(row.categoryName)}`}>{row.categoryName}</Link> : "—"}</td>
                        <td>{row.note || row.labels ? <><span>{row.note ?? "—"}</span><small>{row.labels}</small></> : "—"}</td>
                        <td>{row.author ?? "—"}</td>
                        <td className="right"><Amount row={row} />{row.duplicateOfId && <small>matches #{row.duplicateOfId}</small>}</td>
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
              <button disabled={data.page <= 1 || loading} onClick={() => void load(tab, data.page - 1)}>←</button>
              <span>Page {data.page} of {data.pages}</span>
              <button disabled={data.page >= data.pages || loading} onClick={() => void load(tab, data.page + 1)}>→</button>
            </div>
          </div>
        </section>
      </div>
      <footer>Spendee archive · Your data stays in your SQLite database.</footer>
    </main>
  );
}
