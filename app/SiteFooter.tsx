"use client";

import { supportedLocales, type AppLocale } from "@/lib/i18n";
import { useI18n } from "./I18nProvider";

export function SiteFooter({ build }: { build: string }) {
  const { locale, setLocale } = useI18n();
  return (
    <footer className="site-footer">
      <span>Spendee companion · build {build}</span>
      <label className="footer-language">
        <span>Language</span>
        <select
          value={locale}
          onChange={(event) => setLocale(event.target.value as AppLocale)}
          aria-label="Language"
        >
          {supportedLocales.map((item) => (
            <option key={item.code} value={item.code}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
    </footer>
  );
}
