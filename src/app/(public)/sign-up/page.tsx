import Link from "next/link";
import type { Metadata } from "next";
import { KeyRound, Mail, Phone } from "lucide-react";

import { signUpAction } from "@/app/(public)/sign-up/actions";
import { SignUpSubmitButton } from "@/components/auth/sign-up-submit-button";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getMessages } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { createMetadata } from "@/lib/site";

export const metadata: Metadata = createMetadata({
  title: "Sign Up",
  description: "Create an ERA Academy account with your email and phone number.",
  path: "/sign-up"
});

type SignUpPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

function getMessage(error?: string) {
  return error ?? null;
}

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const params = await searchParams;
  const locale = await getLocale();
  const t = getMessages(locale);
  const errorKey = getMessage(params.error);
  const message = errorKey ? t.signUp.errors[errorKey as keyof typeof t.signUp.errors] : null;

  return (
    <Section className="py-8 sm:py-12 lg:py-16">
      <Container className="grid items-start gap-6 lg:grid-cols-[0.95fr,1.05fr] lg:gap-10">
        <Card className="order-1 border-white/70 bg-white/92 shadow-panel lg:order-2">
          <CardHeader className="space-y-3 px-5 pb-4 pt-5 sm:px-8 sm:pt-8">
            <div className="inline-flex w-fit rounded-full bg-primary/8 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              {t.signUp.join}
            </div>
            <CardTitle className="text-2xl sm:text-3xl">{t.signUp.join}</CardTitle>
            <p className="text-sm leading-7 text-muted-foreground sm:text-base">
              {t.signUp.details}
            </p>
          </CardHeader>
          <CardContent className="space-y-5 px-5 pb-5 sm:px-8 sm:pb-8">
            {message ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {message}
              </div>
            ) : null}

            <div className="rounded-2xl border border-primary/10 bg-primary/5 px-4 py-3 text-sm leading-6 text-muted-foreground">
              {locale === "uz"
                ? "Email va parol bilan tezda akkaunt yarating. Telefon raqami ixtiyoriy, lekin keyinroq telefon orqali kirish uchun foydali."
                : "Create your account quickly with email and password. A phone number is optional, but helpful if you want phone login later."}
            </div>

            <form action={signUpAction} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium">
                  {t.signUp.name}
                </label>
                <Input
                  id="name"
                  name="name"
                  placeholder={t.signUp.namePlaceholder}
                  autoComplete="name"
                  className="h-12 text-base sm:h-14"
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  {t.signUp.email}
                </label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder={t.signUp.emailPlaceholder}
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="h-12 text-base sm:h-14"
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="phone" className="text-sm font-medium">
                  {locale === "uz" ? `${t.signUp.phone} (ixtiyoriy)` : `${t.signUp.phone} (optional)`}
                </label>
                <Input
                  id="phone"
                  name="phone"
                  placeholder={t.signUp.phonePlaceholder}
                  autoComplete="tel"
                  inputMode="tel"
                  className="h-12 text-base sm:h-14"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="password" className="text-sm font-medium">
                    {t.signUp.password}
                  </label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder={t.signUp.passwordPlaceholder}
                    autoComplete="new-password"
                    className="h-12 text-base sm:h-14"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="confirmPassword" className="text-sm font-medium">
                    {t.signUp.confirmPassword}
                  </label>
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    placeholder={t.signUp.confirmPasswordPlaceholder}
                    autoComplete="new-password"
                    className="h-12 text-base sm:h-14"
                    required
                  />
                </div>
              </div>
              <SignUpSubmitButton locale={locale} />
            </form>

            <div className="space-y-3 border-t border-border/70 pt-2">
              <p className="text-sm text-muted-foreground">
                {t.signUp.already}{" "}
                <Link href="/sign-in" className="text-primary">
                  {t.signUp.signInHere}
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="order-2 space-y-5 lg:order-1 lg:space-y-6">
          <Badge>{t.signUp.badge}</Badge>
          <h1 className="font-display text-3xl leading-tight sm:text-5xl lg:text-6xl">
            {t.signUp.title}
          </h1>
          <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
            {t.signUp.description}
          </p>

          <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
            <Card className="bg-white/70">
              <CardContent className="space-y-3 p-5">
                <Mail className="h-5 w-5 text-primary" />
                <p className="text-sm text-muted-foreground">{t.signUp.cards[0]}</p>
              </CardContent>
            </Card>
            <Card className="bg-white/70">
              <CardContent className="space-y-3 p-5">
                <Phone className="h-5 w-5 text-primary" />
                <p className="text-sm text-muted-foreground">{t.signUp.cards[1]}</p>
              </CardContent>
            </Card>
            <Card className="bg-white/70">
              <CardContent className="space-y-3 p-5">
                <KeyRound className="h-5 w-5 text-primary" />
                <p className="text-sm text-muted-foreground">{t.signUp.cards[2]}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </Container>
    </Section>
  );
}
