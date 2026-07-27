"use client";

import Brand from "@/app/Brand";
import CategoryIcon from "@/app/CategoryIcon";
import DayHeader from "@/app/DayHeader";
import TopNavigation from "@/app/TopNavigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { calculateDayTotals, groupRowsByDay } from "@/lib/day-groups";
import type { ValidationDiff } from "@/lib/validation-types";
import type { CategoryAppearance } from "@/lib/category-appearance";

type Status = "processing" | "complete" | "failed";
type Counts = { matching: number; missingInApp: number; missingInDocument: number };
type Summary = { id: number; wallet: string; filename: string; title: string; printDate: string | null; issuer: string | null; dateFrom: string; dateTo: string; createdAt: string; counts: Counts; status: Status; error: string | null };
type Detail = Summary & { accountReference: string | null; metadata: Record<string, string>; model: string; diff: ValidationDiff; rawOpenAI: unknown };
type ResultRow = { key: string; date: string; description: string; amount: number; currency: string; categoryName: string | null; documentDescription: string | null; status: "matched" | "missing-app" | "missing-document" };
type BlacklistEntry = { id: number; description: string; createdAt: string };

const money = (amount: number, currency: string) => new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
const date = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));

export default function ValidateView() {
  const [wallets, setWallets] = useState<string[]>([]);
  const [wallet, setWallet] = useState("");
  const [validations, setValidations] = useState<Summary[]>([]);
  const [selected, setSelected] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [blacklist, setBlacklist] = useState<BlacklistEntry[]>([]);
  const [appearances, setAppearances] = useState<Record<string, CategoryAppearance>>({});
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const selectValidation = useCallback(async (id: number) => {
    const response = await fetch(`/api/validations/${id}`, { cache: "no-store" });
    if (response.ok) setSelected(await response.json() as Detail);
  }, []);

  const refreshList = useCallback(async () => {
    const result = await fetch("/api/validations", { cache: "no-store" }).then((value) => value.json()) as { validations: Summary[] };
    setValidations(result.validations);
    return result.validations;
  }, []);

  const load = useCallback(async () => {
    const [walletData, entries, blacklistData, filterData] = await Promise.all([
      fetch("/api/wallets", { cache: "no-store" }).then((value) => value.json()) as Promise<{ wallets: Array<{ wallet: string }> }>,
      refreshList(),
      fetch("/api/validation-blacklist", { cache: "no-store" }).then((value) => value.json()) as Promise<{ entries: BlacklistEntry[] }>,
      fetch("/api/filter-options", { cache: "no-store" }).then((value) => value.json()) as Promise<{ categoryAppearances?: Record<string, CategoryAppearance> }>,
    ]);
    const names = walletData.wallets.map((item) => item.wallet);
    setWallets(names); setWallet((current) => current || names[0] || "");
    setBlacklist(blacklistData.entries); setAppearances(filterData.categoryAppearances || {});
    if (entries[0]) await selectValidation(entries[0].id);
    setLoading(false);
  }, [refreshList, selectValidation]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!selected || selected.status !== "processing") return;
    const timer = window.setInterval(async () => {
      await selectValidation(selected.id);
      await refreshList();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [selected, refreshList, selectValidation]);

  async function upload(file: File) {
    setSubmitting(true); setError("");
    const body = new FormData(); body.set("wallet", wallet); body.set("file", file);
    const response = await fetch("/api/validations", { method: "POST", body });
    const result = await response.json() as { id?: number; error?: string };
    setSubmitting(false);
    if (!response.ok || !result.id) { setError(result.error || "Validation failed."); return; }
    setDialogOpen(false); setDragging(false);
    await refreshList(); await selectValidation(result.id);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function blacklistDescription(description: string) {
    if (!selected || !window.confirm(`Ignore "${description}" in this and all future validations?`)) return;
    const response = await fetch("/api/validation-blacklist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description, validationId: selected.id }) });
    const result = await response.json() as { entries?: BlacklistEntry[]; error?: string };
    if (!response.ok) { window.alert(result.error || "Could not update blacklist."); return; }
    setBlacklist(result.entries || []); await selectValidation(selected.id); await refreshList();
  }

  async function removeBlacklist(entry: BlacklistEntry) {
    if (!window.confirm(`Remove "${entry.description}" from the blacklist?`)) return;
    const response = await fetch("/api/validation-blacklist", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: entry.id, validationId: selected?.id }) });
    const result = await response.json() as { entries?: BlacklistEntry[] };
    if (response.ok) { setBlacklist(result.entries || []); if (selected) await selectValidation(selected.id); await refreshList(); }
  }

  const rows = useMemo<ResultRow[]>(() => {
    if (!selected || selected.status !== "complete") return [];
    return [
      ...selected.diff.matching.map((item, index) => ({ key: `match-${index}`, date: item.document.date, description: item.document.description, amount: item.document.amount, currency: item.document.currency, categoryName: item.app.categoryName, documentDescription: item.document.description, status: "matched" as const })),
      ...selected.diff.missingInApp.map((item, index) => ({ key: `app-${index}`, date: item.date, description: item.description, amount: item.amount, currency: item.currency, categoryName: null, documentDescription: item.description, status: "missing-app" as const })),
      ...selected.diff.missingInDocument.map((item) => ({ key: `document-${item.id}`, date: item.date, description: item.note || item.categoryName || item.type, amount: item.amount, currency: item.currency, categoryName: item.categoryName, documentDescription: null, status: "missing-document" as const })),
    ].sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key));
  }, [selected]);
  const groups = useMemo(() => groupRowsByDay(rows), [rows]);
  const totals = useMemo(() => calculateDayTotals(rows), [rows]);

  return <main>
    <header className="topbar"><div className="topbar-inner"><Brand /><TopNavigation active="validate" /></div></header>
    <div className="workspace validation-page">
      <section className="page-heading"><div><p className="eyebrow">DOCUMENT RECONCILIATION</p><h1>Validate</h1><p>Compare PDF statements with the transactions saved in a wallet.</p></div><div className="validation-heading-actions"><button aria-label="Validation settings" className="settings-cog-button" onClick={() => setSettingsOpen(true)} title="Validation settings">⚙</button><button className="page-import-button" onClick={() => setDialogOpen(true)}><span>＋</span>Upload document</button></div></section>
      <section className="validation-layout">
        <aside className="validation-sidebar"><div className="validation-history"><h2>Past validations</h2>{loading ? <p>Loading…</p> : validations.length === 0 ? <p>No validations yet.</p> : validations.map((item) => <button className={selected?.id === item.id ? "active" : ""} key={item.id} onClick={() => void selectValidation(item.id)}>{item.status === "complete" ? <img alt="Statement thumbnail" src={`/api/validations/${item.id}/thumbnail`} /> : <span className={`validation-state-icon ${item.status}`}>{item.status === "processing" ? "…" : "!"}</span>}<span><strong>{item.status === "processing" ? item.filename : item.title}</strong><small>{item.wallet}{item.dateFrom ? ` · ${date(item.dateFrom)}–${date(item.dateTo)}` : ""}</small><em>{item.status === "processing" ? "Extracting in background…" : item.status === "failed" ? "Extraction failed" : `${item.counts.matching} matched · ${item.counts.missingInApp + item.counts.missingInDocument} differences`}</em></span></button>)}</div></aside>
        <section className="validation-results">
          {!selected ? <div className="validation-empty"><h2>No validation selected</h2><p>Upload a PDF statement to start.</p></div> : selected.status === "processing" ? <div className="validation-empty processing"><span className="validation-spinner" /><h2>Extracting statement</h2><p>You can leave this page. The validation is running in the background.</p></div> : selected.status === "failed" ? <div className="validation-empty failed"><h2>Extraction failed</h2><p>{selected.error}</p></div> : <>
            <header className="validation-result-head"><img alt="First page of uploaded statement" src={`/api/validations/${selected.id}/thumbnail`} /><div><p className="eyebrow">{selected.issuer || "DOCUMENT"}</p><h2>{selected.title}</h2><p>{selected.wallet} · {date(selected.dateFrom)}–{date(selected.dateTo)}</p><small>Validated {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(selected.createdAt))}</small></div></header>
            <section className="document-details"><div className="document-details-title"><span>⌁</span><div><small>DOCUMENT DETAILS</small><strong>{selected.filename}</strong></div></div><dl><div><dt>Print date</dt><dd>{selected.printDate ? date(selected.printDate) : "Not found"}</dd></div><div><dt>Account</dt><dd>{selected.accountReference || "Not found"}</dd></div>{Object.entries(selected.metadata).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></section>
            <div className="validation-counts"><span className="matched"><b>{selected.diff.matching.length}</b> Matching</span><span className="missing-app"><b>{selected.diff.missingInApp.length}</b> Missing in Spendee</span><span className="spendee-only"><b>{selected.diff.missingInDocument.length}</b> Only in Spendee</span></div>
            <section className="ledger validation-ledger"><div className="ledger-head"><div><h2>Reconciliation</h2><p>All transactions in statement range</p></div><span>{rows.length} rows</span></div><div className="table-wrap"><table><thead><tr><th>Status</th><th>Description</th><th>Category</th><th className="right">Amount</th></tr></thead><tbody>{groups.map((group) => <Fragment key={group.key}><DayHeader colSpan={4} day={group.key} totals={totals[group.key] || []} />{group.rows.map((row) => <tr className="validation-transaction" key={row.key}><td><span className={`validation-status-badge ${row.status}`}>{row.status === "matched" ? "Match" : row.status === "missing-app" ? "Missing in Spendee" : "Only in Spendee"}</span></td><td><span className="validation-description"><strong>{row.description}</strong>{row.documentDescription && <button title="Ignore this description" aria-label={`Blacklist ${row.documentDescription}`} onClick={() => void blacklistDescription(row.documentDescription!)}>⊘</button>}</span></td><td>{row.categoryName ? <span className="validation-category"><CategoryIcon appearance={appearances[row.categoryName]} />{row.categoryName}</span> : "—"}</td><td className={`right validation-amount ${row.amount < 0 ? "negative" : "positive"}`}><strong>{money(row.amount, row.currency)}</strong></td></tr>)}</Fragment>)}</tbody></table></div></section>
            <details className="raw-response"><summary>Raw OpenAI response</summary><pre>{JSON.stringify(selected.rawOpenAI, null, 2)}</pre></details>
          </>}
        </section>
      </section>
    </div>
    {dialogOpen && <div className="dialog-backdrop" role="presentation" onMouseDown={() => !submitting && setDialogOpen(false)}><section aria-labelledby="validation-dialog-title" aria-modal="true" className="import-dialog" role="dialog" onMouseDown={(event) => event.stopPropagation()}><div className="dialog-head"><div><p className="eyebrow">VALIDATE STATEMENT</p><h2 id="validation-dialog-title">Upload document</h2><span>Choose a wallet and PDF statement.</span></div><button aria-label="Close upload" disabled={submitting} onClick={() => setDialogOpen(false)}>×</button></div><label className="validation-wallet-field"><span>Wallet</span><div><select aria-label="Wallet" value={wallet} onChange={(event) => setWallet(event.target.value)}><option value="">Choose a wallet</option>{wallets.map((name) => <option key={name}>{name}</option>)}</select></div></label><div className={`dropzone import-dropzone ${dragging ? "dragging" : ""}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={(event) => { event.preventDefault(); setDragging(false); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); setDragging(false); if (wallet && event.dataTransfer.files[0]) void upload(event.dataTransfer.files[0]); }}><div className="upload-icon">⇧</div><div className="upload-copy"><h2>Drop PDF here</h2><p>The extraction will continue in the background.</p><span>The original document is removed after processing.</span></div><button disabled={submitting || !wallet} onClick={() => inputRef.current?.click()}>{submitting ? "Uploading…" : "Choose PDF"}</button><input ref={inputRef} type="file" accept="application/pdf,.pdf" hidden onChange={(event) => event.target.files?.[0] && void upload(event.target.files[0])} /></div>{error && <p className="form-error" role="alert">{error}</p>}</section></div>}
    {settingsOpen && <div className="dialog-backdrop" role="presentation" onMouseDown={() => setSettingsOpen(false)}><section aria-labelledby="validation-settings-title" aria-modal="true" className="import-dialog validation-settings-dialog" role="dialog" onMouseDown={(event) => event.stopPropagation()}><div className="dialog-head"><div><p className="eyebrow">VALIDATION SETTINGS</p><h2 id="validation-settings-title">Ignored descriptions</h2><span>These document transactions are excluded from every reconciliation.</span></div><button aria-label="Close settings" onClick={() => setSettingsOpen(false)}>×</button></div>{blacklist.length ? <div className="validation-blacklist">{blacklist.map((entry) => <div key={entry.id}><span><strong>{entry.description}</strong><small>Ignored since {date(entry.createdAt)}</small></span><button onClick={() => void removeBlacklist(entry)}>Remove</button></div>)}</div> : <p className="validation-settings-empty">No descriptions are ignored.</p>}</section></div>}
  </main>;
}
