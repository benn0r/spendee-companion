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
  de: {
    "app.name": "Spendee Companion",
    "split.language": "Sprache",
    "split.pdf.created": "Erstellt am {date}",
    "split.pdf.total": "GESAMT",
    "split.pdf.count": "ANZAHL AUFTEILUNGEN",
    "split.pdf.finalAmount": "ANTEILSBETRAG",
    "split.pdf.positions": "Positionen",
    "split.pdf.date": "DATUM",
    "split.pdf.description": "BESCHREIBUNG",
    "split.pdf.amount": "BETRAG",
    "split.pdf.customPosition": "Eigene Position",
    "split.pdf.page": "Seite {page}",
  },
  "pt-BR": ptBrPdf,
  fr: frPdf,
  it: itPdf,
};

const germanUi: Record<string, string> = {
  "Spendee companion": "Spendee Companion",
  "Transaction archive": "Transaktionsarchiv",
  "Transactions": "Transaktionen",
  "Duplicates": "Duplikate",
  "Splits": "Aufteilungen",
  "Monthy": "Monate",
  "TRANSACTION ARCHIVE": "TRANSAKTIONSARCHIV",
  "Import and review your Spendee exports in one place.": "Spendee-Exporte an einem Ort importieren und prüfen.",
  "Review and remove repeated import records.": "Doppelte Importdatensätze prüfen und entfernen.",
  "Import files": "Dateien importieren",
  "Importing…": "Wird importiert…",
  "Wallets": "Portemonnaies",
  "Balances and transaction totals": "Salden und Transaktionssummen",
  "Categories": "Kategorien",
  "Approval required": "Freigabe erforderlich",
  "Keep current": "Aktuellen Wert behalten",
  "Approve selected": "Auswahl freigeben",
  "Transaction history": "Transaktionsverlauf",
  "Duplicate records": "Doppelte Datensätze",
  "All imported records, newest first": "Alle importierten Datensätze, neueste zuerst",
  "Verified until": "Verifiziert bis",
  "Save": "Speichern",
  "Saving…": "Wird gespeichert…",
  "Split transactions": "Transaktionen aufteilen",
  "Split selected": "Auswahl aufteilen",
  "Cancel": "Abbrechen",
  "Delete selected": "Auswahl löschen",
  "Deleting…": "Wird gelöscht…",
  "Date": "Datum",
  "Wallet": "Portemonnaie",
  "Type": "Typ",
  "Category": "Kategorie",
  "Note & labels": "Notiz & Labels",
  "Author": "Autor",
  "Select": "Auswählen",
  "Loading transactions…": "Transaktionen werden geladen…",
  "Apply filters": "Filter anwenden",
  "Clear": "Zurücksetzen",
  "From": "Von",
  "To": "Bis",
  "Tags": "Tags",
  "Any amount": "Beliebiger Betrag",
  "Greater than": "Grösser als",
  "Less than": "Kleiner als",
  "Equal to": "Gleich",
  "Rows": "Zeilen",
  "Verified": "Verifiziert",
  "✓ Verified": "✓ Verifiziert",
  "CATEGORY": "KATEGORIE",
  "Category settings": "Kategorieeinstellungen",
  "Appearance": "Darstellung",
  "Choose an official Spendee icon and category color.": "Offizielles Spendee-Symbol und Kategoriefarbe wählen.",
  "Spending by tag": "Ausgaben nach Tag",
  "Include expenses and income to show the net amount for each tag.": "Ausgaben und Einnahmen zum Nettobetrag jedes Tags verrechnen.",
  "Tags in the chart": "Tags im Diagramm",
  "Select all": "Alle auswählen",
  "Save settings": "Einstellungen speichern",
  "Net expenses and income; selected tags are shown separately and everything else is Other": "Netto aus Ausgaben und Einnahmen; ausgewählte Tags werden separat dargestellt, alles andere unter Sonstiges",
  "Period": "Zeitraum",
  "All": "Alle",
  "Other": "Sonstiges",
  "Category transactions": "Kategorietransaktionen",
  "All matching wallets, newest first": "Alle passenden Portemonnaies, neueste zuerst",
  "Wallet activity": "Portemonnaie-Aktivität",
  "Active transactions, newest first": "Aktive Transaktionen, neueste zuerst",
  "Starting amount": "Startbetrag",
  "Current wallet amount": "Aktueller Saldo",
  "SPENDING OVER TIME": "AUSGABEN IM ZEITVERLAUF",
  "Compare net category totals by month and combine categories into custom columns.": "Netto-Kategoriesummen pro Monat vergleichen und Kategorien in eigenen Spalten zusammenfassen.",
  "Table columns": "Tabellenspalten",
  "Monthly totals": "Monatssummen",
  "Expenses plus income across all active transactions and wallets": "Ausgaben und Einnahmen aller aktiven Transaktionen und Portemonnaies",
  "Column name": "Spaltenname",
  "Monthly budget": "Monatsbudget",
  "No budget": "Kein Budget",
  "Add column": "Spalte hinzufügen",
  "Save columns": "Spalten speichern",
  "SAVED CALCULATIONS": "GESPEICHERTE BERECHNUNGEN",
  "Past splits": "Bisherige Aufteilungen",
  "Review, download, or remove saved transaction splits.": "Gespeicherte Aufteilungen prüfen, herunterladen oder löschen.",
  "Split history": "Aufteilungsverlauf",
  "Newest first": "Neueste zuerst",
  "Loading splits…": "Aufteilungen werden geladen…",
  "No saved splits yet.": "Noch keine Aufteilungen gespeichert.",
  "Select transactions to create one": "Transaktionen auswählen, um eine zu erstellen",
  "Total": "Gesamt",
  "Split amount": "Anteilsbetrag",
  "Download PDF": "PDF herunterladen",
  "Delete": "Löschen",
  "NEW SPLIT": "NEUE AUFTEILUNG",
  "Review selected transactions": "Ausgewählte Transaktionen prüfen",
  "Close split": "Aufteilung schliessen",
  "Select transactions in one currency only.": "Nur Transaktionen in derselben Währung auswählen.",
  "Split title": "Titel der Aufteilung",
  "e.g. Weekend cabin": "z. B. Wochenendhütte",
  "Language": "Sprache",
  "The saved PDF uses this language and its date and number formats.": "Das gespeicherte PDF verwendet diese Sprache sowie deren Datums- und Zahlenformate.",
  "Custom positions": "Eigene Positionen",
  "Add positive or negative adjustments.": "Positive oder negative Anpassungen hinzufügen.",
  "Add position": "Position hinzufügen",
  "+ Add position": "+ Position hinzufügen",
  "＋ Add position": "＋ Position hinzufügen",
  "Description": "Beschreibung",
  "Split how many times?": "Wie oft aufteilen?",
  "Total amount": "Gesamtbetrag",
  "Final split amount": "Anteilsbetrag",
  "Save split": "Aufteilung speichern",
  "IMPORT TRANSACTIONS": "TRANSAKTIONEN IMPORTIEREN",
  "Upload Spendee exports": "Spendee-Exporte hochladen",
  "Drop XLSX or CSV files here": "XLSX- oder CSV-Dateien hier ablegen",
  "Choose files": "Dateien auswählen",
  "Full import": "Vollständiger Import",
  "Close": "Schliessen",
  "Today": "Heute",
  "Yesterday": "Gestern",
  "Loading report…": "Bericht wird geladen…",
  "Loading…": "Wird geladen…",
  "Loading category…": "Kategorie wird geladen…",
  "Loading wallet…": "Portemonnaie wird geladen…",
  "Return to transactions": "Zurück zu den Transaktionen",
  "Return to all wallets": "Zurück zu allen Portemonnaies",
  "No transactions in this category.": "Keine Transaktionen in dieser Kategorie.",
  "Income offsets expenses within each tag. Pie sizes use the magnitude of each resulting net amount.": "Einnahmen werden innerhalb jedes Tags mit Ausgaben verrechnet. Die Segmentgrösse entspricht dem Betrag des resultierenden Nettowerts.",
  "Choose export files": "Exportdateien auswählen",
  "Upload one or more XLSX or CSV files.": "Eine oder mehrere XLSX- oder CSV-Dateien hochladen.",
  "Drop files here": "Dateien hier ablegen",
  "XLSX and CSV exports are supported.": "XLSX- und CSV-Exporte werden unterstützt.",
  "Batch uploads may contain multiple wallets.": "Ein Batch-Upload darf mehrere Portemonnaies enthalten.",
  "Each file must contain exactly one wallet. Changes and missing transactions require approval.": "Jede Datei muss genau ein Portemonnaie enthalten. Änderungen und fehlende Transaktionen müssen freigegeben werden.",
  "Net income and spending for": "Nettoeinnahmen und -ausgaben für",
  "Remove": "Entfernen",
  "Restore this transaction to the active ledger": "Diese Transaktion im aktiven Bestand wiederherstellen",
  "Current amount": "Aktueller Betrag",
  "WALLET": "PORTEMONNAIE",
  "MONTHY": "MONATE",
  "Month": "Monat",
  "Selected categories": "Ausgewählte Kategorien",
  "Name each column, set its budget, and select the categories it includes.": "Jede Spalte benennen, ihr Budget festlegen und die enthaltenen Kategorien auswählen.",
  "No categorized transactions yet.": "Noch keine kategorisierten Transaktionen.",
  "Close settings": "Einstellungen schliessen",
  "Close import": "Import schliessen",
  "Category color": "Kategoriefarbe",
  "No category icon": "Kein Kategoriesymbol",
  "Primary navigation": "Hauptnavigation",
  "Monthy settings": "Monatseinstellungen",
  "Rows per page": "Zeilen pro Seite",
  "Select all duplicates on this page": "Alle Duplikate auf dieser Seite auswählen",
  "Transaction filters": "Transaktionsfilter",
  "Amount comparison": "Betragsvergleich",
  "Search wallets": "Portemonnaies durchsuchen",
  "Search categories": "Kategorien durchsuchen",
  "Search tags": "Tags durchsuchen",
  "Search wallets…": "Portemonnaies durchsuchen…",
  "Search categories…": "Kategorien durchsuchen…",
  "Search tags…": "Tags durchsuchen…",
  "No matches": "Keine Treffer",
  "No options": "Keine Optionen",
  "Current month": "Aktueller Monat",
  "current month": "aktueller Monat",
  "Net category total ·": "Netto-Kategoriesumme ·",
  "Saved": "Gespeichert",
  "Actions": "Aktionen",
  "Missing": "Fehlt",
  "Restore": "Wiederherstellen",
  "Changed": "Geändert",
  "No category": "Keine Kategorie",
  "Import an XLSX or CSV export to begin.": "Zum Start einen XLSX- oder CSV-Export importieren.",
  "No duplicates have been found.": "Keine Duplikate gefunden.",
  "Expense": "Ausgabe",
  "Income": "Einnahme",
  "Transfer": "Übertrag",
  "New column": "Neue Spalte",
  "Column": "Spalte",
  "Columns": "Spalten",
  "Category settings saved.": "Kategorieeinstellungen gespeichert.",
  "Monthly report columns saved.": "Spalten des Monatsberichts gespeichert.",
  "Could not load this wallet.": "Dieses Portemonnaie konnte nicht geladen werden.",
  "Could not load this category.": "Diese Kategorie konnte nicht geladen werden.",
  "Could not save the starting amount.": "Der Startbetrag konnte nicht gespeichert werden.",
  "Could not save tag selection.": "Die Tag-Auswahl konnte nicht gespeichert werden.",
  "Could not save the columns.": "Die Spalten konnten nicht gespeichert werden.",
  "Could not save report columns.": "Die Berichtsspalten konnten nicht gespeichert werden.",
  "Could not save the validation date.": "Das Verifizierungsdatum konnte nicht gespeichert werden.",
  "Could not save split.": "Die Aufteilung konnte nicht gespeichert werden.",
  "Could not delete split.": "Die Aufteilung konnte nicht gelöscht werden.",
  "Could not delete duplicates.": "Die Duplikate konnten nicht gelöscht werden.",
  "Enter a title for the split.": "Einen Titel für die Aufteilung eingeben.",
  "Selected transactions must use one currency.": "Die ausgewählten Transaktionen müssen dieselbe Währung verwenden.",
  "Complete every custom position or remove it.": "Alle eigenen Positionen vervollständigen oder entfernen.",
  "Enter a valid starting amount.": "Einen gültigen Startbetrag eingeben.",
  "Import failed.": "Import fehlgeschlagen.",
  "Review failed.": "Prüfung fehlgeschlagen.",
  "Split not found.": "Aufteilung nicht gefunden.",
  "Wallet not found.": "Portemonnaie nicht gefunden.",
  "Category not found.": "Kategorie nicht gefunden.",
  "Select a valid month.": "Einen gültigen Monat auswählen.",
  "Choose at least one XLSX or CSV file.": "Mindestens eine XLSX- oder CSV-Datei auswählen.",
  "Full import files must contain exactly one wallet.": "Dateien für den vollständigen Import müssen genau ein Portemonnaie enthalten.",
  "A header-only file cannot be used for a full import.": "Eine Datei nur mit Kopfzeile kann nicht vollständig importiert werden.",
  "selected": "ausgewählt",
  "matching": "passende",
  "across": "in",
  "active": "aktive",
  "from the active ledger": "aus dem aktiven Bestand entfernen",
  "Amount": "Betrag",
  "0 records": "0 Datensätze",
  "records": "Datensätze",
  "position": "Position",
  "positions": "Positionen",
  "wallet": "Portemonnaie",
  "wallets": "Portemonnaies",
  "category": "Kategorie",
  "categories": "Kategorien",
  "transaction": "Transaktion",
  "transactions": "Transaktionen",
  "split": "Aufteilung",
  "splits": "Aufteilungen",
  "Page": "Seite",
  "of": "von",
  "Close category settings": "Kategorieeinstellungen schliessen",
  "Spendee companion · build": "Spendee Companion · Version",
  "from transactions": "aus Transaktionen",
  "A header-only file cannot be used for a full import because its wallet is unknown.": "Eine Datei nur mit Kopfzeile kann nicht vollständig importiert werden, weil ihr Portemonnaie unbekannt ist.",
  "A split title is required.": "Ein Titel für die Aufteilung ist erforderlich.",
  "Add at least one column.": "Mindestens eine Spalte hinzufügen.",
  "All selected transactions must use the same currency.": "Alle ausgewählten Transaktionen müssen dieselbe Währung verwenden.",
  "Budgets must be positive numbers or left empty.": "Budgets müssen positive Zahlen sein oder leer bleiben.",
  "Currency and a valid starting amount are required.": "Währung und ein gültiger Startbetrag sind erforderlich.",
  "Custom positions are invalid.": "Die eigenen Positionen sind ungültig.",
  "Every column needs a name.": "Jede Spalte benötigt einen Namen.",
  "Every column needs at least one category.": "Jede Spalte benötigt mindestens eine Kategorie.",
  "Every custom position needs a description and valid amount.": "Jede eigene Position benötigt eine Beschreibung und einen gültigen Betrag.",
  "Full import files must contain transactions from exactly one wallet.": "Dateien für den vollständigen Import müssen Transaktionen aus genau einem Portemonnaie enthalten.",
  "One or more selected transactions no longer exist.": "Eine oder mehrere ausgewählte Transaktionen sind nicht mehr vorhanden.",
  "Only .xlsx and .csv files are supported.": "Es werden nur .xlsx- und .csv-Dateien unterstützt.",
  "Select at least one duplicate.": "Mindestens ein Duplikat auswählen.",
  "Select at least one transaction.": "Mindestens eine Transaktion auswählen.",
  "Select review items and a valid decision.": "Prüfeinträge und eine gültige Entscheidung auswählen.",
  "Split count must be a positive whole number.": "Die Anzahl der Aufteilungen muss eine positive ganze Zahl sein.",
  "Split title must be 120 characters or fewer.": "Der Titel der Aufteilung darf höchstens 120 Zeichen lang sein.",
  "The file does not contain a readable transaction table.": "Die Datei enthält keine lesbare Transaktionstabelle.",
  "Valid until must be a date.": "Das Verifizierungsdatum muss ein Datum sein.",
  "Valid until must be a valid date.": "Das Verifizierungsdatum muss gültig sein.",
  "Wallet currency not found.": "Die Währung des Portemonnaies wurde nicht gefunden.",
  "Select a valid category color.": "Eine gültige Kategoriefarbe auswählen.",
  "Select a valid category icon.": "Ein gültiges Kategoriesymbol auswählen.",
  "selectedTags must be a list of tag names.": "selectedTags muss eine Liste von Tag-Namen sein.",
  "spendingByTagEnabled must be a boolean.": "spendingByTagEnabled muss ein boolescher Wert sein.",
  "transactionIds must contain transaction IDs.": "transactionIds muss Transaktions-IDs enthalten.",
  "splitCount must be a number.": "splitCount muss eine Zahl sein.",
  "validUntil must be a date or null.": "validUntil muss ein Datum oder null sein.",
  "ids must contain duplicate IDs.": "ids muss Duplikat-IDs enthalten.",
  "columns must contain a name and a list of categories.": "Spalten müssen einen Namen und eine Liste von Kategorien enthalten.",
};

