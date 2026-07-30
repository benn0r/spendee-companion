"use client";

export default function PageSizeSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="page-size-select">
      <span>Rows</span>
      <select
        aria-label="Rows per page"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {[10, 25, 50, 100].map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
    </label>
  );
}
