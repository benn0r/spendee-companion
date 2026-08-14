"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Brand from "@/app/Brand";
import TopNavigation from "@/app/TopNavigation";
import type {
  ReceiptApiRecord,
  ReceiptSplitSuggestion,
} from "@/lib/receipt-types";
import { useI18n } from "@/app/I18nProvider";
import Ionicon from "@/app/Ionicon";

type Reference = { id: string; name: string };
type References = {
  accounts: Reference[];
  categories: Reference[];
  tags: Reference[];
};

const emptyReferences: References = { accounts: [], categories: [], tags: [] };

function money(value: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(value);
}

function statusLabel(receipt: ReceiptApiRecord) {
  if (receipt.submitted) return "Submitted";
  return receipt.status.slice(0, 1).toUpperCase() + receipt.status.slice(1);
}

function suggestedPayload(receipt: ReceiptApiRecord) {
  const suggestion = receipt.suggestion!;
  return {
    account: receipt.accountId,
    category: suggestion.category,
    date: suggestion.date,
    amount: suggestion.amount,
    payee: "",
    notes: suggestion.notes,
    tags: suggestion.tags,
    splits: suggestion.splits,
  };
}

export default function ReceiptsView() {
  const { intlLocale } = useI18n();
  const [receipts, setReceipts] = useState<ReceiptApiRecord[]>([]);
  const [references, setReferences] = useState<References>(emptyReferences);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [reviewing, setReviewing] = useState<ReceiptApiRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [receiptsResponse, referencesResponse] = await Promise.all([
      fetch("/api/receipts", { cache: "no-store" }),
      fetch("/api/references", { cache: "no-store" }),
    ]);
    const receiptPayload = (await receiptsResponse.json()) as {
      receipts?: ReceiptApiRecord[];
      error?: string;
    };
    const referencePayload = (await referencesResponse.json()) as References & {
      error?: string;
    };
    if (!receiptsResponse.ok)
      throw new Error(receiptPayload.error ?? "Could not load receipts.");
    if (!referencesResponse.ok)
      throw new Error(referencePayload.error ?? "Could not load references.");
    setReceipts(receiptPayload.receipts ?? []);
    setReferences(referencePayload);
    setSelectedAccount(
      (current) => current || referencePayload.accounts[0]?.id || "",
    );
  }, []);

  useEffect(() => {
    void load()
      .catch((error) =>
        setMessage({
          tone: "error",
          text:
            error instanceof Error ? error.message : "Could not load receipts.",
        }),
      )
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (
      !receipts.some(
        ({ status }) => status === "queued" || status === "processing",
      )
    )
      return;
    const timer = window.setInterval(() => void load(), 1_500);
    return () => window.clearInterval(timer);
  }, [load, receipts]);

  async function upload(file: File | undefined) {
    if (!file || !selectedAccount) return;
    setUploading(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.set("account", selectedAccount);
      form.set("receipt", file);
      const response = await fetch("/api/receipts", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(payload.error ?? "Receipt upload failed.");
      setUploadOpen(false);
      setMessage({ tone: "success", text: "Receipt queued for extraction." });
      await load();
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Receipt upload failed.",
      });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(receipt: ReceiptApiRecord) {
    if (!window.confirm(`Delete receipt “${receipt.filename}”?`)) return;
    const response = await fetch(`/api/receipts/${receipt.id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setMessage({
        tone: "error",
        text: payload.error ?? "Could not delete receipt.",
      });
      return;
    }
    setMessage({ tone: "success", text: "Receipt deleted." });
    await load();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reviewing?.suggestion) return;
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const suggestion = reviewing.suggestion;
    const splitRows = suggestion.splits.map((split, index) => ({
      category: String(form.get(`split-category-${index}`) ?? split.category),
      amount: Number(form.get(`split-amount-${index}`) ?? split.amount),
      notes: String(form.get(`split-notes-${index}`) ?? split.notes),
      tags: split.tags,
    }));
    const payload = {
      account: String(form.get("account")),
      category: splitRows.length ? undefined : String(form.get("category")),
      date: String(form.get("date")),
      amount: Number(form.get("amount")),
      payee: String(form.get("payee") ?? "") || undefined,
      notes: String(form.get("notes") ?? "") || undefined,
      tags: form.getAll("tags").map(String),
      splits: splitRows.length ? splitRows : undefined,
    };
    try {
      const response = await fetch(`/api/receipts/${reviewing.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error ?? "Could not submit receipt.");
      setReviewing(null);
      setMessage({
        tone: "success",
        text: "Transaction added to Actual Budget for review.",
      });
      await load();
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error ? error.message : "Could not submit receipt.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      <header className="topbar">
        <div className="topbar-inner">
          <Brand />
          <div className="topbar-actions">
            <TopNavigation active="receipts" />
          </div>
        </div>
      </header>
      <div className="workspace receipts-workspace">
        <section className="page-heading">
          <div>
            <p className="eyebrow">DOCUMENTS</p>
            <h1>Receipts</h1>
            <p>
              Extract receipt details, review them, and submit an uncleared
              Actual transaction.
            </p>
          </div>
          <button
            className="page-import-button"
            onClick={() => setUploadOpen(true)}
          >
            <Ionicon name="add-circle-outline" /> Upload receipt
          </button>
        </section>
        {message && (
          <div className={`notice ${message.tone}`}>{message.text}</div>
        )}
        <div className="receipt-summary">
          <span>
            {receipts.length} {receipts.length === 1 ? "receipt" : "receipts"}
          </span>
          <small>JPEG, PNG, WebP, or PDF · up to 10 MB</small>
        </div>
        {loading ? (
          <section className="ledger receipt-empty">Loading receipts…</section>
        ) : receipts.length === 0 ? (
          <section className="ledger receipt-empty">
            <b>No receipts uploaded yet.</b>
            <span>
              Upload a document to create a reviewed Actual Budget transaction.
            </span>
          </section>
        ) : (
          <section className="receipt-grid">
            {receipts.map((receipt) => {
              const suggestion = receipt.suggestion;
              return (
                <article className="receipt-card" key={receipt.id}>
                  <div className="receipt-preview">
                    {receipt.mimeType.startsWith("image/") ? (
                      <img
                        alt={`Receipt ${receipt.filename}`}
                        src={`/api/receipts/${receipt.id}/file`}
                      />
                    ) : (
                      <object
                        aria-label={`Receipt ${receipt.filename}`}
                        data={`/api/receipts/${receipt.id}/file`}
                        type="application/pdf"
                      >
                        <a href={`/api/receipts/${receipt.id}/file`}>
                          Open PDF
                        </a>
                      </object>
                    )}
                  </div>
                  <div className="receipt-card-body">
                    <div className="receipt-card-head">
                      <div>
                        <p className="eyebrow">
                          {suggestion?.merchant || "RECEIPT"}
                        </p>
                        <h2>{receipt.filename}</h2>
                      </div>
                      <span
                        className={`receipt-status status-${receipt.submitted ? "submitted" : receipt.status}`}
                      >
                        {statusLabel(receipt)}
                      </span>
                    </div>
                    <div className="receipt-meta">
                      <span>{receipt.accountName}</span>
                      {suggestion && (
                        <strong>
                          {money(
                            suggestion.amount,
                            suggestion.currency,
                            intlLocale,
                          )}
                        </strong>
                      )}
                      <span>
                        {suggestion?.date || receipt.createdAt.slice(0, 10)}
                      </span>
                    </div>
                    {suggestion?.items.length ? (
                      <div className="receipt-items-wrap">
                        <table className="receipt-items">
                          <thead>
                            <tr>
                              <th>Item</th>
                              <th>Qty</th>
                              <th className="right">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {suggestion.items.map((item, index) => (
                              <tr key={`${item.description}-${index}`}>
                                <td>{item.description}</td>
                                <td>{item.quantity}</td>
                                <td className="right">
                                  {money(
                                    item.totalAmount,
                                    suggestion.currency,
                                    intlLocale,
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="receipt-muted">
                        {receipt.status === "failed"
                          ? receipt.error
                          : "No extracted line items available."}
                      </p>
                    )}
                    {receipt.error && (
                      <p className="receipt-error">{receipt.error}</p>
                    )}
                    <div className="receipt-actions">
                      {receipt.status === "processed" && !receipt.submitted && (
                        <button
                          className="receipt-review-button"
                          onClick={() => setReviewing(receipt)}
                        >
                          Review & submit
                        </button>
                      )}
                      <a
                        href={`/api/receipts/${receipt.id}/file`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open file
                      </a>
                      <button
                        className="receipt-delete-button"
                        onClick={() => void remove(receipt)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>

      {uploadOpen && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={() => !uploading && setUploadOpen(false)}
        >
          <section
            aria-labelledby="upload-receipt-title"
            aria-modal="true"
            className="dialog-surface receipt-upload-dialog"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="dialog-head">
              <div>
                <p className="eyebrow">NEW DOCUMENT</p>
                <h2 id="upload-receipt-title">Upload receipt</h2>
                <span>Choose the Actual account before extraction.</span>
              </div>
              <button
                aria-label="Close receipt upload"
                disabled={uploading}
                onClick={() => setUploadOpen(false)}
              >
                <Ionicon name="close" />
              </button>
            </div>
            <label className="receipt-field">
              Account
              <span className="receipt-select">
                <select
                  value={selectedAccount}
                  onChange={(event) => setSelectedAccount(event.target.value)}
                >
                  {references.accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </span>
            </label>
            <button
              className="receipt-file-choice"
              disabled={uploading || !selectedAccount}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? "Uploading…" : "Choose receipt file"}
            </button>
            <input
              ref={inputRef}
              accept="image/jpeg,image/png,image/webp,application/pdf"
              hidden
              type="file"
              onChange={(event) => void upload(event.target.files?.[0])}
            />
          </section>
        </div>
      )}

      {reviewing?.suggestion && (
        <ReceiptReviewDialog
          categories={references.categories}
          onClose={() => !submitting && setReviewing(null)}
          onSubmit={submit}
          receipt={reviewing}
          submitting={submitting}
          tags={references.tags}
          accounts={references.accounts}
        />
      )}
    </main>
  );
}

function ReceiptReviewDialog({
  accounts,
  categories,
  onClose,
  onSubmit,
  receipt,
  submitting,
  tags,
}: {
  accounts: Reference[];
  categories: Reference[];
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  receipt: ReceiptApiRecord;
  submitting: boolean;
  tags: Reference[];
}) {
  const initial = suggestedPayload(receipt);
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="receipt-review-title"
        aria-modal="true"
        className="dialog-surface receipt-review-dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-head">
          <div>
            <p className="eyebrow">ACTUAL BUDGET</p>
            <h2 id="receipt-review-title">Review transaction</h2>
            <span>
              Edit the suggestion before creating an uncleared transaction.
            </span>
          </div>
          <button
            aria-label="Close receipt review"
            disabled={submitting}
            onClick={onClose}
          >
            <Ionicon name="close" />
          </button>
        </div>
        <form className="receipt-review-form" onSubmit={onSubmit}>
          <div className="receipt-form-grid">
            <label>
              Account
              <span className="receipt-select">
                <select defaultValue={initial.account} name="account" required>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </span>
            </label>
            <label>
              Date
              <input
                defaultValue={initial.date}
                name="date"
                required
                type="date"
              />
            </label>
            <label>
              Amount
              <input
                defaultValue={initial.amount}
                name="amount"
                required
                step="0.01"
                type="number"
              />
            </label>
            {!initial.splits.length && (
              <label>
                Category
                <span className="receipt-select">
                  <select
                    defaultValue={initial.category}
                    name="category"
                    required
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </span>
              </label>
            )}
            <label className="receipt-wide">
              Payee <small>optional</small>
              <input
                defaultValue={initial.payee}
                maxLength={200}
                name="payee"
              />
            </label>
            <label className="receipt-wide">
              Notes
              <textarea
                defaultValue={initial.notes}
                maxLength={500}
                name="notes"
              />
            </label>
          </div>
          <fieldset className="receipt-tag-fieldset">
            <legend>Tags</legend>
            <div>
              {tags.map((tag) => (
                <label key={tag.id}>
                  <input
                    defaultChecked={initial.tags.includes(tag.id)}
                    name="tags"
                    type="checkbox"
                    value={tag.id}
                  />
                  #{tag.name}
                </label>
              ))}
            </div>
          </fieldset>
          {initial.splits.length > 0 && (
            <div className="receipt-splits">
              <h3>Suggested splits</h3>
              {initial.splits.map((split, index) => (
                <ReceiptSplitEditor
                  categories={categories}
                  index={index}
                  key={`${split.category}-${index}`}
                  split={split}
                />
              ))}
            </div>
          )}
          <div className="dialog-actions">
            <button
              className="cancel-split"
              disabled={submitting}
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button className="start-split" disabled={submitting} type="submit">
              {submitting ? "Submitting…" : "Add to Actual Budget"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ReceiptSplitEditor({
  categories,
  index,
  split,
}: {
  categories: Reference[];
  index: number;
  split: ReceiptSplitSuggestion;
}) {
  return (
    <div className="receipt-split-row">
      <label>
        Category
        <span className="receipt-select">
          <select
            defaultValue={split.category}
            name={`split-category-${index}`}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </span>
      </label>
      <label>
        Amount
        <input
          defaultValue={split.amount}
          name={`split-amount-${index}`}
          step="0.01"
          type="number"
        />
      </label>
      <label>
        Notes
        <input defaultValue={split.notes} name={`split-notes-${index}`} />
      </label>
    </div>
  );
}
