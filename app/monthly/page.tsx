import MonthlyReport from "./MonthlyReport";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Monthly · Spendee companion" };

export default function MonthlyPage() {
  return <MonthlyReport />;
}
