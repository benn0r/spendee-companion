import type {
  ExtractedDocumentTransaction,
  ValidationAppTransaction,
  ValidationDiff,
  ValidationMatchSuggestion,
} from "./validation-types";

export type StoredValidationMatch = {
  documentKey: string;
  appFingerprint: string;
};

function documentSignature(transaction: ExtractedDocumentTransaction) {
  return JSON.stringify([
    transaction.date,
    transaction.description,
    Math.round(transaction.amount * 100),
    transaction.currency.toUpperCase(),
  ]);
}

function keyedDocuments(transactions: ExtractedDocumentTransaction[]) {
  const occurrences = new Map<string, number>();
  return transactions.map((document) => {
    const signature = documentSignature(document);
    const occurrence = occurrences.get(signature) ?? 0;
    occurrences.set(signature, occurrence + 1);
    return { document, documentKey: `${signature}#${occurrence}` };
  });
}

function dayNumber(value: string) {
  return Date.parse(`${value.slice(0, 10)}T00:00:00.000Z`) / 86_400_000;
}

function words(value: string | null) {
  return new Set(
    (value ?? "")
      .toLocaleLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean),
  );
}

function descriptionDistance(document: string, app: string | null) {
  const left = words(document);
  const right = words(app);
  if (!left.size || !right.size) return 1;
  const shared = [...left].filter((word) => right.has(word)).length;
  return 1 - shared / new Set([...left, ...right]).size;
}

export function bestValidationCandidate(
  document: ExtractedDocumentTransaction,
  candidates: ValidationAppTransaction[],
) {
  return candidates
    .filter(
      (candidate) =>
        candidate.fingerprint &&
        candidate.currency.toUpperCase() === document.currency.toUpperCase() &&
        Math.sign(candidate.amount) === Math.sign(document.amount),
    )
    .map((candidate) => ({
      candidate,
      score:
        (Math.abs(candidate.amount - document.amount) /
          Math.max(1, Math.abs(document.amount))) *
          50 +
        Math.abs(dayNumber(candidate.date) - dayNumber(document.date)) * 2 +
        descriptionDistance(document.description, candidate.note) * 10,
    }))
    .sort(
      (left, right) =>
        left.score - right.score || left.candidate.id - right.candidate.id,
    )[0]?.candidate;
}

export function applyStoredValidationMatches(
  base: ValidationDiff,
  stored: StoredValidationMatch[],
): { diff: ValidationDiff; suggestions: ValidationMatchSuggestion[] } {
  const keyed = keyedDocuments(base.missingInApp);
  const storedByDocument = new Map(
    stored.map((match) => [match.documentKey, match.appFingerprint]),
  );
  const consumedApps = new Set<number>();
  const consumedDocuments = new Set<string>();
  const manualMatches: ValidationDiff["matching"] = [];

  for (const item of keyed) {
    const fingerprint = storedByDocument.get(item.documentKey);
    if (!fingerprint) continue;
    const app = base.missingInDocument.find(
      (candidate) =>
        !consumedApps.has(candidate.id) &&
        candidate.fingerprint === fingerprint,
    );
    if (!app) continue;
    consumedDocuments.add(item.documentKey);
    consumedApps.add(app.id);
    manualMatches.push({
      document: item.document,
      app,
      manual: true,
      documentKey: item.documentKey,
    });
  }

  const remainingDocuments = keyed.filter(
    (item) => !consumedDocuments.has(item.documentKey),
  );
  const remainingApps = base.missingInDocument.filter(
    (app) => !consumedApps.has(app.id),
  );
  const suggestions = remainingDocuments.flatMap((item) => {
    const app = bestValidationCandidate(item.document, remainingApps);
    return app
      ? [{ documentKey: item.documentKey, document: item.document, app }]
      : [];
  });

  return {
    diff: {
      matching: [...base.matching, ...manualMatches],
      missingInApp: remainingDocuments.map((item) => item.document),
      missingInDocument: remainingApps,
    },
    suggestions,
  };
}
