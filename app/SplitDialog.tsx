"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type SelectedTransaction = {
  id: number;
  date: string;
  wallet: string;
  type: string;
  categoryName: string | null;
  note: string | null;
  amount: number;
  currency: string;
};

type CustomPosition = { description: string; amount: string };

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("de-CH", { style: "currency", currency }).format(amount);
}

export default function SplitDialog({
  transactions,
  onClose,
}: {
  transactions: SelectedTransaction[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [splitCount, setSplitCount] = useState(2);
  const [positions, setPositions] = useState<CustomPosition[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currencies = Array.from(new Set(transactions.map((row) => row.currency)));
  const currency = currencies[0] ?? "CHF";
  const customTotal = positions.reduce((sum, position) => {
    const amount = Number(position.amount);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
  const total = useMemo(
    () => transactions.reduce((sum, row) => sum + row.amount, 0) + customTotal,
    [transactions, customTotal],
  );
  const finalAmount = splitCount > 0 ? total / splitCount : 0;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      if (!title.trim()) throw new Error("Enter a title for the split.");
      if (currencies.length !== 1) throw new Error("Selected transactions must use one currency.");
      const customPositions = positions.map((position) => ({
        description: position.description.trim(),
        amount: Number(position.amount),
      }));
      if (customPositions.some((position) => !position.description || !Number.isFinite(position.amount))) {
        throw new Error("Complete every custom position or remove it.");
      }
      const response = await fetch("/api/splits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          transactionIds: transactions.map((row) => row.id),
          customPositions,
          splitCount,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save split.");
      router.push("/splits");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save split.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="split-dialog-title"
        aria-modal="true"
        className="split-dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-head">
          <div>
            <p className="eyebrow">NEW SPLIT</p>
            <h2 id="split-dialog-title">Review selected transactions</h2>
            <span>{transactions.length} selected {transactions.length === 1 ? "transaction" : "transactions"}</span>
          </div>
          <button aria-label="Close split" onClick={onClose}>×</button>
        </div>

        {currencies.length > 1 && <div className="notice error">Select transactions in one currency only.</div>}

        <label className="split-title-field">
          <span>Split title</span>
          <input
            autoFocus
            maxLength={120}
            placeholder="e.g. Weekend cabin"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        <div className="split-entry-list">
          {transactions.map((row) => (
            <div className="split-entry" key={row.id}>
              <span className="wallet">{row.wallet.slice(0, 1)}</span>
              <span>
                <b>{row.note || row.categoryName || row.type}</b>
                <small>{new Intl.DateTimeFormat("en-CH", { dateStyle: "medium" }).format(new Date(row.date))} · {row.wallet}</small>
              </span>
              <strong>{money(row.amount, row.currency)}</strong>
            </div>
          ))}
        </div>

        <section className="custom-positions">
          <div className="split-section-head">
            <div><h3>Custom positions</h3><p>Add positive or negative adjustments.</p></div>
            <button onClick={() => setPositions((current) => [...current, { description: "", amount: "" }])}>＋ Add position</button>
          </div>
          {positions.map((position, index) => (
            <div className="custom-position" key={index}>
              <input
                aria-label={`Position ${index + 1} description`}
                placeholder="Description"
                value={position.description}
                onChange={(event) => setPositions((current) => current.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, description: event.target.value } : item
                ))}
              />
              <input
                aria-label={`Position ${index + 1} amount`}
                placeholder="Amount"
                step="0.01"
                type="number"
                value={position.amount}
                onChange={(event) => setPositions((current) => current.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, amount: event.target.value } : item
                ))}
              />
              <b>{currency}</b>
              <button
                aria-label={`Remove position ${index + 1}`}
                onClick={() => setPositions((current) => current.filter((_, itemIndex) => itemIndex !== index))}
              >×</button>
            </div>
          ))}
        </section>

        <div className="split-controls">
          <label>
            <span>Split how many times?</span>
            <input
              min="1"
              step="1"
              type="number"
              value={splitCount}
              onChange={(event) => setSplitCount(Math.max(1, Math.floor(Number(event.target.value) || 1)))}
            />
          </label>
          <div className="split-summary">
            <span><small>Total amount</small><b>{money(total, currency)}</b></span>
            <span><small>Final split amount</small><strong>{money(finalAmount, currency)}</strong></span>
          </div>
        </div>

        {error && <div className="notice error split-error">{error}</div>}
        <div className="dialog-actions">
          <button className="cancel" disabled={saving} onClick={onClose}>Cancel</button>
          <button className="save" disabled={saving || currencies.length !== 1 || !title.trim()} onClick={() => void save()}>
            {saving ? "Saving…" : "Save split"}
          </button>
        </div>
      </section>
    </div>
  );
}
