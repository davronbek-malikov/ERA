import { NextRequest, NextResponse } from "next/server";

import { isLocale, localeCookieName } from "@/lib/i18n";

export async function POST(request: NextRequest) {
  const { locale } = (await request.json()) as { locale?: string };

  if (!isLocale(locale)) {
    return NextResponse.json({ error: "Invalid locale." }, { status: 400 });
  }

  const response = NextResponse.json({ success: true, locale });
  response.cookies.set(localeCookieName, locale, {
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 365
  });

  return response;
}
