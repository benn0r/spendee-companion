export const supportedLocales = [
  { code: "en", label: "English", intlLocale: "en-CH" },
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
};

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
