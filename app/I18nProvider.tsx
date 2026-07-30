"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  intlLocale,
  normalizeLocale,
  translate,
  translateUiText,
  type AppLocale,
} from "@/lib/i18n";

type I18nValue = {
  locale: AppLocale;
  intlLocale: string;
  t: (key: string, values?: Record<string, string | number>) => string;
  setLocale: (locale: AppLocale) => void;
};

const I18nContext = createContext<I18nValue>({
  locale: "en",
  intlLocale: "en-CH",
  t: (key, values) => translate("en", key, values),
  setLocale: () => undefined,
});

const STORAGE_KEY = "spendee-locale";
const textSources = new WeakMap<Node, { source: string; rendered: string }>();
const attributeSources = new WeakMap<
  Element,
  Map<string, { source: string; rendered: string }>
>();
let titleSource = "";
let titleRendered = "";

function translateDocument(locale: AppLocale) {
  const root = document.body;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (
      !parent ||
      ["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA"].includes(parent.tagName)
    )
      continue;
    const current = node.nodeValue ?? "";
    const previous = textSources.get(node);
    // Translate from the original source after locale switches, but adopt text
    // React has genuinely replaced rather than treating it as a prior translation.
    const source =
      previous && current === previous.rendered ? previous.source : current;
    const rendered = translateUiText(locale, source);
    textSources.set(node, { source, rendered });
    if (current.trim() && rendered !== current) node.nodeValue = rendered;
  }
  root
    .querySelectorAll<HTMLElement>("[placeholder], [aria-label], [title]")
    .forEach((element) => {
      for (const attribute of ["placeholder", "aria-label", "title"] as const) {
        const current = element.getAttribute(attribute);
        if (!current) continue;
        const sources = attributeSources.get(element) ?? new Map();
        const previous = sources.get(attribute);
        const source =
          previous && current === previous.rendered ? previous.source : current;
        const rendered = translateUiText(locale, source);
        sources.set(attribute, { source, rendered });
        attributeSources.set(element, sources);
        if (rendered !== current) element.setAttribute(attribute, rendered);
      }
    });
}

export function I18nProvider({
  children,
  locale: requestedLocale = "en",
}: {
  children: ReactNode;
  locale?: string;
}) {
  const [locale, setLocale] = useState<AppLocale>(() =>
    normalizeLocale(requestedLocale),
  );
  useEffect(() => {
    setLocale(
      normalizeLocale(localStorage.getItem(STORAGE_KEY) ?? requestedLocale),
    );
  }, [requestedLocale]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
    if (!titleSource || document.title !== titleRendered)
      titleSource = document.title;
    titleRendered = titleSource
      .split(" · ")
      .map((part) => translateUiText(locale, part))
      .join(" · ");
    document.title = titleRendered;
    translateDocument(locale);
    // Client-rendered and asynchronously loaded content bypasses React-level t(),
    // so keep those DOM additions in the selected locale as they arrive.
    const observer = new MutationObserver(() => translateDocument(locale));
    observer.observe(document.body, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [locale]);
  const value = useMemo<I18nValue>(
    () => ({
      locale,
      intlLocale: intlLocale(locale),
      t: (key, values) => translate(locale, key, values),
      setLocale,
    }),
    [locale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
