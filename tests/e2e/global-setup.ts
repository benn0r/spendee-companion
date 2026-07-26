import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export default function globalSetup() {
  const nextEnvPath = resolve("next-env.d.ts");
  const current = readFileSync(nextEnvPath, "utf8");
  const restored = current.replace(
    'import "./.next/dev/types/routes.d.ts";',
    'import "./.next/types/routes.d.ts";',
  );
  if (restored !== current) writeFileSync(nextEnvPath, restored);
}