const uiCatalogs: Record<AppLocale, Record<string, string>> = {
  en: {},
  de: germanUi,
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
      .replace(/^(\d+) proposed change needs your review$/, "$1 vorgeschlagene Änderung muss geprüft werden")
      .replace(/^(\d+) proposed changes need your review$/, "$1 vorgeschlagene Änderungen müssen geprüft werden")
      .replace(/^(\d+) separated duplicate$/, "$1 getrenntes Duplikat")
      .replace(/^(\d+) separated duplicates$/, "$1 getrennte Duplikate")
      .replace(/^(\d+) duplicates? deleted\.$/, "$1 Duplikate gelöscht.")
      .replace(/^(\d+) pending item approved\.$/, "$1 ausstehender Eintrag freigegeben.")
      .replace(/^(\d+) pending items approved\.$/, "$1 ausstehende Einträge freigegeben.")
      .replace(/^(\d+) pending item rejected\.$/, "$1 ausstehender Eintrag abgelehnt.")
      .replace(/^(\d+) pending items rejected\.$/, "$1 ausstehende Einträge abgelehnt.")
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
      .replace(/^(\d+) files? processed · (\d+) imported · (\d+) duplicates? separated$/, "$1 Dateien verarbeitet · $2 importiert · $3 Duplikate getrennt")
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
  return Object.keys(germanUi).filter((key) => !uiCatalogs[locale][key]);
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
