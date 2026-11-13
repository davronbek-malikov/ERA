import { cookies } from "next/headers";

import { isLocale, type Locale, localeCookieName } from "@/lib/i18n";
import { translate } from "@/lib/ui-text";

export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(localeCookieName)?.value;
  return isLocale(value) ? value : "en";
}

/** Translator for server components: T("Save") → "Saqlash" when the interface is Uzbek. */
export async function getT() {
  const locale = await getLocale();
  return (text: string, vars?: Record<string, string | number>) => translate(locale, text, vars);
}
