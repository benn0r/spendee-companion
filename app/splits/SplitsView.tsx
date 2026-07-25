"use client";

import Link from "next/link";
import TopNavigation from "@/app/TopNavigation";
import { useCallback, useEffect, useState } from "react";
import { intlLocale, normalizeLocale, supportedLocales, type AppLocale } from "@/lib/i18n";

type SplitSummary = {
  id: number;
  title: string;
  splitCount: number;
  totalAmount: number;
  splitAmount: number;
  currency: string;
  createdAt: string;
  entryCount: number;
  transactionCount: number;
  customCount: number;
  locale: AppLocale;
};

function money(amount: number, currency: string, locale: AppLocale) {
  return new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency }).format(amount);
}

const languageLabel = (locale: AppLocale) => supportedLocales.find((item) => item.code === locale)?.label ?? locale;

export default function SplitsView() {
  const [splits, setSplits] = useState<SplitSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/splits", { cache: "no-store" });
      const result = await response.json() as { splits: SplitSummary[] };
      setSplits(result.splits);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function remove(split: SplitSummary) {
    if (!window.confirm(`Delete "${split.title}"? This cannot be undone.`)) return;
    setDeleting(split.id);
    try {
      const response = await fetch(`/api/splits/${split.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete split.");
      await load();
    } finally {
      setDeleting(null);
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
          <TopNavigation active="splits" />
        </div>
      </header>
      <div className="workspace splits-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">SAVED CALCULATIONS</p>
            <h1>Past splits</h1>
            <p>Review, download, or remove saved transaction splits.</p>
          </div>
        </section>
        <section className="ledger splits-list">
          <div className="ledger-head">
            <div><h2>Split history</h2><p>Newest first</p></div>
            <span>{splits.length} {splits.length === 1 ? "split" : "splits"}</span>
          </div>
          {loading ? (
            <div className="empty">Loading splits…</div>
          ) : splits.length === 0 ? (
            <div className="empty">
              <p>No saved splits yet.</p>
              <Link className="back-home" href="/">Select transactions to create one</Link>
            </div>
          ) : (
            <div className="split-history-grid">
              {splits.map((split) => (
                <article className="split-history-card" key={split.id}>
                  <div className="split-card-head">
                    <div><span>{split.title}</span><small>{new Intl.DateTimeFormat(intlLocale(normalizeLocale(split.locale)), { dateStyle: "medium", timeStyle: "short" }).format(new Date(split.createdAt))} · {languageLabel(normalizeLocale(split.locale))}</small></div>
                    <b>÷ {split.splitCount}</b>
                  </div>
                  <div className="split-card-values">
                    <span><small>Total</small><b>{money(split.totalAmount, split.currency, normalizeLocale(split.locale))}</b></span>
                    <span><small>Split amount</small><strong>{money(split.splitAmount, split.currency, normalizeLocale(split.locale))}</strong></span>
                  </div>
                  <p>{split.transactionCount} {split.transactionCount === 1 ? "transaction" : "transactions"}{split.customCount ? ` · ${split.customCount} custom ${split.customCount === 1 ? "position" : "positions"}` : ""}</p>
                  <div className="split-card-actions">
                    <a href={`/api/splits/${split.id}/pdf`}>Download PDF</a>
                    <button disabled={deleting === split.id} onClick={() => void remove(split)}>
                      {deleting === split.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
