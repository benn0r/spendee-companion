"use client";

import { formatDayLabel, type DayTotal } from "@/lib/day-groups";
import { useI18n } from "./I18nProvider";

export default function DayHeader({
  day,
  totals,
  colSpan,
}: {
  day: string;
  totals: DayTotal[];
  colSpan: number;
}) {
  const { intlLocale } = useI18n();
  return (
    <tr className="day-header">
      <td colSpan={colSpan}>
        <div>
          <strong>{formatDayLabel(day, new Date(), intlLocale)}</strong>
          <span>
            {totals.map((item) => (
              <b key={item.currency}>
                {new Intl.NumberFormat(intlLocale, {
                  style: "currency",
                  currency: item.currency,
                }).format(item.total)}
              </b>
            ))}
          </span>
        </div>
      </td>
    </tr>
  );
}
