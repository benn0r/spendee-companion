import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Spendee companion",
  description: "Import Spendee XLSX and CSV exports into a durable, duplicate-aware archive.",
};

const BUILD_NUMBER = (process.env.NEXT_PUBLIC_APP_VERSION || "dev").slice(0, 7);

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}<footer className="site-footer">Spendee companion · build {BUILD_NUMBER}</footer></body>
    </html>
  );
}
