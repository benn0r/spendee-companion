import assert from "node:assert/strict";
import { test } from "node:test";
import {
  intlLocale,
  missingUiTranslations,
  normalizeLocale,
  translate,
  translateUiText,
} from "../lib/i18n";

test("provides locale normalization, formatting metadata, and message fallback", () => {
  assert.equal(normalizeLocale("en"), "en");
  assert.equal(normalizeLocale("de"), "de");
  assert.equal(normalizeLocale("pt-BR"), "pt-BR");
  assert.equal(normalizeLocale("fr"), "fr");
  assert.equal(normalizeLocale("it"), "it");
  assert.equal(normalizeLocale("unknown"), "en");
  assert.equal(intlLocale("de"), "de-CH");
  assert.equal(translate("de", "split.pdf.total"), "GESAMT");
  assert.equal(intlLocale("pt-BR"), "pt-BR");
  assert.equal(intlLocale("fr"), "fr-CH");
  assert.equal(intlLocale("it"), "it-CH");
  assert.equal(translate("pt-BR", "split.pdf.page", { page: 2 }), "Página 2");
  assert.equal(translate("fr", "split.pdf.finalAmount"), "MONTANT PAR PART");
  assert.equal(translate("it", "split.pdf.positions"), "Voci");
  for (const locale of ["de", "pt-BR", "fr", "it"] as const) {
    assert.deepEqual(
      missingUiTranslations(locale),
      [],
      `${locale} has missing static UI translations`,
    );
  }
  assert.equal(translateUiText("de", "Transactions"), "Transaktionen");
  assert.equal(translateUiText("de", "✓ Verified"), "✓ Verifiziert");
  assert.equal(translateUiText("de", "Wallets"), "Portemonnaies");
  assert.equal(translateUiText("de", "3 wallets"), "3 Portemonnaies");
  assert.equal(translateUiText("de", "2 categories"), "2 Kategorien");
  assert.equal(translateUiText("de", "2 transactions"), "2 Transaktionen");
  assert.equal(translateUiText("de", "1 custom position"), "1 eigene Position");
  assert.equal(translateUiText("de", "4 splits"), "4 Aufteilungen");
  assert.equal(translateUiText("de", " wallets"), " Portemonnaies");
  assert.equal(translateUiText("de", " categories"), " Kategorien");
  assert.equal(translateUiText("de", "Page "), "Seite ");
  assert.equal(translateUiText("de", " of "), " von ");
  assert.equal(
    translateUiText("de", "＋ Add position"),
    "＋ Position hinzufügen",
  );
  assert.equal(translateUiText("de", "Page 2 of 7"), "Seite 2 von 7");
  assert.equal(translateUiText("de", "23. July"), "23. Juli");
  assert.equal(
    translateUiText("de", "Dragon transaction journal"),
    "Dragon transaction journal",
  );
  for (const phrase of [
    "Search wallets…",
    "No matches",
    "Current month",
    "Saved",
    "Actions",
    "Spending by label",
    "Labels in the chart",
    "Search labels…",
    "Import an XLSX or CSV export to begin.",
    "No duplicates have been found.",
    "Expense",
    "Income",
    "New column",
    "Category settings saved.",
    "Could not load this wallet.",
    "Could not save split.",
    "Enter a title for the split.",
    "3 active transactions",
    "2 of 5 selected",
    "3 separated duplicates",
    "Delete selected (2)",
    "Split selected (2)",
    "matches #42",
    "Position 1 description",
    "Remove position 1",
    "Selected categories: Dragon Food, Moon Travel",
    "Starting amount in CHF",
    "Select transaction 9",
    "Transactions through 2026-07-25 are marked as verified.",
    "0 records",
    "25 Jul 2026, 10:30",
  ])
    assert.notEqual(
      translateUiText("de", phrase),
      phrase,
      `missing German UI translation: ${phrase}`,
    );
  assert.equal(translateUiText("de", "Labels"), "Labels");
  const localeCases = [
    ["pt-BR", "Transactions", "Transações"],
    ["pt-BR", "7 wallets", "7 carteiras"],
    ["pt-BR", "Page 2 of 7", "Página 2 de 7"],
    ["pt-BR", "23. July", "23 de julho"],
    ["fr", "Transactions", "Transactions"],
    ["fr", "7 wallets", "7 portefeuilles"],
    ["fr", "Page 2 of 7", "Page 2 sur 7"],
    ["fr", "23. July", "23 juillet"],
    ["it", "Transactions", "Transazioni"],
    ["it", "7 wallets", "7 portafogli"],
    ["it", "Page 2 of 7", "Pagina 2 di 7"],
    ["it", "23. July", "23 luglio"],
  ] as const;
  for (const [locale, source, expected] of localeCases) {
    assert.equal(translateUiText(locale, source), expected);
  }
  const dynamicPhrases = [
    "2 categories",
    "3 selected transactions",
    "· 1 custom position",
    "4 active transactions",
    "2 columns",
    "2 of 5 selected",
    "2 separated duplicates",
    "1 duplicate deleted.",
    "Delete selected (2)",
    "Split selected (2)",
    "matches #42",
    "Position 1 description",
    "Position 1 amount",
    "Remove position 1",
    "Remove Dragon Food",
    "Selected categories: Dragon Food, Moon Travel",
    "Starting amount in CHF",
    "Select duplicate 3",
    "Select transaction 9",
    "Category icon 4",
    "CHF spending pie chart",
    'Wallet "Moon Purse" appears in more than one full-import file.',
    'Delete "Alpine weekend"? This cannot be undone.',
    "Delete 2 selected duplicates? This cannot be undone.",
    "Transactions through 2026-07-25 are marked as verified.",
    "Transaction verification date cleared.",
    "3 files processed · 8 imported · 2 duplicates separated",
    "1 file processed · 1 imported · 0 duplicates separated · 2 previous transactions replaced",
    "Page 2 of 7",
    "26–50 of 140",
  ];
  for (const locale of ["pt-BR", "fr", "it"] as const) {
    for (const phrase of dynamicPhrases) {
      assert.notEqual(
        translateUiText(locale, phrase),
        phrase,
        `missing ${locale} dynamic translation: ${phrase}`,
      );
    }
  }
  assert.equal(intlLocale("en"), "en-CH");
  assert.equal(translate("en", "split.pdf.page", { page: 3 }), "Page 3");
  assert.equal(translate("en", "future.message"), "future.message");
});
