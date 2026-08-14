# Spendee

> [!IMPORTANT]
> **This entire repository, including the application, design, tests, documentation, and deployment setup was made with AI.**

A private, self-hosted companion for an Actual Budget ledger.
Browse the synchronized ledger, see Actual's cleared state, validate account
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
not model: receipt review records, saved split snapshots, and validation runs,
including their immutable transaction snapshots and generated artifacts. Small
UI preferences such as category appearance and monthly column layouts also
remain there. Receipt files live in a separate persistent directory. The SQLite
file is not a second transaction ledger.

Both stores contain financial information. Keep the SQLite file and Actual's
local cache on persistent, access-controlled storage, and never commit runtime
environment files or downloaded budget data.

## What it does

- Shows account totals, account and category activity, filters, daily groups,
  Actual's cleared status, and monthly category reports from the synchronized
  Actual snapshot.
- Edits an account's starting balance through its Actual starting-balance
  transaction when one exists.
- Validates PDF statements against an Actual account with OpenAI extraction.
  Validation metadata, normalized statement rows, matching results, the model
  response, and a first-page thumbnail remain in SQLite; the source PDF is not
  retained.
- Extracts JPEG, PNG, WebP, and PDF receipts with OpenAI, presents every line
  item for review, and creates an uncleared Actual transaction only after
  confirmation. Receipt documents and review state stay on the companion
  server and can be deleted independently.
- Offers a bearer-authenticated mobile API for Actual references, transaction
  creation/deletion, and the receipt workflow.
- Saves split snapshots independently in SQLite and renders downloadable A4 PDF
  copies without copying the live ledger into SQLite.
- Exposes Actual-backed read tools and SQLite-backed split tools through a
  stateless MCP Streamable HTTP endpoint.
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
6. Set both `SPENDEE_BASIC_AUTH_USERNAME` and
   `SPENDEE_BASIC_AUTH_PASSWORD` for every network-accessible deployment. Both
   may be left empty for local development; a partial configuration fails
   closed.
7. Optionally set `SPENDEE_API_KEY` for clients that use
   `Authorization: Bearer …`. Browser requests continue to use Basic Auth.

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

Document validation and receipt extraction are optional and require
`OPENAI_API_KEY`. Both use `gpt-5.6-sol` by default; set
`OPENAI_VALIDATION_MODEL` or `OPENAI_RECEIPT_MODEL` to override either task. The
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

The container exposes port `3000`, keeps SQLite at `/data/spendee.db`, Actual's
cache at `/data/actual`, receipt files at `/data/receipts`, and reports liveness
at `/api/health` and Actual-backed readiness at `/api/ready`. For a
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
application at the normalized branch image tag, configure the `ACTUAL_*` and
`SPENDEE_BASIC_AUTH_*` runtime variables there, optionally add
`SPENDEE_API_KEY`, and mount persistent storage at `/data`. The deploy job sends
only the configured resource identifier to
Coolify and suppresses the API response so identifiers and tokens are not
printed in CI logs.

The application enforces HTTP Basic Authentication at the request boundary
when both Spendee authentication variables are present. It protects the UI,
financial APIs, and MCP endpoint while leaving only `/api/ready` and static
assets public for orchestration and rendering. Use an additional private access
policy when stronger identity controls are required.

## MCP server

Connect an MCP client to:

```text
https://your-spendee.example.test/mcp
```

The endpoint uses stateless Streamable HTTP with JSON responses. Data tools
read the synchronized Actual snapshot, while split tools read SQLite. It does
not expose transaction mutation or file-import tools.
When application authentication is configured, MCP clients must send the same
credentials in the standard HTTP `Authorization: Basic ...` header.

## Mobile API

When `SPENDEE_API_KEY` is configured, mobile clients can send it as a bearer
token to these endpoints:

- `GET /api/references`
- `GET|POST /api/transactions` and `DELETE /api/transactions/:id`
- `GET|POST /api/receipts`, `GET|DELETE /api/receipts/:id`,
  `GET /api/receipts/:id/file`, and `POST /api/receipts/:id/submit`

Receipt uploads use multipart form data with `account` and `receipt` fields.
Transaction creation accepts Actual account, category, and tag IDs; amounts are
decimal currency units and submitted transactions default to uncleared.

## License

[MIT](LICENSE)

### Third-party assets

The category icons in `public/category-icons` are official Spendee assets
retrieved from `api.spendee.com`. They remain the property of their respective
owner and are not covered by this repository's MIT license.
