import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Spendee · Transaction archive",
  description: "Import Spendee XLSX and CSV exports into a durable, duplicate-aware archive.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
