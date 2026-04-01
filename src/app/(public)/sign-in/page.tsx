import Link from "next/link";
import type { Metadata } from "next";
import { LockKeyhole, Phone, UserRound } from "lucide-react";

import { signInAction } from "@/app/(public)/sign-in/actions";
import { SignInSubmitButton } from "@/components/auth/sign-in-submit-button";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { sanitizeNextPath } from "@/lib/auth";
import { getMessages } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { createMetadata } from "@/lib/site";

export const metadata: Metadata = createMetadata({
  title: "Sign In",
  description: "Sign in to ERA Academy with your email address or phone number.",
  path: "/sign-in"
});

type SignInPageProps = {
  searchParams: Promise<{
    error?: string;
    next?: string;
    reset?: string;
    signedOut?: string;
  }>;
};

function getMessage(error?: string) {
  return error ?? null;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const locale = await getLocale();
  const t = getMessages(locale);
  const nextPath = sanitizeNextPath(params.next, "/admin");
  const errorKey = getMessage(params.error);
  const message = errorKey ? t.signIn.errors[errorKey as keyof typeof t.signIn.errors] : null;

  return (
    <Section className="py-8 sm:py-12 lg:py-16">
      <Container className="grid items-start gap-6 lg:grid-cols-[0.95fr,1.05fr] lg:gap-10">
        <Card className="order-1 overflow-hidden border-white/70 bg-white/92 shadow-panel lg:order-2">
          <CardHeader className="space-y-3 px-5 pb-4 pt-5 sm:px-8 sm:pt-8">
            <div className="inline-flex w-fit rounded-full bg-primary/8 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              {t.signIn.welcome}
            </div>
            <CardTitle className="text-2xl sm:text-3xl">{t.signIn.welcome}</CardTitle>
            <p className="text-sm leading-7 text-muted-foreground sm:text-base">
              {t.signIn.continueText}
            </p>
          </CardHeader>
          <CardContent className="space-y-5 px-5 pb-5 sm:px-8 sm:pb-8">
            {message ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {message}
              </div>
            ) : null}
            {params.signedOut === "1" ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {t.signIn.signedOut}
              </div>
            ) : null}
            {params.reset === "1" ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {t.signIn.reset}
              </div>
            ) : null}

            <form action={signInAction} className="space-y-4">
              <input type="hidden" name="next" value={nextPath} />
              <div className="space-y-2">
                <label htmlFor="identifier" className="text-sm font-medium">
                  {t.signIn.identifier}
                </label>
                <Input
                  id="identifier"
                  name="identifier"
                  placeholder={t.signIn.identifierPlaceholder}
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  inputMode="text"
                  className="h-12 text-base sm:h-14"
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium">
                  {t.signIn.password}
                </label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder={t.signIn.passwordPlaceholder}
                  autoComplete="current-password"
                  className="h-12 text-base sm:h-14"
                  required
                />
              </div>
              <SignInSubmitButton locale={locale} />
            </form>

            <div className="space-y-3 border-t border-border/70 pt-2">
              <p className="text-sm text-muted-foreground">
                <Link href="/forgot-password" className="text-primary">
                  {t.signIn.forgot}
                </Link>
              </p>
              <p className="text-sm text-muted-foreground">
                {t.signIn.newHere}{" "}
                <Link href="/sign-up" className="text-primary">
                  {t.signIn.createAccount}
                </Link>
              </p>
              <p className="text-sm text-muted-foreground">
                {t.signIn.needCatalog}{" "}
                <Link href="/courses" className="text-primary">
                  {t.signIn.browseCourses}
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="order-2 space-y-5 lg:order-1 lg:space-y-6">
          <Badge>{t.signIn.badge}</Badge>
          <h1 className="font-display text-3xl leading-tight sm:text-5xl lg:text-6xl">
            {t.signIn.title}
          </h1>
          <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
            {t.signIn.description}
          </p>

          <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
            <Card className="bg-white/70">
              <CardContent className="space-y-3 p-5">
                <UserRound className="h-5 w-5 text-primary" />
                <p className="text-sm text-muted-foreground">{t.signIn.cards[0]}</p>
              </CardContent>
            </Card>
            <Card className="bg-white/70">
              <CardContent className="space-y-3 p-5">
                <LockKeyhole className="h-5 w-5 text-primary" />
                <p className="text-sm text-muted-foreground">{t.signIn.cards[1]}</p>
              </CardContent>
            </Card>
            <Card className="bg-white/70">
              <CardContent className="space-y-3 p-5">
                <Phone className="h-5 w-5 text-primary" />
                <p className="text-sm text-muted-foreground">{t.signIn.cards[2]}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </Container>
    </Section>
  );
}
