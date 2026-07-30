import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    rules: {
      "@next/next/no-img-element": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["tests/e2e/fixture.ts"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
  globalIgnores([
    ".next/**",
    "build-artifact/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);
