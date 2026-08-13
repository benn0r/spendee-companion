# Spendee

> [!IMPORTANT]
> **This entire repository, including the application, design, tests, documentation, and deployment setup was made with AI.**

A private, self-hosted companion for Spendee exports backed by Actual Budget.
Upload `.xlsx` or `.csv` exports, browse the resulting ledger, validate account
statements, and save shareable splits without maintaining a second transaction
database.

![Spendee desktop interface with fictional wallets and transactions](docs/screenshots/spendee-desktop.png)

<details>
  <summary>Mobile layout</summary>

![Spendee mobile interface with fictional wallets and transactions](docs/screenshots/spendee-mobile.png)
</details>

## Data ownership

Actual Budget is the source of truth for accounts, categories, tags, payees,
transactions, and balances. This application synchronizes the configured Actual
budget before producing its short-lived read snapshot. Tags follow Actual's
exact-case semantics and are represented by `#tokens` in transaction notes.

SQLite is intentionally limited to application-owned records that Actual does
not model: saved split snapshots and validation runs, including their immutable
transaction snapshots and generated artifacts. Small UI preferences such as
category appearance, monthly column layouts, and the verification date also
remain there. The SQLite file is not a second transaction ledger.

Both stores contain financial information. Keep the SQLite file and Actual's
local cache on persistent, access-controlled storage, and never commit runtime
environment files or downloaded budget data.

## What it does

- Imports Spendee's date, wallet, type, category, amount, currency, note, labels,
  and author fields from mixed XLSX/CSV batches.
- Resolves each Spendee wallet and category to an existing Actual account and
  category. Missing or ambiguous matches fail visibly instead of creating an
  unintended ledger structure.
- Writes imports directly to Actual with a stable imported ID, allowing Actual
  to identify a repeated source row. Notes are preserved and labels become
  Actual-style tag tokens.
- Treats **Full import** as a one-account-per-file validation mode. It does not
  delete or replace transactions in Actual.
- Shows account totals, account and category activity, filters, daily groups,
  and monthly category reports from the synchronized Actual snapshot.
- Edits an account's starting balance through its Actual starting-balance
  transaction when one exists.
- Validates PDF statements against an Actual account with OpenAI extraction.
  Validation metadata, normalized statement rows, matching results, the model
  response, and a first-page thumbnail remain in SQLite; the source PDF is not
  retained.
- Saves split snapshots independently in SQLite and renders downloadable A4 PDF
  copies without copying the live ledger into SQLite.
- Exposes Actual-backed read tools, SQLite-backed split tools, and one explicit
  Spendee file-import tool through a stateless MCP Streamable HTTP endpoint.
- Provides an English-first localization layer with additional locale catalogs.

## Configure Actual Budget

Requires Node.js 22 or newer and an accessible Actual Budget server.

1. Copy `.env.example` to `.env`.
2. Set `ACTUAL_SERVER_URL` to the server origin and `ACTUAL_SYNC_ID` to the
   target budget's sync ID.
3. Configure exactly one authentication method: `ACTUAL_PASSWORD` or
   `ACTUAL_SESSION_TOKEN`.
4. For an encrypted budget, set `ACTUAL_BUDGET_ENCRYPTION_PASSWORD`.
5. Optionally set `ACTUAL_BUDGET_ID` when the local budget ID differs from the
   sync ID. `ACTUAL_DEFAULT_CURRENCY` may also be set as a safety check; when it
   is omitted, the budget's Actual preference is used.

Do not put real server URLs, identifiers, passwords, tokens, or budget exports
in tracked files. Configuration errors intentionally name the missing variable
without echoing its value.

## Run locally

```sh
cp .env.example .env
npm ci
npm run dev
```

Open <http://localhost:3000>. Local development stores split and validation
records at `./data/spendee.db` and the downloaded Actual cache under
`./data/actual` unless the corresponding paths are overridden.

Document validation is optional and requires `OPENAI_API_KEY`. It uses
`gpt-5.6-sol` by default; set `OPENAI_VALIDATION_MODEL` to override it. The
runtime image includes Poppler for first-page thumbnails.

## Test and build

```sh
npm test
npm run test:coverage
npm run test:e2e
npm run build
```

Unit tests inject a synthetic Actual adapter and use isolated SQLite databases.
The Playwright suite exercises the desktop and mobile journeys with fantasy
ledger data, so neither test suite connects to a personal Actual server or
modifies a real budget. Install Chromium once with
`npx playwright install chromium` before running the end-to-end suite locally.

## Docker

The example Compose deployment loads secrets from the untracked `.env` file and
persists both local stores in one named volume:

```sh
cp .env.example .env
docker compose --env-file .env -f compose.example.yml up --build -d
```

The container exposes port `3000`, keeps SQLite at `/data/spendee.db`, keeps
Actual's cache at `/data/actual`, and reports liveness at `/api/health` and
Actual-backed readiness at `/api/ready`. For a
direct Docker run, provide the same environment file and persistent volume:

```sh
docker build -t spendee .
docker run --rm --env-file .env -p 3000:3000 -v spendee-data:/data spendee
```

## Gitea pipeline and Coolify

The Gitea workflow checks formatting and linting before building once. Unit and
browser tests then run in parallel from the build artifact. Only after both
succeed does it publish the branch-tagged container image, followed by a
Coolify deployment for the explicitly configured branch.

Configure these Gitea repository variables without committing their values:

- `PLAYWRIGHT_IMAGE`: runner image containing Playwright browser dependencies.
- `COOLIFY_DEPLOY_BRANCH`: the single branch assigned to this Coolify resource.
- `COOLIFY_API_URL`: the Coolify server origin, without `/api/v1`.
- `COOLIFY_RESOURCE_UUID`: the application resource in the new environment.

Configure these Gitea repository secrets:

- `REGISTRY_TOKEN`: token used to publish the image and pull the Playwright
  runner image.
- `COOLIFY_API_TOKEN`: token allowed to deploy the configured resource.

In Coolify, create a separate environment in the existing project, point its
application at the normalized branch image tag, configure the `ACTUAL_*`
runtime variables there, and mount persistent storage at `/data`. The deploy
job sends only the configured resource identifier to Coolify and suppresses the
API response so identifiers and tokens are not printed in CI logs.

The application deliberately has no login screen of its own. Before exposing a
deployment, protect the Coolify route with HTTP Basic Authentication or an
equivalent private access policy. This is required because the UI and MCP route
can read financial data, and the import endpoints can write to Actual.

## MCP server

Connect an MCP client to:

```text
https://your-spendee.example.test/mcp
```

The endpoint uses stateless Streamable HTTP with JSON responses. Data tools
read the synchronized Actual snapshot, while split tools read SQLite. The
`import_transaction_files` tool accepts one to ten XLSX/CSV files as base64
using `{ filename, contentBase64 }`. Setting `full: true` validates that each
file maps to one Actual account; it never replaces that account's ledger.

## License

[MIT](LICENSE)

### Third-party assets

The category icons in `public/category-icons` are official Spendee assets
retrieved from `api.spendee.com`. They remain the property of their respective
owner and are not covered by this repository's MIT license.
