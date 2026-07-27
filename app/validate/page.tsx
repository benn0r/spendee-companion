import type { Metadata } from "next";
import ValidateView from "./ValidateView";

export const metadata: Metadata = { title: "Validate documents · Spendee companion" };

export default function ValidatePage() {
  return <ValidateView />;
}
