# Spendee

A private, self-hosted archive for Spendee transaction exports. Upload one or
more `.xlsx` or `.csv` files, keep every exported field in SQLite, browse transactions
with server-side pagination, and review duplicate occurrences separately.

![Spendee desktop interface](docs/screenshots/spendee-desktop.png)

<details>
  <summary>Mobile layout</summary>

  ![Spendee mobile interface](docs/screenshots/spendee-mobile.png)
</details>

## What it does

- Imports Spendee's `Date`, `Wallet`, `Type`, `Category name`, `Amount`,
  `Currency`, `Note`, `Labels`, and `Author` columns.
- Accepts mixed XLSX/CSV batches in one upload, including valid header-only exports.
- Continues processing the rest of a batch when an individual file is invalid.
- Preserves import batch, source filename, source row, raw row data, and import
  timestamp for traceability.
- Detects duplicates using a SHA-256 fingerprint of all nine normalized export
  fields.
- Stores the first occurrence in `transactions` and every later occurrence in
  `duplicates`, linked to the original transaction.
- Paginates both lists on the server and stores data in a WAL-mode SQLite
  database.

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

The test suite verifies that unique transactions remain in the main ledger and
that every repeated occurrence is persisted in the duplicate ledger.

## Docker

```sh
docker build -t spendee .
docker run --rm -p 3000:3000 -v spendee-data:/data spendee
```

The container exposes port `3000`, stores its database at
`/data/spendee.db`, and provides a health endpoint at `/api/health`. A
`compose.example.yml` is included for a persistent deployment.

## Gitea and Coolify

The Gitea Actions workflow follows the same convention as the Habit Tracker and
Love Tracker projects:

1. Every branch is tested and built.
2. Branch pushes publish
   `git.example.invalid/benn0r/spendee:<sanitized-branch>` using the
   `REGISTRY_TOKEN` repository secret.
3. Obsolete branch images are removed after branch deletion or PR merge.

For Coolify, deploy `git.example.invalid/benn0r/spendee:main`, expose port `3000`,
mount a persistent volume at `/data`, and use `/api/health` as the health check.
The SQLite database must remain on that persistent volume.

## License

[MIT](LICENSE) © 2026 Spendee Contributors
