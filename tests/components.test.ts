import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CategoryIcon from "../app/CategoryIcon";
import DayHeader from "../app/DayHeader";
import PageSizeSelect from "../app/PageSizeSelect";
import TopNavigation from "../app/TopNavigation";
import TransactionFilters, { emptyFilters } from "../app/TransactionFilters";
import Dashboard from "../app/Dashboard";
import MonthlyReport from "../app/monthly/MonthlyReport";
import SplitsView from "../app/splits/SplitsView";
import WalletDetails from "../app/wallets/[wallet]/WalletDetails";
import { assetUrl, BUILD_ID } from "../lib/assets";

test("shared UI components render accessible fantasy-data states", () => {
  const icon = renderToStaticMarkup(React.createElement(CategoryIcon, {
    appearance: { iconId: 3, color: "#12c48b" },
  }));
  assert.match(icon, /cat_3\.svg/);
  assert.match(icon, new RegExp(`v=${BUILD_ID}`));
  assert.match(icon, /background-color:#12c48b/);
  assert.match(renderToStaticMarkup(React.createElement(CategoryIcon, {})), />#<\/b>/);

  const day = renderToStaticMarkup(React.createElement("table", null,
    React.createElement("tbody", null, React.createElement(DayHeader, {
      day: "2025-01-23", totals: [{ currency: "CHF", total: -42 }], colSpan: 7,
    })),
  ));
  assert.match(day, /23\. January/);
  assert.match(day, /CHF/);

  const pageSize = renderToStaticMarkup(React.createElement(PageSizeSelect, { value: 25, onChange() {} }));
  assert.match(pageSize, /aria-label="Rows per page"/);
  assert.match(pageSize, /value="25" selected=""/);

  const navigation = renderToStaticMarkup(React.createElement(TopNavigation, {
    active: "duplicates", duplicateCount: 4, onTransactions() {}, onDuplicates() {},
  }));
  assert.match(navigation, /Duplicates <span>4<\/span>/);
  assert.match(navigation, /class="active">Duplicates/);
});

test("assetUrl versions public assets with the footer build id", () => {
  assert.equal(assetUrl("/favicon-32.png"), `/favicon-32.png?v=${BUILD_ID}`);
  assert.equal(assetUrl("/asset.svg?size=small"), `/asset.svg?size=small&v=${BUILD_ID}`);
});

test("filters and top-level client views have stable server-rendered shells", () => {
  const filters = renderToStaticMarkup(React.createElement(TransactionFilters, {
    options: {
      wallets: ["Moon Purse"], types: [], categories: ["Dragon Food"], tags: ["quest"], authors: [],
    },
    value: emptyFilters,
    active: true,
    onChange() {},
    onApply() {},
    onClear() {},
  }));
  assert.match(filters, /Moon Purse/);
  assert.match(filters, /Categories/);
  assert.match(filters, /Labels/);
  assert.match(filters, /Clear/);
  assert.doesNotMatch(filters, /Authors|Types/);

  const categoryFilters = renderToStaticMarkup(React.createElement(TransactionFilters, {
    options: { wallets: [], types: [], categories: ["Hidden Realm"], tags: [], authors: [] },
    value: emptyFilters,
    active: false,
    hideCategories: true,
    onChange() {},
    onApply() {},
    onClear() {},
  }));
  assert.doesNotMatch(categoryFilters, /Hidden Realm|Clear/);

  assert.match(renderToStaticMarkup(React.createElement(Dashboard)), /Transaction history/);
  assert.match(renderToStaticMarkup(React.createElement(MonthlyReport)), /Monthly totals/);
  assert.match(renderToStaticMarkup(React.createElement(SplitsView)), /Past splits/);
  const wallet = renderToStaticMarkup(React.createElement(WalletDetails, { wallet: "Moon Purse" }));
  assert.match(wallet, /category-hero wallet-detail-hero/);
  assert.match(wallet, /aria-label="Wallet settings"/);
  assert.match(wallet, /Current amount/);
  assert.doesNotMatch(wallet, /Starting amount/);
});
