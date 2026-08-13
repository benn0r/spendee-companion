import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { resetFantasyActualData } from "../support/fantasy-actual";

const databasePath = process.env.SQLITE_PATH;
if (
  !databasePath?.startsWith("/tmp/spendee-playwright-") ||
  !databasePath.endsWith(".db")
) {
  throw new Error("Refusing to reset an unexpected Playwright database path.");
}
for (const suffix of ["", "-shm", "-wal"])
  rmSync(`${databasePath}${suffix}`, { force: true });

const actualMockDataPath = process.env.ACTUAL_MOCK_DATA_PATH;
if (
  !actualMockDataPath?.startsWith("/tmp/spendee-playwright-") ||
  !actualMockDataPath.endsWith(".json")
) {
  throw new Error("Refusing to use an unexpected Actual mock data path.");
}
resetFantasyActualData(actualMockDataPath);

const useProductionBuild = process.env.PLAYWRIGHT_USE_PRODUCTION_BUILD === "1";
const require = createRequire(import.meta.url);
const entrypoint = useProductionBuild
  ? resolve("build-artifact/server.js")
  : require.resolve("next/dist/bin/next");
const args = useProductionBuild
  ? [entrypoint]
  : [
      entrypoint,
      "dev",
      "--hostname",
      process.env.HOSTNAME ?? "127.0.0.1",
      "--port",
      process.env.PORT ?? "3100",
    ];
const serverEnvironment = { ...process.env };
for (const name of [
  "ACTUAL_SERVER_URL",
  "ACTUAL_PASSWORD",
  "ACTUAL_SESSION_TOKEN",
  "ACTUAL_BUDGET_ID",
  "ACTUAL_SYNC_ID",
  "ACTUAL_BUDGET_PASSWORD",
]) {
  delete serverEnvironment[name];
}
serverEnvironment.ACTUAL_MOCK_DATA_PATH = actualMockDataPath;
const server = spawn(process.execPath, args, {
  env: serverEnvironment,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.kill(signal));
}
server.on("exit", (code) => process.exit(code ?? 1));
