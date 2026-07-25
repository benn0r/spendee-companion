import type { Metadata } from "next";
import "./globals.css";
import { I18nProvider } from "./I18nProvider";
import { SiteFooter } from "./SiteFooter";

export const metadata: Metadata = {
  title: "Spendee companion",
  description: "Import Spendee XLSX and CSV exports into a durable, duplicate-aware archive.",
};

const BUILD_NUMBER = (process.env.NEXT_PUBLIC_APP_VERSION || "dev").slice(0, 7);

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><I18nProvider locale="en">{children}<SiteFooter build={BUILD_NUMBER} /></I18nProvider></body>
    </html>
  );
}
