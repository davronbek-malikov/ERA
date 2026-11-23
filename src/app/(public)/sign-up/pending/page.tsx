import Link from "next/link";
import type { Metadata } from "next";
import { CheckCircle2, Clock3 } from "lucide-react";

import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMessages } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { createMetadata } from "@/lib/site";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  ...createMetadata({ title: "Registration received", description: "Your ERA Academy account is waiting for approval.", path: "/sign-up/pending" }),
  robots: { index: false }
};

/** Shown right after registration: the account exists but stays PENDING until a teacher approves it. */
export default async function SignUpPendingPage() {
  const t = getMessages(await getLocale()).signUp;
  return (
    <Section className="py-6 sm:py-12 lg:py-14">
      <Container className="max-w-2xl">
        <Card className="border-white/70 bg-card/92 shadow-panel">
          <CardHeader className="space-y-3 px-4 pt-6 sm:px-8 sm:pt-8">
            <Badge className="w-fit">{t.pendingBadge}</Badge>
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Clock3 className="size-6" aria-hidden="true" />
              </span>
              <CardTitle role="status" className="leading-snug">
                {t.pendingTitle}
              </CardTitle>
            </div>
            <p className="text-sm leading-7 text-muted-foreground sm:text-base">{t.pendingBody}</p>
          </CardHeader>
          <CardContent className="space-y-6 px-4 pb-6 sm:px-8 sm:pb-8">
            <ol className="space-y-3">
              {t.pendingSteps.map((step, index) => (
                <li key={step} className="flex items-start gap-3 text-sm">
                  <CheckCircle2 className={cn("mt-0.5 size-5 shrink-0", index === 0 ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link href="/sign-in" className={cn(buttonVariants(), "h-11")}>
                {t.pendingSignIn}
              </Link>
              <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "h-11")}>
                {t.pendingHome}
              </Link>
            </div>
          </CardContent>
        </Card>
      </Container>
    </Section>
  );
}
