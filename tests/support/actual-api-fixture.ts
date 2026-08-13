import { writeFileSync } from "node:fs";
import type { ActualSnapshot } from "../../lib/actual-adapter";

export const actualIds = {
  moonAccount: "10000000-0000-4000-8000-000000000001",
  cloudAccount: "10000000-0000-4000-8000-000000000002",
  enchantedGroceries: "20000000-0000-4000-8000-000000000001",
  dragonRewards: "20000000-0000-4000-8000-000000000002",
  stardustSnacks: "20000000-0000-4000-8000-000000000003",
  questRewards: "20000000-0000-4000-8000-000000000004",
  portalTravel: "20000000-0000-4000-8000-000000000005",
  cometFood: "20000000-0000-4000-8000-000000000006",
  magicTag: "30000000-0000-4000-8000-000000000001",
  pantryTag: "30000000-0000-4000-8000-000000000002",
  questTag: "30000000-0000-4000-8000-000000000003",
  cosmicTag: "30000000-0000-4000-8000-000000000004",
  teamTag: "30000000-0000-4000-8000-000000000005",
  travelTag: "30000000-0000-4000-8000-000000000006",
  startingTransaction: "40000000-0000-4000-8000-000000000001",
  groceryTransaction: "40000000-0000-4000-8000-000000000002",
  rewardTransaction: "40000000-0000-4000-8000-000000000003",
  cloudTransaction: "40000000-0000-4000-8000-000000000004",
  grocerPayee: "50000000-0000-4000-8000-000000000001",
  guildPayee: "50000000-0000-4000-8000-000000000002",
  portalPayee: "50000000-0000-4000-8000-000000000003",
} as const;

function transaction(
  value: Partial<ActualSnapshot["transactions"][number]> &
    Pick<
      ActualSnapshot["transactions"][number],
      "id" | "accountId" | "amountCents" | "date"
    >,
): ActualSnapshot["transactions"][number] {
  return {
    categoryId: null,
    payeeId: null,
    notes: null,
    importedId: null,
    transferId: null,
    parentId: null,
    isParent: false,
    isChild: false,
    startingBalance: false,
    cleared: true,
    reconciled: false,
    sortOrder: 0,
    subtransactions: [],
    ...value,
  };
}

export function createActualApiFixture(populated = true): ActualSnapshot {
  const starting = transaction({
    id: actualIds.startingTransaction,
    accountId: actualIds.moonAccount,
    amountCents: 20_000,
    date: "2026-01-01",
    notes: "Starting Balance",
    startingBalance: true,
    reconciled: true,
  });
  const ledgerTransactions = populated
    ? [
        transaction({
          id: actualIds.groceryTransaction,
          accountId: actualIds.moonAccount,
          categoryId: actualIds.enchantedGroceries,
          payeeId: actualIds.grocerPayee,
          amountCents: -3_600,
          date: "2026-07-11",
          notes: "Moonberry basket #magic #pantry",
          importedId: "fantasy:grocery",
          sortOrder: 3,
        }),
        transaction({
          id: actualIds.rewardTransaction,
          accountId: actualIds.moonAccount,
          categoryId: actualIds.dragonRewards,
          payeeId: actualIds.guildPayee,
          amountCents: 9_000,
          date: "2026-07-12",
          notes: "Guild prize #quest",
          importedId: "fantasy:reward",
          sortOrder: 2,
        }),
        transaction({
          id: actualIds.cloudTransaction,
          accountId: actualIds.cloudAccount,
          categoryId: actualIds.portalTravel,
          payeeId: actualIds.portalPayee,
          amountCents: -4_500,
          date: "2026-07-13",
          notes: "Gate fare #travel",
          importedId: "fantasy:portal",
          sortOrder: 1,
        }),
      ]
    : [];
  return {
    currency: "CHF",
    accounts: [
      {
        id: actualIds.moonAccount,
        name: "Moon Purse",
        offBudget: false,
        closed: false,
        balanceCents: populated ? 25_400 : 20_000,
      },
      {
        id: actualIds.cloudAccount,
        name: "Cloud Vault",
        offBudget: true,
        closed: false,
        balanceCents: populated ? -4_500 : 0,
      },
    ],
    categories: [
      {
        id: actualIds.enchantedGroceries,
        name: "Enchanted Groceries",
        groupId: "60000000-0000-4000-8000-000000000001",
        isIncome: false,
        hidden: false,
      },
      {
        id: actualIds.dragonRewards,
        name: "Dragon Rewards",
        groupId: "60000000-0000-4000-8000-000000000002",
        isIncome: true,
        hidden: false,
      },
      {
        id: actualIds.stardustSnacks,
        name: "Stardust Snacks",
        groupId: "60000000-0000-4000-8000-000000000001",
        isIncome: false,
        hidden: false,
      },
      {
        id: actualIds.questRewards,
        name: "Quest Rewards",
        groupId: "60000000-0000-4000-8000-000000000002",
        isIncome: true,
        hidden: false,
      },
      {
        id: actualIds.portalTravel,
        name: "Portal Travel",
        groupId: "60000000-0000-4000-8000-000000000001",
        isIncome: false,
        hidden: false,
      },
      {
        id: actualIds.cometFood,
        name: "Comet Food",
        groupId: "60000000-0000-4000-8000-000000000001",
        isIncome: false,
        hidden: false,
      },
    ],
    tags: [
      [actualIds.magicTag, "magic", "#45b29d"],
      [actualIds.pantryTag, "pantry", "#efc94c"],
      [actualIds.questTag, "quest", "#e27a3f"],
      [actualIds.cosmicTag, "cosmic", "#df5a49"],
      [actualIds.teamTag, "team", "#5f91b8"],
      [actualIds.travelTag, "travel", "#e2a37f"],
    ].map(([id, name, color]) => ({
      id,
      name,
      color,
      description: null,
    })),
    payees: [
      {
        id: actualIds.grocerPayee,
        name: "Moonberry Market",
        transferAccountId: null,
      },
      {
        id: actualIds.guildPayee,
        name: "Guild Treasury",
        transferAccountId: null,
      },
      {
        id: actualIds.portalPayee,
        name: "Portal Authority",
        transferAccountId: null,
      },
    ],
    transactions: [starting, ...ledgerTransactions],
    budgetMonths: ["2026-07", "2026-06", "2026-05"],
    syncedAt: "2026-08-13T10:00:00.000Z",
  };
}

export function writeActualApiFixture(path: string, populated = true): void {
  writeFileSync(
    path,
    `${JSON.stringify(createActualApiFixture(populated), null, 2)}\n`,
    {
      encoding: "utf8",
      mode: 0o600,
    },
  );
}
