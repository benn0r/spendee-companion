import { rmSync } from "node:fs";

const databasePath = "/tmp/spendee-playwright-fantasy.db";

export default function globalSetup() {
  for (const suffix of ["", "-shm", "-wal"]) rmSync(`${databasePath}${suffix}`, { force: true });
}
