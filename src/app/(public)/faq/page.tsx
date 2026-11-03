import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";

import { FaqBrowser } from "@/components/faq/faq-browser";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getFaqPageContent } from "@/lib/faq/content";
import { getLocale } from "@/lib/i18n-server";
import { createMetadata } from "@/lib/site";
import { cn } from "@/lib/utils";
import { getPublicSiteSettings } from "@/server/admin";

export const revalidate = 3600;

export const metadata: Metadata = createMetadata({
  title: "Frequently Asked Questions",
  description:
    "Find simple answers about ERA Academy registration, login, courses, certificates, support, and common technical issues.",
  path: "/faq"
});

export default async function FaqPage() {
  const [locale, settings] = await Promise.all([getLocale(), getPublicSiteSettings()]);
  const content = getFaqPageContent(locale);
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: content.items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer
      }
    }))
  };

  return (
    <>
      <Script
        id="era-faq-structured-data"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <Section className="overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(255,214,153,0.28),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(174,221,255,0.22),_transparent_32%),linear-gradient(180deg,_rgba(255,255,255,0.96),_rgba(255,249,240,0.78))]">
        <Container className="space-y-10">
          <div className="space-y-6">
            <Badge variant="outline">{content.badge}</Badge>
            <div className="grid gap-6 lg:grid-cols-[1.15fr,0.85fr] lg:items-end">
              <div className="space-y-4">
                <h1 className="page-title">{content.title}</h1>
                <p className="page-lead">{content.description}</p>
              </div>
              <div className="rounded-[1.8rem] border border-white/70 bg-white/88 p-5 shadow-soft sm:p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Quick links
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href="/sign-up" className={cn(buttonVariants({ variant: "outline" }))}>
                    Sign Up
                  </Link>
                  <Link href="/sign-in" className={cn(buttonVariants({ variant: "outline" }))}>
                    Sign In
                  </Link>
                  <Link href="/courses" className={cn(buttonVariants({}))}>
                    Browse Courses
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <FaqBrowser content={content} supportEmail={settings?.supportEmail ?? null} />
        </Container>
      </Section>
    </>
  );
}
