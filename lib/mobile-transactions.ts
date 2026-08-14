import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  getActualAdapter,
  type ActualAdapter,
  type ActualCreateTransaction,
} from "./actual-adapter";
import {
  appendActualTags,
  getLedgerSnapshot,
  type LedgerSnapshot,
} from "./ledger-service";

const splitSchema = z.object({
  category: z.string().min(1),
  amount: z
    .number()
    .finite()
    .refine((amount) => amount !== 0),
  notes: z.string().max(500).optional(),
  tags: z.array(z.string().min(1)).max(20).optional(),
});

export const mobileTransactionSchema = z
  .object({
    category: z.string().min(1).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    amount: z
      .number()
      .finite()
      .refine((amount) => amount !== 0),
    account: z.string().min(1),
    payee: z.string().max(200).optional(),
    notes: z.string().max(500).optional(),
    tags: z.array(z.string().min(1)).max(20).optional(),
    splits: z.array(splitSchema).min(2).optional(),
  })
  .superRefine((value, context) => {
    if (!value.category && !value.splits) {
      context.addIssue({ code: "custom", message: "category is required" });
    }
    if (
      value.splits &&
      Math.round(
        value.splits.reduce((sum, split) => sum + split.amount, 0) * 100,
      ) !== Math.round(value.amount * 100)
    ) {
      context.addIssue({
        code: "custom",
        path: ["splits"],
        message: "split amounts must equal the transaction amount",
      });
    }
  });

export type MobileTransactionInput = z.infer<typeof mobileTransactionSchema>;

function resolveTransaction(
  snapshot: LedgerSnapshot,
  input: MobileTransactionInput,
  importedId: string,
): ActualCreateTransaction {
  const account = snapshot.accounts.find(({ id }) => id === input.account);
  if (!account) throw new Error("Account was not found in Actual Budget.");
  const categoryIds = new Set(snapshot.categories.map(({ id }) => id));
  const requestedCategories = [
    input.category,
    ...(input.splits ?? []).map(({ category }) => category),
  ].filter((id): id is string => Boolean(id));
  if (requestedCategories.some((id) => !categoryIds.has(id))) {
    throw new Error("Category was not found in Actual Budget.");
  }
  const tags = new Map(snapshot.tags.map(({ id, name }) => [id, name]));
  const requestedTags = [
    ...(input.tags ?? []),
    ...(input.splits ?? []).flatMap((split) => split.tags ?? []),
  ];
  if (requestedTags.some((id) => !tags.has(id))) {
    throw new Error("Tag was not found in Actual Budget.");
  }
  const tagNames = (ids: string[] | undefined) =>
    [...new Set(ids ?? [])].map((id) => tags.get(id)!);
  return {
    accountId: input.account,
    categoryId: input.category,
    date: input.date,
    amountCents: Math.round(input.amount * 100),
    payeeName: input.payee?.trim() || undefined,
    notes: appendActualTags(input.notes ?? null, tagNames(input.tags)),
    importedId,
    cleared: false,
    subtransactions: input.splits?.map((split) => ({
      categoryId: split.category,
      amountCents: Math.round(split.amount * 100),
      notes: appendActualTags(split.notes ?? null, tagNames(split.tags)),
    })),
  };
}

export async function createMobileTransaction(
  input: MobileTransactionInput,
  options?: {
    importedId?: string;
    adapter?: ActualAdapter;
    snapshot?: LedgerSnapshot;
  },
): Promise<string> {
  const adapter = options?.adapter ?? getActualAdapter();
  if (!adapter.createTransaction) {
    throw new Error("Actual transaction creation is unavailable.");
  }
  const snapshot =
    options?.snapshot ??
    (await getLedgerSnapshot({ adapter, forceSync: true }));
  const transaction = resolveTransaction(
    snapshot,
    input,
    options?.importedId ?? `spendee-api:${randomUUID()}`,
  );
  const id = await adapter.createTransaction(transaction);
  adapter.invalidateSnapshot();
  return id;
}

export async function deleteMobileTransaction(
  transactionId: string,
  adapter: ActualAdapter = getActualAdapter(),
): Promise<void> {
  if (!adapter.deleteTransaction) {
    throw new Error("Actual transaction deletion is unavailable.");
  }
  await adapter.deleteTransaction(transactionId);
  adapter.invalidateSnapshot();
}
