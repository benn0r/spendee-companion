const thresholds = {
  branches: 80,
  functions: 90,
  lines: 95,
};

function percentage(covered, total) {
  return total === 0 ? 100 : (covered / total) * 100;
}

function coverageTotals(files) {
  const totals = {
    coveredBranchCount: 0,
    coveredFunctionCount: 0,
    coveredLineCount: 0,
    totalBranchCount: 0,
    totalFunctionCount: 0,
    totalLineCount: 0,
  };
  for (const file of files) {
    for (const key of Object.keys(totals)) totals[key] += file[key] ?? 0;
  }
  return {
    branches: percentage(totals.coveredBranchCount, totals.totalBranchCount),
    functions: percentage(
      totals.coveredFunctionCount,
      totals.totalFunctionCount,
    ),
    lines: percentage(totals.coveredLineCount, totals.totalLineCount),
  };
}

function failureText(data) {
  const error = data.details?.error;
  return [
    `FAIL ${data.name ?? "unnamed test"}`,
    error?.stack ?? error?.message ?? "Test failed without an error message.",
  ].join("\n");
}

export default async function* coverageReporter(source) {
  let coverage;
  let passed = 0;
  let failed = 0;
  for await (const event of source) {
    if (event.type === "test:pass") passed += 1;
    if (event.type === "test:fail") {
      failed += 1;
      yield `${failureText(event.data)}\n`;
    }
    if (event.type === "test:coverage") coverage = event.data.summary;
  }

  yield `Tests: ${passed} passed, ${failed} failed.\n`;
  if (!coverage) {
    process.exitCode = 1;
    yield "ERROR Coverage data was not produced.\n";
    return;
  }

  const files = coverage.files.filter(
    (file) => typeof file.path === "string" && file.path.length > 0,
  );
  const unattributed = coverage.files.length - files.length;
  if (unattributed > 0) {
    yield `Ignored ${unattributed} unattributed V8 coverage record${unattributed === 1 ? "" : "s"}.\n`;
  }
  const totals = coverageTotals(files);
  yield `Coverage: lines ${totals.lines.toFixed(2)}%, functions ${totals.functions.toFixed(2)}%, branches ${totals.branches.toFixed(2)}%.\n`;

  for (const [name, required] of Object.entries(thresholds)) {
    if (totals[name] < required) {
      process.exitCode = 1;
      yield `ERROR ${name} coverage ${totals[name].toFixed(2)}% is below ${required}%.\n`;
    }
  }
}

export { coverageTotals };
