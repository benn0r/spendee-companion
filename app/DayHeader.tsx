import { formatDayLabel, type DayTotal } from "@/lib/day-groups";

export default function DayHeader(
  { day, totals, colSpan }: { day: string; totals: DayTotal[]; colSpan: number },
) {
  return (
    <tr className="day-header">
      <td colSpan={colSpan}>
        <div>
          <strong>{formatDayLabel(day)}</strong>
          <span>
            {totals.map((item) => (
              <b key={item.currency}>
                {new Intl.NumberFormat("de-CH", {
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
