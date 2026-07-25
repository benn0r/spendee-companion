"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import DayHeader from "./DayHeader";
import { dayKey, groupRowsByDay, type DayTotals } from "@/lib/day-groups";
import { categorySlug } from "@/lib/category-slug";
import TransactionFilters, {
  emptyFilters,
  filterQuery,
  type FilterOptions,
  type FilterState,
} from "./TransactionFilters";
import SplitDialog from "./SplitDialog";
import TopNavigation from "./TopNavigation";

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
const emptyFilterOptions: FilterOptions = { wallets: [], types: [], categories: [], tags: [], authors: [] };

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
  const [uploading, setUploading] = useState(false);
  const [fullImport, setFullImport] = useState(false);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [wallets, setWallets] = useState<WalletSummary[]>([]);
  const [selectedReviews, setSelectedReviews] = useState<number[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>(emptyFilterOptions);
  const [draftFilters, setDraftFilters] = useState<FilterState>(emptyFilters);
  const [activeFilterQuery, setActiveFilterQuery] = useState("");
  const [splitMode, setSplitMode] = useState(false);
  const [splitRows, setSplitRows] = useState<Row[]>([]);
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [validUntil, setValidUntil] = useState("");
  const [savedValidUntil, setSavedValidUntil] = useState("");
  const [savingValidUntil, setSavingValidUntil] = useState(false);
  const [selectedDuplicates, setSelectedDuplicates] = useState<number[]>([]);
  const [deletingDuplicates, setDeletingDuplicates] = useState(false);

  const load = useCallback(async (targetTab = tab, page = 1) => {
    setLoading(true);
    try {
      const [statsResponse, pageResponse, reviewResponse, walletsResponse] = await Promise.all([
        fetch("/api/stats", { cache: "no-store" }),
        fetch(`/api/${targetTab}?page=${page}&pageSize=25${activeFilterQuery ? `&${activeFilterQuery}` : ""}`, { cache: "no-store" }),
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
      setSelectedDuplicates([]);
    } finally {
      setLoading(false);
    }
  }, [tab, activeFilterQuery]);

  useEffect(() => { void load(tab, 1); }, [tab, load]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("view") === "duplicates") setTab("duplicates");
  }, []);
  useEffect(() => {
    void fetch("/api/filter-options", { cache: "no-store" })
      .then((response) => response.json())
      .then((result: FilterOptions) => setFilterOptions(result));
  }, []);
  useEffect(() => {
    void fetch("/api/valid-until", { cache: "no-store" })
      .then((response) => response.json())
      .then((result: { validUntil: string | null }) => {
        setValidUntil(result.validUntil ?? "");
        setSavedValidUntil(result.validUntil ?? "");
      });
  }, []);

  async function saveValidUntil() {
    setSavingValidUntil(true);
    try {
      const response = await fetch("/api/valid-until", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ validUntil: validUntil || null }),
      });
      const result = await response.json() as { validUntil?: string | null; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not save the validation date.");
      setValidUntil(result.validUntil ?? "");
      setSavedValidUntil(result.validUntil ?? "");
      setMessage({ tone: "success", text: result.validUntil ? `Transactions through ${result.validUntil} are marked as verified.` : "Transaction verification date cleared." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not save the validation date." });
    } finally {
      setSavingValidUntil(false);
    }
  }

  async function upload(files: FileList | File[]) {
    if (!files.length) return;
    setUploading(true);
    setMessage(null);
    const form = new FormData();
    form.set("fullImport", fullImport ? "true" : "false");
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

  async function removeDuplicates(ids: number[]) {
    if (!ids.length || !window.confirm(`Delete ${ids.length} selected ${ids.length === 1 ? "duplicate" : "duplicates"}? This cannot be undone.`)) return;
    setDeletingDuplicates(true);
    try {
      const response = await fetch("/api/duplicates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const result = await response.json() as { deleted?: number; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not delete duplicates.");
      setMessage({ tone: "success", text: `${result.deleted ?? 0} ${result.deleted === 1 ? "duplicate" : "duplicates"} deleted.` });
      const targetPage = ids.length >= data.rows.length && data.page > 1 ? data.page - 1 : data.page;
      await load("duplicates", targetPage);
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not delete duplicates." });
    } finally {
      setDeletingDuplicates(false);
    }
  }

  return (
    <main>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brandmark">S</span>
            <div><strong>Spendee companion</strong><small>Transaction archive</small></div>
          </div>
          <div className="topbar-actions">
            <TopNavigation
              active={tab}
              onTransactions={() => { setTab("transactions"); history.replaceState(null, "", "/"); }}
              onDuplicates={() => { setTab("duplicates"); setSplitMode(false); setSplitRows([]); history.replaceState(null, "", "/?view=duplicates"); }}
            />
          </div>
        </div>
      </header>

      <div className="workspace">
        <section className="page-heading">
          <div>
            <p className="eyebrow">TRANSACTION ARCHIVE</p>
            <h1>{tab === "transactions" ? "Transactions" : "Duplicates"}</h1>
            <p>{tab === "transactions" ? "Import and review your Spendee exports in one place." : "Review and remove repeated import records."}</p>
          </div>
          {tab === "transactions" && (
            <div className="transaction-import-controls">
              <label className="full-import compact">
                <input checked={fullImport} type="checkbox" onChange={(event) => setFullImport(event.target.checked)} />
                <span><b>Full import</b><small>One file per wallet</small></span>
              </label>
              <button className="page-import-button" disabled={uploading} onClick={() => inputRef.current?.click()}>
                <span>＋</span>{uploading ? "Importing…" : "Import files"}
              </button>
              <input ref={inputRef} type="file" accept=".xlsx,.csv,text/csv" multiple hidden onChange={(event) => event.target.files && void upload(event.target.files)} />
            </div>
          )}
        </section>

        {message && <div className={`notice ${message.tone}`}>{message.text}</div>}

        {wallets.length > 0 && (
          <section className="wallet-overview" aria-labelledby="wallet-overview-title">
            <div className="section-heading">
              <div><h2 id="wallet-overview-title">Wallets</h2></div>
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
              <h2>{tab === "transactions" ? "Transaction history" : "Duplicate records"}</h2>
              <p>{tab === "transactions" ? "All imported records, newest first" : `${stats.duplicates} separated ${stats.duplicates === 1 ? "duplicate" : "duplicates"}`}</p>
            </div>
            <div className="ledger-tools">
              {tab === "transactions" && (
                <div className="valid-until-control">
                  <label>
                    <span>Valid until</span>
                    <input
                      aria-label="Valid until"
                      type="date"
                      value={validUntil}
                      onChange={(event) => setValidUntil(event.target.value)}
                    />
                  </label>
                  <button
                    disabled={savingValidUntil || validUntil === savedValidUntil}
                    onClick={() => void saveValidUntil()}
                  >
                    {savingValidUntil ? "Saving…" : "Save"}
                  </button>
                </div>
              )}
              {tab === "transactions" && (
                splitMode ? (
                  <div className="split-mode-actions">
                    <button className="cancel-split" onClick={() => { setSplitMode(false); setSplitRows([]); }}>Cancel</button>
                    <button className="start-split" disabled={!splitRows.length} onClick={() => setSplitDialogOpen(true)}>
                      Split selected{splitRows.length ? ` (${splitRows.length})` : ""}
                    </button>
                  </div>
                ) : <button className="split-button" onClick={() => setSplitMode(true)}>Split transactions</button>
              )}
              {tab === "duplicates" && (
                <button className="delete-selected" disabled={!selectedDuplicates.length || deletingDuplicates} onClick={() => void removeDuplicates(selectedDuplicates)}>
                  {deletingDuplicates ? "Deleting…" : `Delete selected${selectedDuplicates.length ? ` (${selectedDuplicates.length})` : ""}`}
                </button>
              )}
            </div>
          </div>

          <TransactionFilters
            active={Boolean(activeFilterQuery)}
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
              <thead><tr>
                {(splitMode || tab === "duplicates") && <th className="select-column">
                  {tab === "duplicates" ? <input aria-label="Select all duplicates on this page" checked={data.rows.length > 0 && data.rows.every((row) => selectedDuplicates.includes(row.id))} type="checkbox" onChange={(event) => setSelectedDuplicates(event.target.checked ? data.rows.map((row) => row.id) : [])} /> : "Select"}
                </th>}
                <th>Date</th><th>Wallet</th><th>Type</th><th>Category</th><th>Note & labels</th><th>Author</th>{tab === "duplicates" && <th>Actions</th>}<th className="right">Amount</th>
              </tr></thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={tab === "duplicates" ? 9 : splitMode ? 8 : 7} className="empty">Loading transactions…</td></tr>
                ) : data.rows.length === 0 ? (
                  <tr><td colSpan={tab === "duplicates" ? 9 : splitMode ? 8 : 7} className="empty">{tab === "transactions" ? "Import an XLSX or CSV export to begin." : "No duplicates have been found."}</td></tr>
                ) : groupRowsByDay(data.rows).map((group) => (
                  <Fragment key={group.key}>
                    <DayHeader colSpan={tab === "duplicates" ? 9 : splitMode ? 8 : 7} day={group.key} totals={data.dayTotals[group.key] ?? []} />
                    {group.rows.map((row) => (
                      <tr key={row.id}>
                        {(splitMode || tab === "duplicates") && (
                          <td className="select-column">
                            <input
                              aria-label={tab === "duplicates" ? `Select duplicate ${row.id}` : `Select transaction ${row.id}`}
                              checked={tab === "duplicates" ? selectedDuplicates.includes(row.id) : splitRows.some((item) => item.id === row.id)}
                              type="checkbox"
                              onChange={(event) => tab === "duplicates"
                                ? setSelectedDuplicates((current) => event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id))
                                : setSplitRows((current) => event.target.checked ? [...current, row] : current.filter((item) => item.id !== row.id))}
                            />
                          </td>
                        )}
                        <td>
                          <strong>{formatDate(row.date)}</strong>
                          {savedValidUntil && dayKey(row.date) <= savedValidUntil && <span className="verified-badge">✓ Verified</span>}
                        </td>
                        <td><Link className="wallet-link" href={`/wallets/${encodeURIComponent(row.wallet)}`}><span className="wallet">{row.wallet.slice(0, 1)}</span>{row.wallet}</Link></td>
                        <td><span className={`type ${row.type.toLowerCase().replaceAll(" ", "-")}`}>{row.type}</span></td>
                        <td>{row.categoryName ? <Link className="category-link" href={`/categories/${categorySlug(row.categoryName)}`}>{row.categoryName}</Link> : "—"}</td>
                        <td>{row.note || row.labels ? <><span>{row.note ?? "—"}</span><small>{row.labels}</small></> : "—"}</td>
                        <td>{row.author ?? "—"}</td>
                        {tab === "duplicates" && <td><button className="delete-row" disabled={deletingDuplicates} onClick={() => void removeDuplicates([row.id])}>Delete</button></td>}
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
      {splitDialogOpen && (
        <SplitDialog transactions={splitRows} onClose={() => setSplitDialogOpen(false)} />
      )}
    </main>
  );
}
