"use client";

import * as React from "react";

import type { Locale } from "@/lib/i18n";
import { translate } from "@/lib/ui-text";

/*
 * The interface language for client components (set once in the root layout from the era_locale cookie, so
 * server and browser render the same text). Components call useT() and wrap their English text: T("Save").
 */
const LocaleContext = React.createContext<Locale>("en");

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return React.useContext(LocaleContext);
}

export function useT() {
  const locale = useLocale();
  return React.useCallback((text: string, vars?: Record<string, string | number>) => translate(locale, text, vars), [locale]);
}
