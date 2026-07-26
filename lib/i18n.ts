import { dePdf, deUi } from "./locales/de";
import { frPdf, frUi } from "./locales/fr";
import { itPdf, itUi } from "./locales/it";
import { ptBrPdf, ptBrUi } from "./locales/pt-BR";
import { translateDynamicUi } from "./i18n-dynamic";

export const supportedLocales = [
  { code: "en", label: "English", intlLocale: "en-CH" },
  { code: "de", label: "Deutsch", intlLocale: "de-CH" },
  { code: "pt-BR", label: "Português (Brasil)", intlLocale: "pt-BR" },
  { code: "fr", label: "Français", intlLocale: "fr-CH" },
  { code: "it", label: "Italiano", intlLocale: "it-CH" },
] as const;

export type AppLocale = typeof supportedLocales[number]["code"];

const messages: Record<AppLocale, Record<string, string>> = {
  en: {
    "app.name": "Spendee companion",
    "split.language": "Language",
    "split.pdf.created": "Created {date}",
    "split.pdf.total": "TOTAL",
    "split.pdf.count": "SPLIT HOW MANY TIMES",
    "split.pdf.finalAmount": "FINAL SPLIT AMOUNT",
    "split.pdf.positions": "Positions",
    "split.pdf.date": "DATE",
    "split.pdf.description": "DESCRIPTION",
    "split.pdf.amount": "AMOUNT",
    "split.pdf.customPosition": "Custom position",
    "split.pdf.page": "Page {page}",
  },
  de: dePdf,
  "pt-BR": ptBrPdf,
  fr: frPdf,
  it: itPdf,
};

const uiCatalogs: Record<AppLocale, Record<string, string>> = {
  en: {},
  de: deUi,
  "pt-BR": ptBrUi,
  fr: frUi,
  it: itUi,
};

const longMonths: Record<Exclude<AppLocale, "en">, Record<string, string>> = {
  de: { January: "Januar", February: "Februar", March: "März", April: "April", May: "Mai", June: "Juni", July: "Juli", August: "August", September: "September", October: "Oktober", November: "November", December: "Dezember" },
  "pt-BR": { January: "janeiro", February: "fevereiro", March: "março", April: "abril", May: "maio", June: "junho", July: "julho", August: "agosto", September: "setembro", October: "outubro", November: "novembro", December: "dezembro" },
  fr: { January: "janvier", February: "février", March: "mars", April: "avril", May: "mai", June: "juin", July: "juillet", August: "août", September: "septembre", October: "octobre", November: "novembre", December: "décembre" },
  it: { January: "gennaio", February: "febbraio", March: "marzo", April: "aprile", May: "maggio", June: "giugno", July: "luglio", August: "agosto", September: "settembre", October: "ottobre", November: "novembre", December: "dicembre" },
};

function translateEnglishDate(locale: Exclude<AppLocale, "en">, text: string) {
  const months = longMonths[locale];
  let match = text.match(/^(?:(\d{1,2})\. )?(January|February|March|April|May|June|July|August|September|October|November|December)( \d{4})?$/);
  if (match) {
    const day = match[1];
    const year = match[3]?.trim();
    if (locale === "de") return `${day ? `${day}. ` : ""}${months[match[2]]}${year ? ` ${year}` : ""}`;
    if (locale === "pt-BR") return `${day ? `${day} de ` : ""}${months[match[2]]}${year ? ` de ${year}` : ""}`;
    return `${day ? `${day} ` : ""}${months[match[2]]}${year ? ` ${year}` : ""}`;
  }
  const shortToLong: Record<string, string> = { Jan: "January", Feb: "February", Mar: "March", Apr: "April", May: "May", Jun: "June", Jul: "July", Aug: "August", Sep: "September", Oct: "October", Nov: "November", Dec: "December" };
  match = text.match(/^(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4})(.*)$/);
  if (!match) return text;
  const month = months[shortToLong[match[2]]];
  if (locale === "de") return `${match[1]}. ${month} ${match[3]}${match[4]}`;
  if (locale === "pt-BR") return `${match[1]} de ${month} de ${match[3]}${match[4]}`;
  return `${match[1]} ${month} ${match[3]}${match[4]}`;
}

