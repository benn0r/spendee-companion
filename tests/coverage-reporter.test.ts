import assert from "node:assert/strict";
import { test } from "node:test";
import { coverageTotals } from "../scripts/coverage-reporter.mjs";

test("coverage totals aggregate valid V8 source records", () => {
  assert.deepEqual(
    coverageTotals([
      {
        coveredBranchCount: 8,
        coveredFunctionCount: 9,
        coveredLineCount: 95,
        totalBranchCount: 10,
        totalFunctionCount: 10,
        totalLineCount: 100,
      },
      {
        coveredBranchCount: 0,
        coveredFunctionCount: 0,
        coveredLineCount: 0,
        totalBranchCount: 0,
        totalFunctionCount: 0,
        totalLineCount: 0,
      },
    ]),
    { branches: 80, functions: 90, lines: 95 },
  );
});
