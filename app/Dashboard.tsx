"use client";

import Link from "next/link";
import Brand from "@/app/Brand";
import { Fragment, useCallback, useEffect, useState } from "react";
import DayHeader from "./DayHeader";
import { groupRowsByDay, type DayTotals } from "@/lib/day-groups";
import { categorySlug } from "@/lib/category-slug";
import TransactionFilters, {
  emptyFilters,
  filterQuery,
  type FilterOptions,
  type FilterState,
} from "./TransactionFilters";
import SplitDialog from "./SplitDialog";
import TopNavigation from "./TopNavigation";
import PageSizeSelect from "./PageSizeSelect";
import CategoryIcon from "./CategoryIcon";
import { useI18n } from "./I18nProvider";
import TransactionClearedStatus from "./TransactionClearedStatus";

type Stats = {
  transactions: number;
  duplicates: number;
  wallets: number;
};
type Row = {
  id: string;
  duplicateOfId?: string;
  date: string;
  wallet: string;
  accountId?: string;
  type: string;
  categoryName: string | null;
  categoryId?: string | null;
  amount: number;
  currency: string;
  note: string | null;
  labels: string | null;
  author: string | null;
  cleared: boolean;
  validation?: { id: number; title: string; description: string } | null;
};
type PageData = {
  rows: Row[];
  dayTotals: DayTotals;
  page: number;
  pages: number;
  total: number;
  pageSize: number;
};
type WalletSummary = {
  id: string;
  wallet: string;
  transactionCount: number;
  totals: Array<{
    currency: string;
    transactionTotal: number;
    startingAmount: number;
    total: number;
  }>;
};

const emptyStats = { transactions: 0, duplicates: 0, wallets: 0 };
const emptyPage = {
  rows: [],
  dayTotals: {},
  page: 1,
  pages: 1,
  total: 0,
  pageSize: 25,
};
const emptyFilterOptions: FilterOptions = {
  wallets: [],
  types: [],
  categories: [],
  tags: [],
  authors: [],
};

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
  }).format(new Date(value));
}

function Amount({ row }: { row: Row }) {
  const { intlLocale } = useI18n();
  return (
    <span className={row.amount < 0 ? "amount expense" : "amount income"}>
      {new Intl.NumberFormat(intlLocale, {
        style: "currency",
        currency: row.currency,
      }).format(row.amount)}
    </span>
  );
}

