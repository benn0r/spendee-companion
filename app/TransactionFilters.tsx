"use client";

import { useEffect, useRef, useState } from "react";

export type FilterOptions = {
  wallets: string[];
  types: string[];
  categories: string[];
  tags: string[];
  authors: string[];
};

export type FilterState = {
  dateFrom: string;
  dateTo: string;
  wallets: string[];
  types: string[];
  categories: string[];
  tags: string[];
  authors: string[];
  amountOperator: "" | "gt" | "lt" | "eq";
  amount: string;
};

export const emptyFilters: FilterState = {
  dateFrom: "",
  dateTo: "",
  wallets: [],
  types: [],
  categories: [],
  tags: [],
  authors: [],
  amountOperator: "",
  amount: "",
};

export function filterQuery(filters: FilterState) {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  filters.wallets.forEach((value) => params.append("wallet", value));
  filters.types.forEach((value) => params.append("type", value));
  filters.categories.forEach((value) => params.append("category", value));
  filters.tags.forEach((value) => params.append("tag", value));
  filters.authors.forEach((value) => params.append("author", value));
  if (filters.amountOperator && filters.amount !== "") {
    params.set("amountOperator", filters.amountOperator);
    params.set("amount", filters.amount);
  }
  return params.toString();
}

function MultiFilter({
  label,
  options,
  selected,
  onChange,
  searchable = false,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  searchable?: boolean;
}) {
  const [search, setSearch] = useState("");
  const visibleOptions = search
    ? options.filter((option) => option.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
    : options;
  return (
    <details className="filter-multi">
      <summary>{label}{selected.length > 0 && <b>{selected.length}</b>}</summary>
      <div>
        {searchable && options.length > 0 && (
          <input
            aria-label={`Search ${label.toLowerCase()}`}
            className="filter-search"
            placeholder={`Search ${label.toLowerCase()}…`}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        )}
        {visibleOptions.length === 0 ? <span>{search ? "No matches" : "No options"}</span> : visibleOptions.map((option) => (
          <label key={option}>
            <input
              checked={selected.includes(option)}
              type="checkbox"
              onChange={(event) => onChange(event.target.checked
                ? [...selected, option]
                : selected.filter((value) => value !== option)
              )}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </details>
  );
}

export default function TransactionFilters({
  options,
  value,
  active,
  onChange,
  onApply,
  onClear,
}: {
  options: FilterOptions;
  value: FilterState;
  active: boolean;
  onChange: (filters: FilterState) => void;
  onApply: () => void;
  onClear: () => void;
}) {
  const update = (patch: Partial<FilterState>) => onChange({ ...value, ...patch });
  const panelRef = useRef<HTMLElement>(null);
  const closeMenus = () => panelRef.current?.querySelectorAll("details").forEach((details) => {
    details.open = false;
  });
  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) closeMenus();
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);
  return (
    <section className="transaction-filters" aria-label="Transaction filters" ref={panelRef}>
      <div className="filter-row">
        <label className="filter-date">
          <span>From</span>
          <input type="date" value={value.dateFrom} onChange={(event) => update({ dateFrom: event.target.value })} />
        </label>
        <label className="filter-date">
          <span>To</span>
          <input type="date" value={value.dateTo} onChange={(event) => update({ dateTo: event.target.value })} />
        </label>
        <MultiFilter label="Wallets" options={options.wallets} selected={value.wallets} onChange={(wallets) => update({ wallets })} />
        <MultiFilter searchable label="Types" options={options.types} selected={value.types} onChange={(types) => update({ types })} />
        <MultiFilter searchable label="Categories" options={options.categories} selected={value.categories} onChange={(categories) => update({ categories })} />
        <MultiFilter searchable label="Tags" options={options.tags} selected={value.tags} onChange={(tags) => update({ tags })} />
        <MultiFilter label="Authors" options={options.authors} selected={value.authors} onChange={(authors) => update({ authors })} />
      </div>
      <div className="filter-amount-row">
        <span>Absolute amount</span>
        <select
          aria-label="Amount comparison"
          value={value.amountOperator}
          onChange={(event) => update({ amountOperator: event.target.value as FilterState["amountOperator"] })}
        >
          <option value="">Any amount</option>
          <option value="gt">Greater than</option>
          <option value="lt">Less than</option>
          <option value="eq">Equal to</option>
        </select>
        <input
          aria-label="Amount"
          disabled={!value.amountOperator}
          min="0"
          placeholder="Amount"
          step="0.01"
          type="number"
          value={value.amount}
          onChange={(event) => update({ amount: event.target.value })}
        />
        <div className="filter-actions">
          {active && <button className="clear-filters" onClick={() => { closeMenus(); onClear(); }}>Clear</button>}
          <button className="apply-filters" onClick={() => { closeMenus(); onApply(); }}>Apply filters</button>
        </div>
      </div>
    </section>
  );
}
