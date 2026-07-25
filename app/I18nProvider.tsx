"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { intlLocale, normalizeLocale, translate, type AppLocale } from "@/lib/i18n";

type I18nValue = {
  locale: AppLocale;
  intlLocale: string;
  t: (key: string, values?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nValue>({
  locale: "en",
  intlLocale: "en-CH",
  t: (key, values) => translate("en", key, values),
});

export function I18nProvider({ children, locale: requestedLocale = "en" }: { children: ReactNode; locale?: string }) {
  const locale = normalizeLocale(requestedLocale);
  const value = useMemo<I18nValue>(() => ({
    locale,
    intlLocale: intlLocale(locale),
    t: (key, values) => translate(locale, key, values),
  }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
