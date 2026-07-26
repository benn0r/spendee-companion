import type { Metadata } from "next";
import "./globals.css";
import { I18nProvider } from "./I18nProvider";
import { SiteFooter } from "./SiteFooter";

export const metadata: Metadata = {
  title: "Spendee companion",
  description: "Import Spendee XLSX and CSV exports into a durable, duplicate-aware archive.",
  icons: {
    icon: [
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

const BUILD_NUMBER = (process.env.NEXT_PUBLIC_APP_VERSION || "dev").slice(0, 7);

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><I18nProvider locale="en">{children}<SiteFooter build={BUILD_NUMBER} /></I18nProvider></body>
    </html>
  );
}
