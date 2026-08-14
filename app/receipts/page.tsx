import type { Metadata } from "next";
import ReceiptsView from "./ReceiptsView";

export const metadata: Metadata = { title: "Receipts · Spendee companion" };

export default function ReceiptsPage() {
  return <ReceiptsView />;
}
