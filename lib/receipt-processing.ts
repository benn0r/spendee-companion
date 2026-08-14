import { getDatabase, type Db } from "./db";
import { getLedgerSnapshot } from "./ledger-service";
import { extractReceiptSuggestion } from "./openai-receipt";
import {
  completeReceipt,
  failReceipt,
  nextQueuedReceipt,
  readReceiptFile,
} from "./receipts";

let processing: Promise<void> | null = null;

function validateReferences(
  suggestion: Awaited<ReturnType<typeof extractReceiptSuggestion>>,
  snapshot: Awaited<ReturnType<typeof getLedgerSnapshot>>,
) {
  if (suggestion.currency !== snapshot.currency) {
    throw new Error(
      `Receipt currency ${suggestion.currency} does not match the Actual Budget currency.`,
    );
  }
  const categories = new Set(snapshot.categories.map(({ id }) => id));
  const categoryIds = [
    suggestion.category,
    ...suggestion.items.map(({ category }) => category),
    ...suggestion.splits.map(({ category }) => category),
  ];
  if (categoryIds.some((id) => !categories.has(id))) {
    throw new Error("The receipt suggestion contains an unknown category.");
  }
  const tags = new Set(snapshot.tags.map(({ id }) => id));
  if (
    [
      ...suggestion.tags,
      ...suggestion.splits.flatMap(({ tags: splitTags }) => splitTags),
    ].some((id) => !tags.has(id))
  ) {
    throw new Error("The receipt suggestion contains an unknown tag.");
  }
}

async function runQueue(db: Db) {
  for (;;) {
    const receipt = nextQueuedReceipt(db);
    if (!receipt) return;
    try {
      const [file, snapshot] = await Promise.all([
        readReceiptFile(receipt),
        getLedgerSnapshot({ forceSync: true }),
      ]);
      const suggestion = await extractReceiptSuggestion(
        file,
        receipt.filename,
        receipt.mimeType,
        snapshot,
      );
      validateReferences(suggestion, snapshot);
      completeReceipt(db, receipt.id, suggestion);
    } catch (error) {
      failReceipt(
        db,
        receipt.id,
        error instanceof Error ? error.message : "Receipt processing failed.",
      );
    }
  }
}

export function processReceiptQueue(db: Db = getDatabase()): Promise<void> {
  processing ??= runQueue(db).finally(() => {
    processing = null;
  });
  return processing;
}
