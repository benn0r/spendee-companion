# Spendee

A private, self-hosted companion for Spendee transaction exports. Upload one or
more `.xlsx` or `.csv` files, keep every exported field in SQLite, browse
transactions with server-side pagination, and safely reconcile complete wallet
exports.

![Spendee desktop interface with fictional wallets and transactions](docs/screenshots/spendee-desktop.png)

> The screenshots use entirely fictional demo data. No personal export data is
> included in this repository.

<details>
  <summary>Mobile layout</summary>

  ![Spendee mobile interface with fictional wallets and transactions](docs/screenshots/spendee-mobile.png)
</details>

## What it does

- Imports Spendee's `Date`, `Wallet`, `Type`, `Category name`, `Amount`,
  `Currency`, `Note`, `Labels`, and `Author` columns.
- Accepts mixed XLSX/CSV batches in one upload, including valid header-only exports.
- Continues processing the rest of a batch when an individual file is invalid.
- Preserves import batch, source filename, source row, raw row data, and import
  timestamp for traceability.
- Identifies a transaction by its normalized date/time string, type, and wallet.
- Stores unchanged repeat occurrences in `duplicates`, linked to the original
  transaction.
- Offers a **Full import** mode for complete, single-wallet exports. Changed
  transactions and transactions missing from the new export are placed in an
  approval queue; the ledger is never changed or pruned automatically.
- Lets the user approve or reject proposed changes and deletions in batches.
- Shows the current transaction-derived total for every wallet on the homepage,
  with a dedicated paginated activity page for each wallet.
- Supports a persisted starting amount per wallet and currency; wallet totals
  combine that starting amount with all active transactions.
- Links every category to a cross-wallet detail page with paginated matching
  transactions and a configurable spending-by-tag pie chart. Unselected and
  untagged spending is grouped into `Other`.
- Filters transactions by date range, multiple wallets, types, categories,
  tags, authors, and absolute amount. Long option lists are searchable.
- Groups transaction tables by day with `Today`, `Yesterday`, or calendar-date
  headers and complete daily totals for the current view.
- Provides a compact monthly category report. Report columns can combine
  multiple categories and optionally include color-coded budgets.
- Splits any selection of transactions across a configurable number of shares,
  with additional positive or negative custom positions and live totals.
- Persists split snapshots independently from the transaction ledger. Saved
  splits can be reviewed, deleted, and downloaded as an A4 PDF.
- Paginates transaction, duplicate, wallet, and category lists on the server and
  stores data in a WAL-mode SQLite database.
- Exposes the same data through a read-only MCP Streamable HTTP endpoint.

Each uploaded file represents one wallet when **Full import** is enabled. A
full-import batch may contain multiple files, but the same wallet may only
appear in one file.

## Run locally

Requires Node.js 22 or newer.

```sh
npm install
npm run dev
```

Open <http://localhost:3000>. By default the database is created at
`./data/spendee.db`. Set `SQLITE_PATH` to use another location.

```sh
SQLITE_PATH=/absolute/path/spendee.db npm run dev
```

## Test and build

```sh
npm test
npm run build
```

The test suite covers imports, duplicate persistence, reconciliation approvals,
wallet and category reporting, filters, monthly reports, split persistence, and
PDF generation.

## Docker

```sh
docker build -t spendee .
docker run --rm -p 3000:3000 -v spendee-data:/data spendee
```

The container exposes port `3000`, stores its database at
`/data/spendee.db`, and provides a health endpoint at `/api/health`. A
`compose.example.yml` is included for a persistent deployment.

## Read-only MCP server

Connect an MCP client to:

```text
https://your-spendee.example.com/mcp
```

The endpoint uses stateless Streamable HTTP with JSON responses. It only
registers read tools: overview and filter options, filtered/paginated
transactions, duplicates, wallets, category details, Monthy reports,
splits, and pending reconciliation items. It cannot import, update, approve, or
delete data.

## License

[MIT](LICENSE) © 2026 Spendee Contributors
