import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Compass, LockKeyhole, Route, Sparkles } from "lucide-react";

import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDifficulty, formatDurationSummary, formatLessonSummary } from "@/lib/format";
import { getLocale } from "@/lib/i18n-server";
import { createMetadata } from "@/lib/site";
import { cn } from "@/lib/utils";
import { getLearningPathsData } from "@/server/learning-paths";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createMetadata({
  title: "Learning Paths",
  description:
    "Follow structured ERA Academy learning paths with ordered courses, visible progress, and a clear next step.",
  path: "/learning-paths"
});

export default async function LearningPathsPage() {
  const locale = await getLocale();
  const { currentUser, paths, databaseUnavailable } = await getLearningPathsData();
  const isUzbek = locale === "uz";
  const isStudent = currentUser?.role === "STUDENT";

  const copy = isUzbek
    ? {
        eyebrow: "Learning Paths",
        title: "Tasodifiy tanlash o'rniga tartibli yo'l bilan o'rganing",
        description:
          "ERA har bir yo'lni bosqichma-bosqich kurslar bilan tuzadi. Keyingi qadam aniq ko'rinadi, progress esa bitta joyda jamlanadi.",
        signInHint: "Shaxsiy progress va keyingi qadamni ko'rish uchun tizimga kiring.",
        signInCta: "Kirish",
        unavailable:
          "Learning Paths ma'lumotlari hozir demo rejimida ko'rsatilmoqda. Ma'lumotlar bazasi qaytgach progress yana jonli ishlaydi.",
        progress: "Path progress",
        completed: "Tugallangan kurslar",
        nextStep: "Keyingi qadam",
        openPath: "Yo'lni ochish",
        roadmap: "Roadmap",
        start: "Boshlash",
        continue: "Davom etish",
        complete: "Tugallangan",
        noPaths: "Hali learning path yo'q."
      }
    : {
        eyebrow: "Learning Paths",
        title: "Follow a guided route instead of choosing courses randomly",
        description:
          "ERA organizes each path into ordered courses with one clear next step. Students can see path progress, resume quickly, and keep momentum without guessing what to do next.",
        signInHint: "Sign in to unlock your personal path progress and next-step actions.",
        signInCta: "Sign in",
        unavailable:
          "Learning path data is currently shown from fallback demo content. Live progress will return automatically when the database is available.",
        progress: "Path progress",
        completed: "Completed courses",
        nextStep: "Next step",
        openPath: "Open path",
        roadmap: "Roadmap",
        start: "Start",
        continue: "Continue",
        complete: "Completed",
        noPaths: "No learning paths are available yet."
      };

  return (
    <Section className="pt-8 sm:pt-10">
      <Container className="space-y-10">
        <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
          <Card className="overflow-hidden border-primary/10 bg-primary text-white shadow-panel">
            <CardContent className="space-y-6 p-8 sm:p-10">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="secondary" className="bg-card/14 text-white">
                  {copy.eyebrow}
                </Badge>
                <div className="rounded-full bg-card/12 px-3 py-1 text-xs uppercase tracking-[0.16em] text-white/85">
                  ERA Roadmap
                </div>
              </div>
              <div className="space-y-3">
                <h1 className="page-title text-white">{copy.title}</h1>
                <p className="page-lead text-white/82">{copy.description}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg border border-white/12 bg-card/10 px-5 py-4">
                  <p className="text-sm text-white/72">{copy.openPath}</p>
                  <p className="mt-2 font-display text-[2rem] font-semibold leading-none">{paths.length}</p>
                </div>
                <div className="rounded-lg border border-white/12 bg-card/10 px-5 py-4">
                  <p className="text-sm text-white/72">{copy.completed}</p>
                  <p className="mt-2 font-display text-[2rem] font-semibold leading-none">
                    {paths.reduce((sum, path) => sum + path.completedCourseCount, 0)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/12 bg-card/10 px-5 py-4">
                  <p className="text-sm text-white/72">{copy.progress}</p>
                  <p className="mt-2 font-display text-[2rem] font-semibold leading-none">
                    {paths.length > 0
                      ? `${Math.round(paths.reduce((sum, path) => sum + path.progressPercent, 0) / paths.length)}%`
                      : "0%"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card">
            <CardContent className="space-y-5 p-8">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  {isStudent ? <Compass className="h-5 w-5" /> : <LockKeyhole className="h-5 w-5" />}
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.16em] text-muted-foreground">
                    {copy.nextStep}
                  </p>
                  <h2 className="section-title mt-1">
                    {paths[0]?.nextStepTitle ?? (isUzbek ? "Yo'l tayyor" : "Your roadmap is ready")}
                  </h2>
                </div>
              </div>
              <p className="text-sm leading-7 text-muted-foreground">
                {isStudent ? paths[0]?.summary ?? copy.noPaths : copy.signInHint}
              </p>
              <div className="rounded-lg bg-secondary/45 px-4 py-4 text-sm leading-7 text-muted-foreground">
                {databaseUnavailable ? copy.unavailable : paths[0]?.description ?? copy.signInHint}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href={isStudent ? paths[0]?.nextStepHref ?? "/courses" : "/sign-in?next=/learning-paths"}
                  className={cn(buttonVariants({ size: "lg" }), "w-full")}
                >
                  {isStudent ? paths[0]?.nextStepLabel ?? copy.openPath : copy.signInCta}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/courses"
                  className={cn(buttonVariants({ size: "lg", variant: "outline" }), "w-full")}
                >
                  {isUzbek ? "Kurslarni ko'rish" : "Browse courses"}
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>

        {paths.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-sm text-muted-foreground">{copy.noPaths}</CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {paths.map((path) => (
              <Card key={path.id} className="overflow-hidden border-border/70 bg-card shadow-soft">
                <CardContent className="space-y-8 p-7 sm:p-8">
                  <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <Badge>{path.title}</Badge>
                        {path.difficulty ? (
                          <Badge variant="outline">{formatDifficulty(path.difficulty, locale)}</Badge>
                        ) : null}
                        <Badge variant="secondary">{path.totalCourses} courses</Badge>
                      </div>
                      <div className="space-y-2">
                        <h2 className="section-title">{path.title}</h2>
                        <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
                          {path.description}
                        </p>
                      </div>
                    </div>
                    <div className="min-w-[260px] space-y-4 rounded-xl border border-border/70 bg-secondary/30 p-5">
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>{copy.progress}</span>
                        <span>{path.progressPercent}%</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-card">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${path.progressPercent}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>{copy.completed}</span>
                        <span>
                          {path.completedCourseCount}/{path.totalCourses}
                        </span>
                      </div>
                      <Link href={path.nextStepHref} className={cn(buttonVariants({ size: "lg" }), "w-full")}>
                        {path.nextStepLabel}
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>

                  <div className="space-y-5">
                    <div className="flex items-center gap-3">
                      <Route className="h-4 w-4 text-primary" />
                      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {copy.roadmap}
                      </p>
                    </div>

                    <div className="grid gap-5 xl:grid-cols-3">
                      {path.steps.map((step, index) => (
                        <div key={step.id} className="relative">
                          {index < path.steps.length - 1 ? (
                            <div className="absolute left-[calc(100%-10px)] top-12 hidden h-[2px] w-5 bg-border xl:block" />
                          ) : null}
                          <Card
                            className={cn(
                              "h-full border transition-all",
                              step.isCurrent && "border-primary/40 shadow-soft",
                              step.isCompleted && "border-success/20 bg-success/5",
                              !step.isCompleted && !step.isCurrent && "border-border/70 bg-card"
                            )}
                          >
                            <CardContent className="space-y-4 p-5">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                                    {step.stageLabel ?? `${copy.roadmap} ${step.position}`}
                                  </p>
                                  <h3 className="mt-2 text-lg font-semibold leading-tight text-foreground">
                                    {step.course.title}
                                  </h3>
                                </div>
                                <div
                                  className={cn(
                                    "flex h-10 w-10 items-center justify-center rounded-full",
                                    step.isCompleted
                                      ? "bg-success/10 text-success"
                                      : step.isCurrent || step.isNext
                                        ? "bg-primary/10 text-primary"
                                        : "bg-secondary text-muted-foreground"
                                  )}
                                >
                                  {step.isCompleted ? (
                                    <CheckCircle2 className="h-5 w-5" />
                                  ) : step.isCurrent || step.isNext ? (
                                    <Sparkles className="h-5 w-5" />
                                  ) : (
                                    <Route className="h-5 w-5" />
                                  )}
                                </div>
                              </div>

                              <p className="text-sm leading-7 text-muted-foreground">
                                {step.course.shortDescription}
                              </p>

                              <div className="grid gap-2 text-sm text-muted-foreground">
                                <div>{step.course.instructor.name}</div>
                                <div>{formatLessonSummary(step.course._count.lessons, locale)}</div>
                                <div>{formatDurationSummary(step.course.durationMinutes, locale)}</div>
                              </div>

                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-xs uppercase tracking-[0.14em] text-muted-foreground">
                                  <span>{copy.progress}</span>
                                  <span>{step.progressPercent}%</span>
                                </div>
                                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                                  <div
                                    className={cn(
                                      "h-full rounded-full",
                                      step.isCompleted ? "bg-success" : "bg-primary"
                                    )}
                                    style={{ width: `${step.progressPercent}%` }}
                                  />
                                </div>
                              </div>

                              <Link
                                href={step.actionHref}
                                className={cn(buttonVariants({ variant: step.isCurrent || step.isNext ? "default" : "outline", size: "sm" }), "w-full")}
                              >
                                {step.isCompleted
                                  ? isUzbek
                                    ? "Qayta ochish"
                                    : "Review course"
                                  : step.actionLabel}
                              </Link>
                            </CardContent>
                          </Card>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </Container>
    </Section>
  );
}
