"use client";

import Brand from "@/app/Brand";
import TopNavigation from "@/app/TopNavigation";
import { useCallback, useEffect, useState } from "react";
import type { ExtractedDocumentTransaction, ValidationAppTransaction, ValidationDiff } from "@/lib/validation-types";

type Counts = { matching: number; missingInApp: number; missingInDocument: number };
type Summary = { id: number; wallet: string; filename: string; title: string; printDate: string | null; issuer: string | null; dateFrom: string; dateTo: string; createdAt: string; counts: Counts };
type Detail = Summary & { accountReference: string | null; metadata: Record<string, string>; model: string; diff: ValidationDiff; rawOpenAI: unknown };

const money = (amount: number, currency: string) => new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
const date = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));

function DocumentTransaction({ transaction }: { transaction: ExtractedDocumentTransaction }) {
  return <><span>{date(transaction.date)}</span><strong>{transaction.description}</strong><b>{money(transaction.amount, transaction.currency)}</b></>;
}

function AppTransaction({ transaction }: { transaction: ValidationAppTransaction }) {
  return <><span>{date(transaction.date)}</span><strong>{transaction.note || transaction.categoryName || transaction.type}</strong><b>{money(transaction.amount, transaction.currency)}</b></>;
}

export default function ValidateView() {
  const [wallets, setWallets] = useState<string[]>([]);
  const [wallet, setWallet] = useState("");
  const [validations, setValidations] = useState<Summary[]>([]);
  const [selected, setSelected] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const selectValidation = useCallback(async (id: number) => {
    const response = await fetch(`/api/validations/${id}`, { cache: "no-store" });
    if (response.ok) setSelected(await response.json() as Detail);
  }, []);

  const load = useCallback(async () => {
    const [walletResponse, validationResponse] = await Promise.all([
      fetch("/api/wallets", { cache: "no-store" }), fetch("/api/validations", { cache: "no-store" }),
    ]);
    const walletData = await walletResponse.json() as { wallets: Array<{ wallet: string }> };
    const validationData = await validationResponse.json() as { validations: Summary[] };
    const names = walletData.wallets.map((item) => item.wallet);
    setWallets(names);
    setWallet((current) => current || names[0] || "");
    setValidations(validationData.validations);
    if (validationData.validations[0]) await selectValidation(validationData.validations[0].id);
    setLoading(false);
  }, [selectValidation]);

  useEffect(() => { void load(); }, [load]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setSubmitting(true);
    setError("");
    const body = new FormData(form);
    const response = await fetch("/api/validations", { method: "POST", body });
    const result = await response.json() as Detail | { error: string };
    setSubmitting(false);
    if (!response.ok) { setError("error" in result ? result.error : "Validation failed."); return; }
    setSelected(result as Detail);
    form.reset();
    setWallet(wallet);
    const list = await fetch("/api/validations", { cache: "no-store" }).then((value) => value.json()) as { validations: Summary[] };
    setValidations(list.validations);
  }

  return <main>
    <header className="topbar"><div className="topbar-inner"><Brand /><TopNavigation active="validate" /></div></header>
    <div className="workspace validation-page">
      <section className="page-heading"><div><p className="eyebrow">DOCUMENT RECONCILIATION</p><h1>Validate</h1><p>Compare a PDF statement with the transactions saved in a wallet.</p></div></section>
      <section className="validation-layout">
        <aside className="validation-sidebar">
          <form className="validation-upload" onSubmit={(event) => void submit(event)}>
            <h2>New validation</h2>
            <label>Wallet<select name="wallet" required value={wallet} onChange={(event) => setWallet(event.target.value)}><option value="">Choose a wallet</option>{wallets.map((name) => <option key={name}>{name}</option>)}</select></label>
            <label>PDF statement<input accept="application/pdf,.pdf" name="file" required type="file" /></label>
            <button disabled={submitting || !wallet} type="submit">{submitting ? "Extracting and comparing…" : "Upload and validate"}</button>
            {error && <p className="form-error" role="alert">{error}</p>}
            <small>The statement is processed for extraction. Only its thumbnail and returned data are retained.</small>
          </form>
          <div className="validation-history"><h2>Past validations</h2>{loading ? <p>Loading…</p> : validations.length === 0 ? <p>No validations yet.</p> : validations.map((item) => <button className={selected?.id === item.id ? "active" : ""} key={item.id} onClick={() => void selectValidation(item.id)}><img alt="Statement thumbnail" src={`/api/validations/${item.id}/thumbnail`} /><span><strong>{item.title}</strong><small>{item.wallet} · {date(item.dateFrom)}–{date(item.dateTo)}</small><em>{item.counts.matching} matched · {item.counts.missingInApp + item.counts.missingInDocument} differences</em></span></button>)}</div>
        </aside>
        <section className="validation-results">
          {!selected ? <div className="validation-empty"><h2>No validation selected</h2><p>Upload a PDF statement to start.</p></div> : <>
            <header className="validation-result-head"><img alt="First page of uploaded statement" src={`/api/validations/${selected.id}/thumbnail`} /><div><p className="eyebrow">{selected.issuer || "DOCUMENT"}</p><h2>{selected.title}</h2><p>{selected.wallet} · {date(selected.dateFrom)}–{date(selected.dateTo)}</p><small>Validated {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(selected.createdAt))}</small></div></header>
            <div className="validation-metadata"><span><small>Print date</small><b>{selected.printDate ? date(selected.printDate) : "Not found"}</b></span><span><small>Account reference</small><b>{selected.accountReference || "Not found"}</b></span>{Object.entries(selected.metadata).map(([key, value]) => <span key={key}><small>{key}</small><b>{value}</b></span>)}</div>
            <div className="validation-counts"><span className="matched"><b>{selected.diff.matching.length}</b> Matching</span><span className="missing-app"><b>{selected.diff.missingInApp.length}</b> Missing in app</span><span className="missing-document"><b>{selected.diff.missingInDocument.length}</b> Missing in document</span></div>
            <DiffSection title="Matching transactions" empty="No matching transactions.">{selected.diff.matching.map((match, index) => <div className="validation-match" key={`${match.document.date}-${index}`}><div><DocumentTransaction transaction={match.document} /></div><div><AppTransaction transaction={match.app} /></div></div>)}</DiffSection>
            <DiffSection title="Missing in app" empty="Every document transaction exists in the app.">{selected.diff.missingInApp.map((transaction, index) => <div className="validation-row" key={`${transaction.date}-${index}`}><DocumentTransaction transaction={transaction} /></div>)}</DiffSection>
            <DiffSection title="Missing in document" empty="Every app transaction exists in the document.">{selected.diff.missingInDocument.map((transaction) => <div className="validation-row" key={transaction.id}><AppTransaction transaction={transaction} /></div>)}</DiffSection>
            <details className="raw-response"><summary>Raw OpenAI response</summary><pre>{JSON.stringify(selected.rawOpenAI, null, 2)}</pre></details>
          </>}
        </section>
      </section>
    </div>
  </main>;
}

function DiffSection({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return <section className="validation-diff"><h3>{title}</h3>{hasChildren ? children : <p className="validation-diff-empty">{empty}</p>}</section>;
}
