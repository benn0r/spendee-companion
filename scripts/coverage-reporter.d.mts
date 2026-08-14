export type CoverageFile = {
  coveredBranchCount: number;
  coveredFunctionCount: number;
  coveredLineCount: number;
  totalBranchCount: number;
  totalFunctionCount: number;
  totalLineCount: number;
};

export function coverageTotals(files: CoverageFile[]): {
  branches: number;
  functions: number;
  lines: number;
};
