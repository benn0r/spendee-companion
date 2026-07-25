export const supportedLocales = [
  { code: "en", label: "English", intlLocale: "en-CH" },
  { code: "de", label: "Deutsch", intlLocale: "de-CH" },
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
    "app.name": "Spendee-Begleiter",
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
};

const germanUi: Record<string, string> = {
  "Spendee companion": "Spendee-Begleiter",
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
  "Wallets": "Wallets",
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
  "Wallet": "Wallet",
  "Type": "Typ",
  "Category": "Kategorie",
  "Note & labels": "Notiz & Tags",
  "Author": "Autor",
  "Amount": "Betrag",
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
  "All matching wallets, newest first": "Alle passenden Wallets, neueste zuerst",
  "Wallet activity": "Wallet-Aktivität",
  "Active transactions, newest first": "Aktive Transaktionen, neueste zuerst",
  "Starting amount": "Startbetrag",
  "Current wallet amount": "Aktueller Wallet-Betrag",
  "SPENDING OVER TIME": "AUSGABEN IM ZEITVERLAUF",
  "Compare net category totals by month and combine categories into custom columns.": "Netto-Kategoriesummen pro Monat vergleichen und Kategorien in eigenen Spalten zusammenfassen.",
  "Table columns": "Tabellenspalten",
  "Monthly totals": "Monatssummen",
  "Expenses plus income across all active transactions and wallets": "Ausgaben plus Einnahmen über alle aktiven Transaktionen und Wallets",
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
  "Loading wallet…": "Wallet wird geladen…",
  "Return to transactions": "Zurück zu den Transaktionen",
  "Return to all wallets": "Zurück zu allen Wallets",
  "No transactions in this category.": "Keine Transaktionen in dieser Kategorie.",
  "Income offsets expenses within each tag. Pie sizes use the magnitude of each resulting net amount.": "Einnahmen werden innerhalb jedes Tags mit Ausgaben verrechnet. Die Segmentgrösse entspricht dem Betrag des resultierenden Nettowerts.",
  "Choose export files": "Exportdateien auswählen",
  "Upload one or more XLSX or CSV files.": "Eine oder mehrere XLSX- oder CSV-Dateien hochladen.",
  "Drop files here": "Dateien hier ablegen",
  "XLSX and CSV exports are supported.": "XLSX- und CSV-Exporte werden unterstützt.",
  "Batch uploads may contain multiple wallets.": "Ein Batch-Upload darf mehrere Wallets enthalten.",
  "Each file must contain exactly one wallet. Changes and missing transactions require approval.": "Jede Datei muss genau eine Wallet enthalten. Änderungen und fehlende Transaktionen müssen freigegeben werden.",
  "Net income and spending for": "Nettoeinnahmen und -ausgaben für",
  "Remove": "Entfernen",
  "Restore this transaction to the active ledger": "Diese Transaktion im aktiven Bestand wiederherstellen",
  "Current amount": "Aktueller Betrag",
  "WALLET": "WALLET",
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
};

export function translateUiText(locale: AppLocale, text: string) {
  if (locale === "en") return text;
  const leading = text.match(/^\s*/)?.[0] ?? "";
  const trailing = text.match(/\s*$/)?.[0] ?? "";
  const core = text.trim();
  let translated = germanUi[core];
  if (!translated) {
    translated = core
      .replace(/^(\d+) transactions?$/, "$1 Transaktionen")
      .replace(/^(\d+) wallets?$/, "$1 Wallets")
      .replace(/^(\d+) categories?$/, "$1 Kategorien")
      .replace(/^(\d+) duplicates?$/, "$1 Duplikate")
      .replace(/^(\d+) splits?$/, "$1 Aufteilungen")
      .replace(/^(\d+) selected transactions?$/, "$1 Transaktionen ausgewählt")
      .replace(/^Page (\d+) of (\d+)$/, "Seite $1 von $2")
      .replace(/^(\d+)[–-](\d+) of (\d+)$/, "$1–$2 von $3");
    if (translated === core) {
      const months: Record<string, string> = {
        January: "Januar", February: "Februar", March: "März", April: "April", May: "Mai", June: "Juni",
        July: "Juli", August: "August", September: "September", October: "Oktober", November: "November", December: "Dezember",
      };
      translated = core.replace(/^(?:(\d{1,2})\. )?(January|February|March|April|May|June|July|August|September|October|November|December)( \d{4})?$/, (_match, day, month, year) => `${day ? `${day}. ` : ""}${months[month]}${year ?? ""}`);
    }
  }
  return `${leading}${translated}${trailing}`;
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
