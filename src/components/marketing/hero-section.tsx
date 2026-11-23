import { ArrowRight, CheckCircle2, PlayCircle, Sparkles } from "lucide-react";

import { TrackedLink } from "@/components/analytics/tracked-link";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getMessages, type Locale } from "@/lib/i18n";

type HeroSectionProps = {
  locale: Locale;
  stats: {
    courseCount: number;
    lessonCount: number;
    totalSubjectTracks: number;
  };
};

export function HeroSection({ locale, stats }: HeroSectionProps) {
  const t = getMessages(locale);
  const metrics = [
    { label: t.home.publishedCourses, value: `${stats.courseCount}` },
    { label: t.home.lessonModules, value: `${stats.lessonCount}` },
    { label: t.home.subjectTracks, value: `${stats.totalSubjectTracks}` }
  ];

  const trustPoints =
    locale === "uz"
      ? [
          "Haftalik o'quv rejalari va ko'rinadigan progress",
          "Boshlang'ichdan ilg'orgacha aniq darajalar",
          "Loyiha va amaliyot bilan mustahkamlanadigan darslar"
        ]
      : [
          "Weekly study plans with visible progress",
          "Clear levels from beginner to advanced",
          "Lessons reinforced with projects and practice"
        ];

  const dashboardCopy =
    locale === "uz"
      ? {
          activeTrack: "Faol yo'nalish",
          currentLesson: "Hozirgi dars",
          continueLearning: "Davom etish",
          progress: "Progress",
          thisWeek: "Shu hafta",
          mentorFeedback: "Mentor fikri",
          mentorBody: "Keyingi darsdan oldin prompt tuzilmasini bir marta takrorlang.",
          lessonTitle: "AI prompt asoslari",
          lessonMeta: "5-dars • amaliy mashq"
        }
      : {
          activeTrack: "Active track",
          currentLesson: "Current lesson",
          continueLearning: "Continue learning",
          progress: "Progress",
          thisWeek: "This week",
          mentorFeedback: "Mentor feedback",
          mentorBody: "Review your prompt structure once before the next lesson.",
          lessonTitle: "AI Prompt Foundations",
          lessonMeta: "Lesson 5 • practical workshop"
        };

  return (
    <Section className="overflow-hidden pt-8 sm:pt-12 lg:pt-14">
      <Container className="grid items-start gap-12 lg:grid-cols-[minmax(0,1.04fr),minmax(0,0.96fr)]">
        <div className="space-y-8">
          <div className="space-y-5">
            <Badge className="animate-fade-up">{t.home.heroBadge}</Badge>
            <div className="space-y-5">
              <h1 className="display-title animate-fade-up max-w-3xl">{t.home.heroTitle}</h1>
              <p className="page-lead animate-fade-up" style={{ animationDelay: "120ms" }}>
                {t.home.heroDescription}
              </p>
            </div>
          </div>

          <div
            className="animate-fade-up flex flex-col gap-4 sm:flex-row"
            style={{ animationDelay: "180ms" }}
          >
            <TrackedLink
              href="/courses"
              className={buttonVariants({ size: "lg" })}
              eventName="cta_click"
              eventData={{ location: "hero", cta: "start_learning" }}
            >
              {t.home.exploreCourses}
              <ArrowRight className="h-4 w-4" />
            </TrackedLink>
            <TrackedLink
              href="/subjects"
              className={buttonVariants({ size: "lg", variant: "outline" })}
              eventName="cta_click"
              eventData={{ location: "hero", cta: "see_learning_paths" }}
            >
              {t.home.browseSubjects}
            </TrackedLink>
          </div>

          <div
            className="animate-fade-up grid gap-3 sm:grid-cols-3"
            style={{ animationDelay: "240ms" }}
          >
            {metrics.map((metric) => (
              <Card key={metric.label} className="border-border/70 bg-card/92 shadow-soft">
                <CardContent className="space-y-2 p-5">
                  <p className="metric-value">{metric.value}</p>
                  <p className="text-sm text-muted-foreground">{metric.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {trustPoints.map((point) => (
              <div
                key={point}
                className="rounded-xl border border-border/70 bg-card/82 px-4 py-4 text-sm leading-7 text-muted-foreground shadow-soft"
              >
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent text-primary">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                {point}
              </div>
            ))}
          </div>
        </div>

        <div className="relative lg:pt-4">
          <div className="absolute inset-x-10 top-10 h-48 rounded-full bg-primary/18 blur-3xl" />
          <Card className="relative overflow-hidden border-primary/10 bg-card shadow-panel">
            <CardContent className="space-y-6 p-6 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <Badge variant="secondary" className="w-fit bg-accent text-accent-foreground">
                    {dashboardCopy.activeTrack}
                  </Badge>
                  <div>
                    <p className="card-title text-foreground">
                      {locale === "uz" ? "AI bilan real loyihalar" : "AI with Real Projects"}
                    </p>
                    <p className="text-sm text-muted-foreground">{dashboardCopy.lessonMeta}</p>
                  </div>
                </div>
                <div className="rounded-xl border border-border/70 bg-card px-3 py-2 text-right shadow-soft">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    {dashboardCopy.progress}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-foreground">72%</p>
                </div>
              </div>

              <div className="relative overflow-hidden rounded-2xl border border-primary/12 bg-primary p-6 text-white">
                <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-card/10 blur-2xl" />
                <div className="relative space-y-5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm uppercase tracking-[0.16em] text-white/72">
                      {dashboardCopy.currentLesson}
                    </p>
                    <Sparkles className="h-5 w-5 text-white/80" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="section-title text-white">{dashboardCopy.lessonTitle}</h2>
                    <p className="max-w-md text-sm leading-7 text-white/78">
                      {locale === "uz"
                        ? "Nazariya, amaliy prompt yozish va qisqa loyiha vazifalari bir sahifada jamlangan."
                        : "Theory, guided prompting, and short project tasks are grouped into one clear learning flow."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <div className="inline-flex items-center gap-2 rounded-full bg-card/12 px-3 py-2 text-sm">
                      <PlayCircle className="h-4 w-4" />
                      {dashboardCopy.continueLearning}
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-card/12 px-3 py-2 text-sm">
                      <span className="h-2 w-2 rounded-full bg-success/40" />
                      {dashboardCopy.thisWeek}: 3 lessons
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-[1.2fr,0.8fr]">
                <div className="rounded-xl border border-border/70 bg-card p-5 shadow-soft">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                        {dashboardCopy.progress}
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {locale === "uz"
                          ? "Haftalik maqsad bo'yicha barqaror harakat"
                          : "Steady movement toward your weekly study target"}
                      </p>
                    </div>
                    <p className="font-display text-[2rem] font-semibold leading-none text-foreground">4/5</p>
                  </div>
                  <div className="mt-5 space-y-3">
                    {[78, 54, 92].map((value, index) => (
                      <div key={value} className="space-y-2">
                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                          <span>{locale === "uz" ? `Modul ${index + 1}` : `Module ${index + 1}`}</span>
                          <span>{value}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-secondary">
                          <div className="h-2 rounded-full bg-primary" style={{ width: `${value}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-border/70 bg-card p-5 shadow-soft">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    {dashboardCopy.mentorFeedback}
                  </p>
                  <p className="mt-3 text-base font-semibold text-foreground">
                    {locale === "uz" ? "Keyingi darsga tayyor turish" : "Stay ready for the next lesson"}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    {dashboardCopy.mentorBody}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </Container>
    </Section>
  );
}
