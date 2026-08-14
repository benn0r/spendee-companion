import type { Metadata } from "next";
import "./globals.css";
import { I18nProvider } from "./I18nProvider";
import { SiteFooter } from "./SiteFooter";
import { assetUrl, BUILD_ID } from "@/lib/assets";

export const metadata: Metadata = {
  title: "Spendee companion",
  description:
    "Review an Actual Budget ledger with account, category, split, and statement insights.",
  icons: {
    icon: [
      { url: assetUrl("/favicon-16.png"), sizes: "16x16", type: "image/png" },
      { url: assetUrl("/favicon-32.png"), sizes: "32x32", type: "image/png" },
      { url: assetUrl("/icon.png"), sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: assetUrl("/apple-icon.png"), sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <I18nProvider locale="en">
          {children}
          <SiteFooter build={BUILD_ID} />
        </I18nProvider>
      </body>
    </html>
  );
}
