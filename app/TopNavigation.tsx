"use client";

import Link from "next/link";

export default function TopNavigation({
  active,
  onTransactions,
  onDuplicates,
}: {
  active?: "transactions" | "duplicates" | "splits" | "monthly";
  onTransactions?: () => void;
  onDuplicates?: () => void;
}) {
  return (
    <nav aria-label="Primary navigation" className="top-navigation">
      {onTransactions ? (
        <button className={active === "transactions" ? "active" : ""} onClick={onTransactions}>Transactions</button>
      ) : (
        <Link href="/">Transactions</Link>
      )}
      {onDuplicates ? (
        <button className={active === "duplicates" ? "active" : ""} onClick={onDuplicates}>Duplicates</button>
      ) : (
        <Link href="/?view=duplicates">Duplicates</Link>
      )}
      <Link className={active === "splits" ? "active" : ""} href="/splits">Splits</Link>
      <Link className={active === "monthly" ? "active" : ""} href="/monthly">Monthly</Link>
    </nav>
  );
}
