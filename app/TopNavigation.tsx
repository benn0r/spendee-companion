"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function TopNavigation({
  active,
  onTransactions,
  onDuplicates,
  duplicateCount,
}: {
  active?: "transactions" | "duplicates" | "splits" | "monthly" | "validate";
  onTransactions?: () => void;
  onDuplicates?: () => void;
  duplicateCount?: number;
}) {
  const [count, setCount] = useState(duplicateCount ?? 0);
  useEffect(() => {
    if (duplicateCount !== undefined) {
      setCount(duplicateCount);
      return;
    }
    void fetch("/api/stats", { cache: "no-store" })
      .then((response) => response.json())
      .then((stats: { duplicates?: number }) =>
        setCount(stats.duplicates ?? 0),
      );
  }, [duplicateCount]);
  return (
    <nav aria-label="Primary navigation" className="top-navigation">
      {onTransactions ? (
        <button
          className={active === "transactions" ? "active" : ""}
          onClick={onTransactions}
        >
          Transactions
        </button>
      ) : (
        <Link href="/">Transactions</Link>
      )}
      {onDuplicates ? (
        <button
          className={active === "duplicates" ? "active" : ""}
          onClick={onDuplicates}
        >
          Duplicates <span>{count}</span>
        </button>
      ) : (
        <Link href="/?view=duplicates">
          Duplicates <span>{count}</span>
        </Link>
      )}
      <Link className={active === "splits" ? "active" : ""} href="/splits">
        Splits
      </Link>
      <Link className={active === "monthly" ? "active" : ""} href="/monthly">
        Monthy
      </Link>
      <Link className={active === "validate" ? "active" : ""} href="/validate">
        Validate
      </Link>
    </nav>
  );
}
