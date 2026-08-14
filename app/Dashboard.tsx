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
import Ionicon from "./Ionicon";

type Row = {
  id: string;
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
  const [data, setData] = useState<PageData>(emptyPage);
  const [loading, setLoading] = useState(true);
  const [wallets, setWallets] = useState<WalletSummary[]>([]);
  const [filterOptions, setFilterOptions] =
    useState<FilterOptions>(emptyFilterOptions);
  const [draftFilters, setDraftFilters] = useState<FilterState>(emptyFilters);
  const [activeFilterQuery, setActiveFilterQuery] = useState("");
  const [splitMode, setSplitMode] = useState(false);
  const [splitRows, setSplitRows] = useState<Row[]>([]);
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [pageSize, setPageSize] = useState(25);

  const load = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const [pageResponse, walletsResponse] = await Promise.all([
          fetch(
            `/api/transactions?page=${page}&pageSize=${pageSize}${activeFilterQuery ? `&${activeFilterQuery}` : ""}`,
            { cache: "no-store" },
          ),
          fetch("/api/wallets", { cache: "no-store" }),
        ]);
        setData(await pageResponse.json());
        const walletData = await walletsResponse.json();
        setWallets(walletData.wallets);
      } finally {
        setLoading(false);
      }
    },
    [activeFilterQuery, pageSize],
  );

  useEffect(() => {
    void load(1);
  }, [load]);
  useEffect(() => {
    void fetch("/api/filter-options", { cache: "no-store" })
      .then((response) => response.json())
      .then((result: FilterOptions) => setFilterOptions(result));
  }, []);
  return (
    <main>
      <header className="topbar">
        <div className="topbar-inner">
          <Brand
            onClick={() => {
              setSplitMode(false);
              setSplitRows([]);
            }}
          />
          <div className="topbar-actions">
            <TopNavigation
              active="transactions"
              onTransactions={() => {
                history.replaceState(null, "", "/");
              }}
            />
          </div>
        </div>
      </header>

      <div className="workspace">
        <section className="page-heading">
          <div>
            <p className="eyebrow">TRANSACTION ARCHIVE</p>
            <h1>Transactions</h1>
            <p>Review your synced Actual Budget ledger and clearing status.</p>
          </div>
        </section>

        {(wallets.length > 0 || filterOptions.categories.length > 0) && (
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
                            {wallet.transactionCount.toLocaleString(intlLocale)}{" "}
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
                        <span className="wallet-arrow">
                          <Ionicon name="chevron-forward" />
                        </span>
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
                              filterOptions.categoryMonthlyTotals?.[category] ??
                              []
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
                        <i>
                          <Ionicon name="chevron-forward" />
                        </i>
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
              <h2>Transaction history</h2>
              <p>Synced from Actual Budget, newest first</p>
            </div>
            <div className="ledger-tools">
              {splitMode ? (
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
              <thead>
                <tr>
                  {splitMode && <th className="select-column">Select</th>}
                  <th>Date</th>
                  <th>Wallet</th>
                  <th>Type</th>
                  <th>Category</th>
                  <th>Note & labels</th>
                  <th>Author</th>
                  <th className="right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={splitMode ? 8 : 7} className="empty">
                      Loading transactions…
                    </td>
                  </tr>
                ) : data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={splitMode ? 8 : 7} className="empty">
                      No transactions are available in Actual Budget.
                    </td>
                  </tr>
                ) : (
                  groupRowsByDay(data.rows).map((group) => (
                    <Fragment key={group.key}>
                      <DayHeader
                        colSpan={splitMode ? 8 : 7}
                        day={group.key}
                        totals={data.dayTotals[group.key] ?? []}
                      />
                      {group.rows.map((row) => (
                        <tr key={row.id}>
                          {splitMode && (
                            <td className="select-column">
                              <input
                                aria-label={`Select transaction ${row.id}`}
                                checked={splitRows.some(
                                  (item) => item.id === row.id,
                                )}
                                type="checkbox"
                                onChange={(event) =>
                                  setSplitRows((current) =>
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
                                  {row.validation && (
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
                                        <Ionicon name="open-outline" />
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
                          <td className="right">
                            <Amount row={row} />
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
                onClick={() => void load(data.page - 1)}
              >
                <Ionicon name="chevron-back" />
              </button>
              <span>
                Page {data.page} of {data.pages}
              </span>
              <button
                disabled={data.page >= data.pages || loading}
                onClick={() => void load(data.page + 1)}
              >
                <Ionicon name="chevron-forward" />
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