function monthLabel(value: string | undefined, locale: string) {
  if (!value) return "current month";
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

function compactMoney(amount: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function Dashboard() {
  const { intlLocale } = useI18n();
  const [tab, setTab] = useState<"transactions" | "duplicates">("transactions");
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [data, setData] = useState<PageData>(emptyPage);
  const [loading, setLoading] = useState(true);
  const [wallets, setWallets] = useState<WalletSummary[]>([]);
  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [filterOptions, setFilterOptions] =
    useState<FilterOptions>(emptyFilterOptions);
  const [draftFilters, setDraftFilters] = useState<FilterState>(emptyFilters);
  const [activeFilterQuery, setActiveFilterQuery] = useState("");
  const [splitMode, setSplitMode] = useState(false);
  const [splitRows, setSplitRows] = useState<Row[]>([]);
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [selectedDuplicates, setSelectedDuplicates] = useState<string[]>([]);
  const [deletingDuplicates, setDeletingDuplicates] = useState(false);
  const [pageSize, setPageSize] = useState(25);

  const load = useCallback(
    async (targetTab = tab, page = 1) => {
      setLoading(true);
      try {
        const [statsResponse, pageResponse, walletsResponse] =
          await Promise.all([
            fetch("/api/stats", { cache: "no-store" }),
            fetch(
              `/api/${targetTab}?page=${page}&pageSize=${pageSize}${activeFilterQuery ? `&${activeFilterQuery}` : ""}`,
              { cache: "no-store" },
            ),
            fetch("/api/wallets", { cache: "no-store" }),
          ]);
        setStats(await statsResponse.json());
        setData(await pageResponse.json());
        const walletData = await walletsResponse.json();
        setWallets(walletData.wallets);
        setSelectedDuplicates([]);
      } finally {
        setLoading(false);
      }
    },
    [tab, activeFilterQuery, pageSize],
  );

  useEffect(() => {
    void load(tab, 1);
  }, [tab, load]);
  useEffect(() => {
    if (
      new URLSearchParams(window.location.search).get("view") === "duplicates"
    )
      setTab("duplicates");
  }, []);
  useEffect(() => {
    void fetch("/api/filter-options", { cache: "no-store" })
      .then((response) => response.json())
      .then((result: FilterOptions) => setFilterOptions(result));
  }, []);
  async function removeDuplicates(ids: string[]) {
    if (
      !ids.length ||
      !window.confirm(
        `Delete ${ids.length} selected ${ids.length === 1 ? "duplicate" : "duplicates"}? This cannot be undone.`,
      )
    )
      return;
    setDeletingDuplicates(true);
    try {
      const response = await fetch("/api/duplicates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const result = (await response.json()) as {
        deleted?: number;
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error ?? "Could not delete duplicates.");
      setMessage({
        tone: "success",
        text: `${result.deleted ?? 0} ${result.deleted === 1 ? "duplicate" : "duplicates"} deleted.`,
      });
      const targetPage =
        ids.length >= data.rows.length && data.page > 1
          ? data.page - 1
          : data.page;
      await load("duplicates", targetPage);
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not delete duplicates.",
      });
    } finally {
      setDeletingDuplicates(false);
    }
  }

  return (
    <main>
      <header className="topbar">
        <div className="topbar-inner">
          <Brand
            onClick={() => {
              setTab("transactions");
              setSplitMode(false);
              setSplitRows([]);
              setSelectedDuplicates([]);
            }}
          />
          <div className="topbar-actions">
            <TopNavigation
              active={tab}
              duplicateCount={stats.duplicates}
              onTransactions={() => {
                setTab("transactions");
                history.replaceState(null, "", "/");
              }}
              onDuplicates={() => {
                setTab("duplicates");
                setSplitMode(false);
                setSplitRows([]);
                history.replaceState(null, "", "/?view=duplicates");
              }}
            />
          </div>
        </div>
      </header>

      <div className="workspace">
        <section className="page-heading">
          <div>
            <p className="eyebrow">TRANSACTION ARCHIVE</p>
            <h1>{tab === "transactions" ? "Transactions" : "Duplicates"}</h1>
            <p>
              {tab === "transactions"
                ? "Review your synced Actual Budget ledger and clearing status."
                : "Actual handles imported transaction identity and duplicate detection."}
            </p>
          </div>
        </section>

        {message && (
          <div className={`notice ${message.tone}`}>{message.text}</div>
        )}

        {tab === "transactions" &&
          (wallets.length > 0 || filterOptions.categories.length > 0) && (
            <div className="dashboard-widgets">
              {wallets.length > 0 && (
                <details className="dashboard-widget">
                  <summary>
                    <span>
                      <b>Wallets</b>
                      <small>Balances and transaction totals</small>
                    </span>
                    <span className="dashboard-widget-meta">
                      <em>
                        {wallets.length}{" "}
                        {wallets.length === 1 ? "wallet" : "wallets"}
                      </em>
                      <i aria-hidden="true"></i>
                    </span>
                  </summary>
                  <div className="dashboard-widget-content">
                    <div className="wallet-grid">
                      {wallets.map((wallet, index) => (
                        <Link
                          className="wallet-card"
                          href={`/wallets/${encodeURIComponent(wallet.id)}`}
                          key={wallet.wallet}
                        >
                          <span
                            className={`wallet-symbol wallet-color-${index % 4}`}
                          >
                            {wallet.wallet.slice(0, 1)}
                          </span>
                          <span className="wallet-card-copy">
                            <strong>{wallet.wallet}</strong>
                            <small>
                              {wallet.transactionCount.toLocaleString(
                                intlLocale,
                              )}{" "}
                              {wallet.transactionCount === 1
                                ? "transaction"
                                : "transactions"}
                            </small>
                          </span>
                          <span className="wallet-totals">
                            {wallet.totals.map((total) => (
                              <b
                                className={total.total < 0 ? "negative" : ""}
                                key={total.currency}
                              >
                                {new Intl.NumberFormat(intlLocale, {
                                  style: "currency",
                                  currency: total.currency,
                                }).format(total.total)}
                              </b>
                            ))}
                          </span>
                          <span className="wallet-arrow">→</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                </details>
              )}
              {filterOptions.categories.length > 0 && (
                <details className="dashboard-widget">
                  <summary>
                    <span>
                      <b>Categories</b>
                      <small>
                        Net income and spending for{" "}
                        {monthLabel(filterOptions.currentMonth, intlLocale)}
                      </small>
                    </span>
                    <span className="dashboard-widget-meta">
                      <em>
                        {filterOptions.categories.length}{" "}
                        {filterOptions.categories.length === 1
                          ? "category"
                          : "categories"}
                      </em>
                      <i aria-hidden="true"></i>
                    </span>
                  </summary>
                  <div className="dashboard-widget-content">
                    <div className="category-directory">
                      {filterOptions.categories.map((category) => (
                        <Link
                          href={`/categories/${categorySlug(category)}`}
                          key={category}
                        >
                          <CategoryIcon
                            appearance={
                              filterOptions.categoryAppearances?.[category]
                            }
                          />
                          <b>{category}</b>
                          <span className="category-month-total">
                            {(
                              filterOptions.categoryMonthlyTotals?.[category] ??
                              []
                            ).length ? (
                              (
                                filterOptions.categoryMonthlyTotals?.[
                                  category
                                ] ?? []
                              ).map((total) => (
                                <strong key={total.currency}>
                                  {compactMoney(
                                    total.amount,
                                    total.currency,
                                    intlLocale,
                                  )}
                                </strong>
                              ))
                            ) : (
                              <strong>—</strong>
                            )}
                          </span>
                          <i aria-hidden="true">→</i>
                        </Link>
                      ))}
                    </div>
                  </div>
                </details>
              )}
            </div>
          )}

        <section className="ledger">
          <div className="ledger-head">
            <div>
              <h2>
                {tab === "transactions"
                  ? "Transaction history"
                  : "Duplicate records"}
              </h2>
              <p>
                {tab === "transactions"
                  ? "Synced from Actual Budget, newest first"
                  : "No separate duplicate ledger is stored locally"}
              </p>
            </div>
            <div className="ledger-tools">
              {tab === "transactions" &&
                (splitMode ? (
                  <div className="split-mode-actions">
                    <button
                      className="cancel-split"
                      onClick={() => {
                        setSplitMode(false);
                        setSplitRows([]);
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      className="start-split"
                      disabled={!splitRows.length}
                      onClick={() => setSplitDialogOpen(true)}
                    >
                      Split selected
                      {splitRows.length ? ` (${splitRows.length})` : ""}
                    </button>
                  </div>
                ) : (
                  <button
                    className="split-button"
                    onClick={() => setSplitMode(true)}
                  >
                    Split transactions
                  </button>
                ))}
              {tab === "duplicates" && (
                <button
                  className="delete-selected"
                  disabled={!selectedDuplicates.length || deletingDuplicates}
                  onClick={() => void removeDuplicates(selectedDuplicates)}
                >
                  {deletingDuplicates
                    ? "Deleting…"
                    : `Delete selected${selectedDuplicates.length ? ` (${selectedDuplicates.length})` : ""}`}
                </button>
              )}
            </div>
          </div>

          {tab === "transactions" && (
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
          )}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {(splitMode || tab === "duplicates") && (
                    <th className="select-column">
                      {tab === "duplicates" ? (
                        <input
                          aria-label="Select all duplicates on this page"
                          checked={
                            data.rows.length > 0 &&
                            data.rows.every((row) =>
                              selectedDuplicates.includes(row.id),
                            )
                          }
                          type="checkbox"
                          onChange={(event) =>
                            setSelectedDuplicates(
                              event.target.checked
                                ? data.rows.map((row) => row.id)
                                : [],
                            )
                          }
                        />
                      ) : (
                        "Select"
                      )}
                    </th>
                  )}
                  <th>Date</th>
                  <th>Wallet</th>
                  <th>Type</th>
                  <th>Category</th>
                  <th>Note & labels</th>
                  <th>Author</th>
                  {tab === "duplicates" && <th>Actions</th>}
                  <th className="right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={tab === "duplicates" ? 9 : splitMode ? 8 : 7}
                      className="empty"
                    >
                      Loading transactions…
                    </td>
                  </tr>
                ) : data.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={tab === "duplicates" ? 9 : splitMode ? 8 : 7}
                      className="empty"
                    >
                      {tab === "transactions"
                        ? "No transactions are available in Actual Budget."
                        : "No duplicates have been found."}
                    </td>
                  </tr>
                ) : (
                  groupRowsByDay(data.rows).map((group) => (
                    <Fragment key={group.key}>
                      <DayHeader
                        colSpan={tab === "duplicates" ? 9 : splitMode ? 8 : 7}
                        day={group.key}
                        totals={data.dayTotals[group.key] ?? []}
                      />
                      {group.rows.map((row) => (
                        <tr key={row.id}>
                          {(splitMode || tab === "duplicates") && (
                            <td className="select-column">
                              <input
                                aria-label={
                                  tab === "duplicates"
                                    ? `Select duplicate ${row.id}`
                                    : `Select transaction ${row.id}`
                                }
                                checked={
                                  tab === "duplicates"
                                    ? selectedDuplicates.includes(row.id)
                                    : splitRows.some(
                                        (item) => item.id === row.id,
                                      )
                                }
                                type="checkbox"
                                onChange={(event) =>
                                  tab === "duplicates"
                                    ? setSelectedDuplicates((current) =>
                                        event.target.checked
                                          ? [...current, row.id]
                                          : current.filter(
                                              (id) => id !== row.id,
                                            ),
                                      )
                                    : setSplitRows((current) =>
                                        event.target.checked
                                          ? [...current, row]
                                          : current.filter(
                                              (item) => item.id !== row.id,
                                            ),
                                      )
                                }
                              />
                            </td>
                          )}
                          <td>
                            <strong>{formatDate(row.date, intlLocale)}</strong>
                            <TransactionClearedStatus cleared={row.cleared} />
                          </td>
                          <td>
                            <Link
                              className="wallet-link"
                              href={`/wallets/${encodeURIComponent(row.accountId ?? row.wallet)}`}
                            >
                              <span className="wallet">
                                {row.wallet.slice(0, 1)}
                              </span>
                              {row.wallet}
                            </Link>
                          </td>
                          <td>
                            <span
                              className={`type ${row.type.toLowerCase().replaceAll(" ", "-")}`}
                            >
                              {row.type}
                            </span>
                          </td>
                          <td>
                            {row.categoryName ? (
                              <Link
                                className="category-link category-link-with-icon"
                                href={`/categories/${encodeURIComponent(row.categoryId ?? categorySlug(row.categoryName))}`}
                              >
                                <CategoryIcon
                                  appearance={
                                    filterOptions.categoryAppearances?.[
                                      row.categoryName
                                    ]
                                  }
                                />
                                {row.categoryName}
                              </Link>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>
                            {row.note || row.labels || row.validation ? (
                              <>
                                <div className="transaction-description-line">
                                  {row.note && (
                                    <span className="transaction-description-text">
                                      {row.note}
                                    </span>
                                  )}
                                  {tab === "transactions" && row.validation && (
                                    <span className="transaction-validation-match">
                                      <span
                                        className="transaction-validation-description"
                                        title={row.validation.description}
                                      >
                                        {row.validation.description}
                                      </span>
                                      <Link
                                        aria-label={`Open validation ${row.validation.title}`}
                                        className="transaction-validation-link"
                                        href={`/validate?validation=${row.validation.id}`}
                                        title={`Open ${row.validation.title}`}
                                      >
                                        <span aria-hidden="true">↗</span>
                                      </Link>
                                    </span>
                                  )}
                                </div>
                                {row.labels && <small>{row.labels}</small>}
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>{row.author ?? "—"}</td>
                          {tab === "duplicates" && (
                            <td>
                              <button
                                className="delete-row"
                                disabled={deletingDuplicates}
                                onClick={() => void removeDuplicates([row.id])}
                              >
                                Delete
                              </button>
                            </td>
                          )}
                          <td className="right">
                            <Amount row={row} />
                            {row.duplicateOfId && (
                              <small>matches #{row.duplicateOfId}</small>
                            )}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <div className="pagination-summary">
              <span>
                {data.total
                  ? `${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)} of ${data.total}`
                  : "0 records"}
              </span>
              <PageSizeSelect value={pageSize} onChange={setPageSize} />
            </div>
            <div>
              <button
                disabled={data.page <= 1 || loading}
                onClick={() => void load(tab, data.page - 1)}
              >
                ←
              </button>
              <span>
                Page {data.page} of {data.pages}
              </span>
              <button
                disabled={data.page >= data.pages || loading}
                onClick={() => void load(tab, data.page + 1)}
              >
                →
              </button>
            </div>
          </div>
        </section>
      </div>
      {splitDialogOpen && (
        <SplitDialog
          transactions={splitRows}
          onClose={() => setSplitDialogOpen(false)}
        />
      )}
    </main>
  );
}
