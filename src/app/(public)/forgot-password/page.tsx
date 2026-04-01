import Link from "next/link";
import type { Metadata } from "next";
import { KeyRound, MailCheck, ShieldCheck } from "lucide-react";

import {
  requestPasswordResetCodeAction,
  resetPasswordWithCodeAction
} from "@/app/(public)/forgot-password/actions";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getLocale } from "@/lib/i18n-server";
import { createMetadata } from "@/lib/site";

export const metadata: Metadata = createMetadata({
  title: "Forgot Password",
  description: "Reset your ERA Academy password using a code sent to your email.",
  path: "/forgot-password"
});

type ForgotPasswordPageProps = {
  searchParams: Promise<{
    error?: string;
    sent?: string;
    email?: string;
  }>;
};

function getMessage(error?: string) {
  if (error === "missing-email") {
    return "Please enter your Gmail address first.";
  }

  if (error === "email-not-configured") {
    return "Password reset email is not configured yet. Add SMTP details before using this feature.";
  }

  if (error === "missing-reset-fields") {
    return "Enter your email, the code from Gmail, and the new password fields.";
  }

  if (error === "password-too-short") {
    return "Your new password must be at least 8 characters long.";
  }

  if (error === "password-mismatch") {
    return "The new password fields do not match.";
  }

  if (error === "invalid-code") {
    return "That reset code is invalid or has expired.";
  }

  if (error === "rate-limited") {
    return "Too many reset attempts were made. Please wait and try again.";
  }

  if (error === "service-unavailable") {
    return "Password reset is temporarily unavailable. Please try again in a moment.";
  }

  return null;
}

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const params = await searchParams;
  const locale = await getLocale();
  const email = params.email ?? "";
  const message = getMessage(params.error);
  const copy =
    locale === "uz"
      ? {
          badge: "Parol yordami",
          title: "Gmail ga yuborilgan kod bilan parolni tiklang.",
          description:
            "Bir martalik kodni so'rang, emailingizni tekshiring va ERA Academy akkauntingiz uchun yangi parol yarating.",
          cardOne: "Kod emailga yuboriladi",
          cardTwo: "Qisqa muddatli tasdiqlash kodi",
          cardThree: "Yangi parol yarating",
          sendTitle: "Tiklash kodini yuborish",
          sendDescription: "Akkauntingizdagi Gmail manziliga 6 xonali kod yuboramiz.",
          sent: "Agar bu email ERA Academy da mavjud bo'lsa, tiklash kodi yuborildi.",
          email: "Gmail manzili",
          sendCode: "Kod yuborish",
          resetTitle: "Yangi parol yaratish",
          resetDescription:
            "Gmail dan kelgan kodni kiriting va hozir ishlatmoqchi bo'lgan parolni tanlang.",
          resetCode: "Tiklash kodi",
          password: "Yangi parol",
          passwordPlaceholder: "Kamida 8 ta belgi",
          confirmPassword: "Yangi parolni tasdiqlang",
          confirmPasswordPlaceholder: "Parolni qayta kiriting",
          save: "Yangi parolni saqlash",
          back: "Ortga",
          signIn: "kirish"
        }
      : {
          badge: "Password Help",
          title: "Reset a password with a code sent to Gmail.",
          description:
            "Request a one-time code, check your email, then create a brand new password for your ERA Academy account.",
          cardOne: "Code sent to email",
          cardTwo: "Short-lived verification code",
          cardThree: "Create a fresh password",
          sendTitle: "Send reset code",
          sendDescription: "We will send a 6-digit code to the Gmail address on your account.",
          sent: "If that email exists in ERA Academy, a reset code has been sent.",
          email: "Gmail address",
          sendCode: "Send Code",
          resetTitle: "Create new password",
          resetDescription:
            "Enter the code from Gmail and choose the password you want to use now.",
          resetCode: "Reset code",
          password: "New password",
          passwordPlaceholder: "At least 8 characters",
          confirmPassword: "Confirm new password",
          confirmPasswordPlaceholder: "Repeat password",
          save: "Save New Password",
          back: "Back to",
          signIn: "sign in"
        };

  return (
    <Section className="py-16 sm:py-20">
      <Container className="grid gap-8 lg:grid-cols-[0.95fr,1.05fr]">
        <div className="space-y-6">
          <Badge>{copy.badge}</Badge>
          <h1 className="font-display text-5xl leading-tight sm:text-6xl">
            {copy.title}
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
            {copy.description}
          </p>

          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="bg-white/70">
              <CardContent className="space-y-3 p-5">
                <MailCheck className="h-5 w-5 text-primary" />
                <p className="text-sm text-muted-foreground">{copy.cardOne}</p>
              </CardContent>
            </Card>
            <Card className="bg-white/70">
              <CardContent className="space-y-3 p-5">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <p className="text-sm text-muted-foreground">{copy.cardTwo}</p>
              </CardContent>
            </Card>
            <Card className="bg-white/70">
              <CardContent className="space-y-3 p-5">
                <KeyRound className="h-5 w-5 text-primary" />
                <p className="text-sm text-muted-foreground">{copy.cardThree}</p>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="space-y-6">
          <Card className="border-white/70 bg-white/85">
            <CardHeader className="space-y-3">
              <CardTitle className="text-3xl">{copy.sendTitle}</CardTitle>
              <p className="text-sm leading-7 text-muted-foreground">
                {copy.sendDescription}
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              {message ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {message}
                </div>
              ) : null}
              {params.sent === "1" ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {copy.sent}
                </div>
              ) : null}

              <form action={requestPasswordResetCodeAction} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="request-email" className="text-sm font-medium">
                    {copy.email}
                  </label>
                  <Input
                    id="request-email"
                    name="email"
                    type="email"
                    placeholder="student@gmail.com"
                    defaultValue={email}
                    required
                  />
                </div>
                <Button type="submit" className="w-full">
                  {copy.sendCode}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="border-white/70 bg-white/85">
            <CardHeader className="space-y-3">
              <CardTitle className="text-3xl">{copy.resetTitle}</CardTitle>
              <p className="text-sm leading-7 text-muted-foreground">
                {copy.resetDescription}
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <form action={resetPasswordWithCodeAction} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="reset-email" className="text-sm font-medium">
                    {copy.email}
                  </label>
                  <Input
                    id="reset-email"
                    name="email"
                    type="email"
                    placeholder="student@gmail.com"
                    defaultValue={email}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="code" className="text-sm font-medium">
                    {copy.resetCode}
                  </label>
                  <Input id="code" name="code" inputMode="numeric" placeholder="123456" required />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="password" className="text-sm font-medium">
                      {copy.password}
                    </label>
                    <Input id="password" name="password" type="password" placeholder={copy.passwordPlaceholder} required />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="confirmPassword" className="text-sm font-medium">
                      {copy.confirmPassword}
                    </label>
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      placeholder={copy.confirmPasswordPlaceholder}
                      required
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full">
                  {copy.save}
                </Button>
              </form>

              <p className="text-sm text-muted-foreground">
                {copy.back} <Link href="/sign-in" className="text-primary">{copy.signIn}</Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </Container>
    </Section>
  );
}
