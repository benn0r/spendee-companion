import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const buildRoot = resolve(process.argv[2] ?? ".next/standalone");
const actualDist = join(
  buildRoot,
  "node_modules",
  "@actual-app",
  "api",
  "dist",
);
const migrationsDir = join(actualDist, "migrations");
const defaultDatabase = join(actualDist, "default-db.sqlite");
const serverChunks = join(buildRoot, ".next", "server", "chunks");
const sourceRequire = createRequire(import.meta.url);
const sourceActualDist = dirname(sourceRequire.resolve("@actual-app/api"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function filesRecursively(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesRecursively(path) : [path];
  });
}

const migrationFiles = readdirSync(migrationsDir).filter((name) =>
  /\.(?:js|sql)$/.test(name),
);
const sourceMigrationFiles = readdirSync(join(sourceActualDist, "migrations"))
  .filter((name) => /\.(?:js|sql)$/.test(name))
  .sort();
assert(
  JSON.stringify(migrationFiles.sort()) ===
    JSON.stringify(sourceMigrationFiles),
  "The standalone build does not contain every Actual migration.",
);
assert(
  statSync(defaultDatabase).size ===
    statSync(join(sourceActualDist, "default-db.sqlite")).size,
  "The standalone build does not contain Actual's complete default database.",
);

const virtualActualPath = Buffer.from(
  "/ROOT/node_modules/@actual-app/api/dist",
);
const chunkWithVirtualPath = filesRecursively(serverChunks)
  .filter((path) => path.endsWith(".js"))
  .find((path) => readFileSync(path).includes(virtualActualPath));
assert(
  !chunkWithVirtualPath,
  "A server chunk contains Actual's virtual build path; keep @actual-app/api externalized.",
);

const runtimeRequire = createRequire(join(buildRoot, "server.js"));
const runtimeActualEntry = runtimeRequire.resolve("@actual-app/api");
assert(
  runtimeActualEntry.startsWith(join(buildRoot, "node_modules")),
  "The standalone build does not resolve its own Actual package.",
);

const runtimeActual = runtimeRequire("@actual-app/api");
const actualRequire = createRequire(runtimeActualEntry);
const Database = actualRequire("better-sqlite3");
const database = new Database(":memory:");
assert(
  database.prepare("select 1 as value").get().value === 1,
  "Actual's standalone SQLite runtime is not functional.",
);
database.close();

const dataDir = mkdtempSync(join(tmpdir(), "spendee-actual-runtime-"));
try {
  const runtime = await runtimeActual.init({ dataDir, verbose: false });
  const result = await runtime.send("create-budget", {
    budgetName: "Runtime Asset Smoke",
    avoidUpload: true,
  });
  assert(
    !result?.error,
    `Actual could not create an offline budget: ${result?.error}`,
  );
  const budgetDatabases = readdirSync(dataDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(dataDir, entry.name, "db.sqlite"))
    .filter((path) => {
      try {
        return statSync(path).size > 0;
      } catch {
        return false;
      }
    });
  assert(
    budgetDatabases.length === 1,
    "Actual could not create and migrate a standalone budget.",
  );
} finally {
  try {
    await runtimeActual.shutdown();
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
}

console.log(
  `Verified Actual runtime assets (${migrationFiles.length} migrations) in ${buildRoot}.`,
);
