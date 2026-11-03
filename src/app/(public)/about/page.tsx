import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { ArrowRight, BookOpen, CheckCircle2, Compass, GraduationCap, Mail, Sparkles, Users } from "lucide-react";

import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAboutPageContent } from "@/lib/about/content";
import { getLocale } from "@/lib/i18n-server";
import { createMetadata } from "@/lib/site";
import { cn } from "@/lib/utils";
import { getPublicSiteSettings } from "@/server/admin";

export const revalidate = 3600;

export const metadata: Metadata = createMetadata({
  title: "About ERA Academy",
  description:
    "Learn what ERA Academy is, who it is for, and why learners trust it for guided, practical education in AI and real-world skills.",
  path: "/about"
});

export default async function AboutPage() {
  const [locale, settings] = await Promise.all([getLocale(), getPublicSiteSettings()]);
  const content = getAboutPageContent(locale);
  const supportHref = settings?.supportEmail ? `mailto:${settings.supportEmail}` : "/faq#support-heading";
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: "About ERA Academy",
    description: content.heroDescription
  };

  return (
    <>
      <Script
        id="era-about-structured-data"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <Section className="overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(176,221,255,0.22),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(255,219,158,0.22),_transparent_32%),linear-gradient(180deg,_rgba(255,255,255,0.97),_rgba(248,250,255,0.92))]">
        <Container className="space-y-14 sm:space-y-16">
          <section className="grid gap-8 lg:grid-cols-[1.05fr,0.95fr] lg:items-center">
            <div className="space-y-6">
              <Badge variant="outline">{content.heroBadge}</Badge>
              <div className="space-y-4">
                <h1 className="page-title">{content.heroTitle}</h1>
                <p className="page-lead">{content.heroDescription}</p>
              </div>
              <div className="flex flex-col gap-4 sm:flex-row">
                <Link href="/courses" className={cn(buttonVariants({ size: "lg" }))}>
                  {content.ctas.exploreCourses}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/sign-up" className={cn(buttonVariants({ size: "lg", variant: "outline" }))}>
                  {content.ctas.startLearning}
                </Link>
                <a href={supportHref} className={cn(buttonVariants({ size: "lg", variant: "ghost" }))}>
                  {content.ctas.contactUs}
                </a>
              </div>
            </div>

            <Card className="overflow-hidden border-primary/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,248,255,0.98))] shadow-panel">
              <CardContent className="space-y-6 p-6 sm:p-8">
                <div className="grid gap-4 sm:grid-cols-3">
                  {content.heroStats.map((stat) => (
                    <div key={stat.label} className="rounded-[1.5rem] border border-border/70 bg-white/92 p-4 shadow-soft">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{stat.label}</p>
                      <p className="mt-3 text-sm font-semibold leading-6 text-foreground">{stat.value}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-[1.8rem] bg-[linear-gradient(135deg,#1f3256,#2f4d7a_56%,#5f88b6)] p-6 text-white">
                  <div className="flex items-center justify-between">
                    <p className="text-sm uppercase tracking-[0.16em] text-white/75">
                      {locale === "uz" ? "ERA tajribasi" : "The ERA experience"}
                    </p>
                    <Sparkles className="h-5 w-5 text-white/85" />
                  </div>
                  <h2 className="section-title mt-4 text-white">
                    {locale === "uz" ? "Aniq yo'l, real mashq, kuchliroq ishonch" : "Clear path, real practice, stronger trust"}
                  </h2>
                  <p className="mt-3 max-w-xl text-sm leading-7 text-white/80">
                    {locale === "uz"
                      ? "ERA o'quvchilarga keyingi nima qilishni ko'rsatadi, oilalarga esa o'quv yo'nalishini tushunishni osonlashtiradi."
                      : "ERA helps learners see what comes next while making the learning journey easier for families to understand and trust."}
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardContent className="space-y-4 p-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary">
                  <Compass className="h-5 w-5" />
                </div>
                <h2 className="section-title">{content.sections.whatIsEra.title}</h2>
                <p className="section-copy">{content.sections.whatIsEra.body}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-4 p-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary">
                  <Sparkles className="h-5 w-5" />
                </div>
                <h2 className="section-title">{content.sections.mission.title}</h2>
                <p className="section-copy">{content.sections.mission.body}</p>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.05fr,0.95fr]">
            <Card>
              <CardContent className="space-y-5 p-8">
                <h2 className="section-title">{content.sections.whoItIsFor.title}</h2>
                <p className="section-copy">{content.sections.whoItIsFor.body}</p>
                <div className="grid gap-3">
                  {content.sections.whoItIsFor.groups.map((group) => (
                    <div key={group.title} className="rounded-[1.4rem] bg-secondary/60 p-4">
                      <p className="font-semibold text-foreground">{group.title}</p>
                      <p className="mt-2 text-sm leading-7 text-muted-foreground">{group.description}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-5 p-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary">
                  <BookOpen className="h-5 w-5" />
                </div>
                <h2 className="section-title">{content.sections.whatUsersLearn.title}</h2>
                <p className="section-copy">{content.sections.whatUsersLearn.body}</p>
                <div className="space-y-3">
                  {content.sections.whatUsersLearn.items.map((item) => (
                    <div key={item} className="flex gap-3 rounded-[1.25rem] border border-border/70 bg-white/85 p-4">
                      <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-primary" />
                      <p className="text-sm leading-7 text-muted-foreground">{item}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="space-y-6">
            <div className="space-y-3">
              <h2 className="section-title">{content.sections.whyChooseEra.title}</h2>
              <p className="section-copy max-w-3xl">{content.sections.whyChooseEra.body}</p>
            </div>
            <div className="grid gap-6 lg:grid-cols-3">
              {content.sections.whyChooseEra.points.map((point, index) => {
                const icons = [Users, GraduationCap, Sparkles];
                const Icon = icons[index] ?? Sparkles;

                return (
                  <Card key={point.title}>
                    <CardContent className="space-y-4 p-8">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      <h3 className="card-title">{point.title}</h3>
                      <p className="text-sm leading-7 text-muted-foreground">{point.description}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[0.95fr,1.05fr]">
            <Card className="border-primary/10 bg-[linear-gradient(135deg,rgba(31,50,86,0.05),rgba(207,176,126,0.08))]">
              <CardContent className="space-y-5 p-8 sm:p-10">
                <h2 className="section-title">{content.sections.teachingStyle.title}</h2>
                <p className="section-copy">{content.sections.teachingStyle.body}</p>
                <div className="space-y-3">
                  {content.sections.teachingStyle.steps.map((step) => (
                    <div key={step} className="flex gap-3 rounded-[1.4rem] bg-white/82 p-4">
                      <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-primary" />
                      <p className="text-sm leading-7 text-muted-foreground">{step}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card id="support" className="overflow-hidden">
              <CardContent className="space-y-5 p-8 sm:p-10">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary">
                  <Mail className="h-5 w-5" />
                </div>
                <h2 className="section-title">{content.sections.support.title}</h2>
                <p className="section-copy">{content.sections.support.body}</p>
                <div className="rounded-[1.4rem] border border-border/70 bg-secondary/45 p-5">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    {content.sections.support.supportEmailLabel}
                  </p>
                  <p className="mt-3 break-all text-sm font-semibold text-foreground">
                    {settings?.supportEmail ?? "Support email will be shared by the ERA team."}
                  </p>
                </div>
                <p className="text-sm leading-7 text-muted-foreground">{content.sections.support.communityNote}</p>
                <div className="flex flex-col gap-4 sm:flex-row">
                  <Link href="/courses" className={cn(buttonVariants({}))}>
                    {content.ctas.exploreCourses}
                  </Link>
                  <a href={supportHref} className={cn(buttonVariants({ variant: "outline" }))}>
                    {content.ctas.contactUs}
                  </a>
                </div>
              </CardContent>
            </Card>
          </section>
        </Container>
      </Section>
    </>
  );
}
