import { cookies } from "next/headers";

import { isLocale, type Locale, localeCookieName } from "@/lib/i18n";

export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(localeCookieName)?.value;
  return isLocale(value) ? value : "en";
}
