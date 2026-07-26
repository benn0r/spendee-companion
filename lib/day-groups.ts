export type DayTotal = { currency: string; total: number };
export type DayTotals = Record<string, DayTotal[]>;

const timeZone = "Europe/Zurich";

export function dayKey(value: string | Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function calculateDayTotals(
  rows: Array<{ date: string; amount: number; currency: string }>,
): DayTotals {
  const totals = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const key = dayKey(row.date);
    const currencies = totals.get(key) ?? new Map<string, number>();
    currencies.set(row.currency, (currencies.get(row.currency) ?? 0) + row.amount);
    totals.set(key, currencies);
  }
  return Object.fromEntries(Array.from(totals, ([key, currencies]) => [
    key,
    Array.from(currencies, ([currency, total]) => ({ currency, total }))
      .sort((a, b) => a.currency.localeCompare(b.currency)),
  ]));
}

export function groupRowsByDay<T extends { date: string }>(rows: T[]) {
  const groups: Array<{ key: string; rows: T[] }> = [];
  for (const row of rows) {
    const key = dayKey(row.date);
    const current = groups.at(-1);
    if (current?.key === key) current.rows.push(row);
    else groups.push({ key, rows: [row] });
  }
  return groups;
}

export function formatDayLabel(key: string, now = new Date(), locale = "en-GB"): string {
  const today = dayKey(now);
  const yesterdayDate = new Date(`${today}T12:00:00.000Z`);
  yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
  const yesterday = yesterdayDate.toISOString().slice(0, 10);
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  const monthName = new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(date);
  return `${day}. ${monthName}`;
}
