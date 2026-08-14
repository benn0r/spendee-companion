"use client";

import Link from "next/link";

export default function TopNavigation({
  active,
  onTransactions,
}: {
  active?: "transactions" | "splits" | "monthly" | "validate";
  onTransactions?: () => void;
}) {
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
      <Link className={active === "splits" ? "active" : ""} href="/splits">
        Splits
      </Link>
      <Link className={active === "monthly" ? "active" : ""} href="/monthly">
        Monthly
      </Link>
      <Link className={active === "validate" ? "active" : ""} href="/validate">
        Validate
      </Link>
    </nav>
  );
}
