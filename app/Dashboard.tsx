"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Stats = { transactions: number; duplicates: number; imports: number; wallets: number };
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
type PageData = { rows: Row[]; page: number; pages: number; total: number; pageSize: number };
type ImportResult = { summary: { total: number; imported: number; duplicates: number; files: number; failed: number } };

const emptyStats = { transactions: 0, duplicates: 0, imports: 0, wallets: 0 };
const emptyPage = { rows: [], page: 1, pages: 1, total: 0, pageSize: 25 };

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
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (targetTab = tab, page = 1) => {
    setLoading(true);
    try {
      const [statsResponse, pageResponse] = await Promise.all([
        fetch("/api/stats", { cache: "no-store" }),
        fetch(`/api/${targetTab}?page=${page}&pageSize=25`, { cache: "no-store" }),
      ]);
      setStats(await statsResponse.json());
      setData(await pageResponse.json());
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
    Array.from(files).forEach((file) => form.append("files", file));
    try {
      const response = await fetch("/api/import", { method: "POST", body: form });
      const result = await response.json() as ImportResult & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Import failed.");
      setMessage({
        tone: result.summary.failed ? "error" : "success",
        text: `${result.summary.files} file${result.summary.files === 1 ? "" : "s"} processed · ${result.summary.imported} imported · ${result.summary.duplicates} duplicate${result.summary.duplicates === 1 ? "" : "s"} separated${result.summary.failed ? ` · ${result.summary.failed} file${result.summary.failed === 1 ? "" : "s"} failed` : ""}`,
      });
      await load(tab, 1);
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Import failed." });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
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
                ) : data.rows.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{formatDate(row.date)}</strong><small>{row.sourceFile} · row {row.sourceRow}</small></td>
                    <td><span className="wallet">{row.wallet.slice(0, 1)}</span>{row.wallet}</td>
                    <td><span className={`type ${row.type.toLowerCase().replaceAll(" ", "-")}`}>{row.type}</span></td>
                    <td>{row.categoryName ?? "—"}</td>
                    <td>{row.note || row.labels ? <><span>{row.note ?? "—"}</span><small>{row.labels}</small></> : "—"}</td>
                    <td>{row.author ?? "—"}</td>
                    <td className="right"><Amount row={row} />{row.duplicateOfId && <small>matches #{row.duplicateOfId}</small>}</td>
                  </tr>
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