export function translateUiText(locale: AppLocale, text: string) {
  if (locale === "en") return text;
  const leading = text.match(/^\s*/)?.[0] ?? "";
  const trailing = text.match(/\s*$/)?.[0] ?? "";
  const core = text.trim();
  let translated = uiCatalogs[locale][core];
  if (!translated) {
    translated = locale === "de" ? core
      .replace(/^(\d+) transactions?$/, "$1 Transaktionen")
      .replace(/^(\d+) wallet$/, "$1 Portemonnaie")
      .replace(/^(\d+) wallets$/, "$1 Portemonnaies")
      .replace(/^(\d+) categories?$/, "$1 Kategorien")
      .replace(/^(\d+) duplicates?$/, "$1 Duplikate")
      .replace(/^(\d+) splits?$/, "$1 Aufteilungen")
      .replace(/^(\d+) selected transactions?$/, "$1 Transaktionen ausgewählt")
      .replace(/^(· )?(\d+) custom position$/, "$1$2 eigene Position")
      .replace(/^(· )?(\d+) custom positions$/, "$1$2 eigene Positionen")
      .replace(/^(\d+) active transaction$/, "$1 aktive Transaktion")
      .replace(/^(\d+) active transactions$/, "$1 aktive Transaktionen")
      .replace(/^(\d+) columns?$/, "$1 Spalten")
      .replace(/^(\d+) of (\d+) selected$/, "$1 von $2 ausgewählt")
      .replace(/^(\d+) separated duplicate$/, "$1 getrenntes Duplikat")
      .replace(/^(\d+) separated duplicates$/, "$1 getrennte Duplikate")
      .replace(/^(\d+) duplicates? deleted\.$/, "$1 Duplikate gelöscht.")
      .replace(/^Delete selected \((\d+)\)$/, "Auswahl löschen ($1)")
      .replace(/^Split selected \((\d+)\)$/, "Auswahl aufteilen ($1)")
      .replace(/^matches #(\d+)$/, "entspricht #$1")
      .replace(/^Position (\d+) description$/, "Beschreibung der Position $1")
      .replace(/^Position (\d+) amount$/, "Betrag der Position $1")
      .replace(/^Remove position (\d+)$/, "Position $1 entfernen")
      .replace(/^Remove (.+)$/, "$1 entfernen")
      .replace(/^Selected categories: (.+)$/, "Ausgewählte Kategorien: $1")
      .replace(/^Starting amount in (.+)$/, "Startbetrag in $1")
      .replace(/^Select duplicate (\d+)$/, "Duplikat $1 auswählen")
      .replace(/^Select transaction (\d+)$/, "Transaktion $1 auswählen")
      .replace(/^Category icon (\d+)$/, "Kategoriesymbol $1")
      .replace(/^(.+) spending pie chart$/, "Kreisdiagramm der Ausgaben in $1")
      .replace(/^Wallet \"(.+)\" appears in more than one full-import file\.$/, "Das Portemonnaie „$1“ kommt in mehreren Dateien für den vollständigen Import vor.")
      .replace(/^Delete \"(.+)\"\? This cannot be undone\.$/, "„$1“ löschen? Dies kann nicht rückgängig gemacht werden.")
      .replace(/^Delete (\d+) selected duplicate\? This cannot be undone\.$/, "$1 ausgewähltes Duplikat löschen? Dies kann nicht rückgängig gemacht werden.")
      .replace(/^Delete (\d+) selected duplicates\? This cannot be undone\.$/, "$1 ausgewählte Duplikate löschen? Dies kann nicht rückgängig gemacht werden.")
      .replace(/^Transactions through (.+) are marked as verified\.$/, "Transaktionen bis $1 sind als verifiziert markiert.")
      .replace(/^Transaction verification date cleared\.$/, "Verifizierungsdatum der Transaktionen gelöscht.")
      .replace(/^(\d+) files? processed · (\d+) imported · (\d+) duplicates? separated(?: · (\d+) previous transactions? replaced)?$/, (_match, files, imported, duplicates, replaced) => `${files} Dateien verarbeitet · ${imported} importiert · ${duplicates} Duplikate getrennt${replaced ? ` · ${replaced} vorherige Transaktionen ersetzt` : ""}`)
      .replace(/^Page (\d+) of (\d+)$/, "Seite $1 von $2")
      .replace(/^(\d+)[–-](\d+) of (\d+)$/, "$1–$2 von $3")
      : translateDynamicUi(locale, core);
    if (translated === core) {
      translated = translateEnglishDate(locale, core);
    }
  }
  return `${leading}${translated}${trailing}`;
}

export function missingUiTranslations(locale: AppLocale) {
  if (locale === "en") return [];
  return Object.keys(deUi).filter((key) => !uiCatalogs[locale][key]);
}

export function normalizeLocale(value: unknown): AppLocale {
  return supportedLocales.some((locale) => locale.code === value) ? value as AppLocale : "en";
}

export function intlLocale(locale: AppLocale) {
  return supportedLocales.find((item) => item.code === locale)?.intlLocale ?? "en-CH";
}

export function translate(locale: AppLocale, key: string, values: Record<string, string | number> = {}) {
  const template = messages[locale]?.[key] ?? messages.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : match
  );
}
