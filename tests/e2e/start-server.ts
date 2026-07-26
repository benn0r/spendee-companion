import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const databasePath = process.env.SQLITE_PATH;
if (!databasePath?.startsWith("/tmp/spendee-playwright-") || !databasePath.endsWith(".db")) {
  throw new Error("Refusing to reset an unexpected Playwright database path.");
}
for (const suffix of ["", "-shm", "-wal"]) rmSync(`${databasePath}${suffix}`, { force: true });

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
const server = spawn(process.execPath, args, {
  env: process.env,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.kill(signal));
}
server.on("exit", (code) => process.exit(code ?? 1));
