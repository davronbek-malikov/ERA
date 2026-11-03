import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BookOpen, Clock3, Flame, GraduationCap, Sparkles, TrendingUp, Trophy } from "lucide-react";

import { StudentAnalyticsDashboard } from "@/components/analytics/student-analytics-dashboard";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDurationSummary, formatLessonSummary } from "@/lib/format";
import { getMessages } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { createMetadata } from "@/lib/site";
import { cn } from "@/lib/utils";
import { getMyLearningData } from "@/server/courses";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createMetadata({
  title: "My Learning",
  description: "Track your selected ERA Academy courses and continue where you left off.",
  path: "/my-learning"
});

type MyLearningPageProps = {
  searchParams: Promise<{
    signedIn?: string;
    signedUp?: string;
    enrolled?: string;
    onboarding?: string;
  }>;
};

export default async function MyLearningPage({ searchParams }: MyLearningPageProps) {
  const params = await searchParams;
  const locale = await getLocale();
  const t = getMessages(locale);
  const { currentUser, enrollments, databaseUnavailable, onboardingSummary, onboardingRequired, gamificationSummary, analyticsSummary } =
    await getMyLearningData();

  if (!currentUser) {
    redirect("/sign-in?next=/my-learning");
  }

  if (currentUser.role !== "STUDENT") {
    redirect("/admin");
  }

  if (onboardingRequired) {
    redirect("/onboarding?returning=1");
  }

  const totalLessons = enrollments.reduce(
    (sum, enrollment) => sum + enrollment.course._count.lessons,
    0
  );
  const totalMinutes = enrollments.reduce(
    (sum, enrollment) => sum + enrollment.course.durationMinutes,
    0
  );
  const averageProgress =
    enrollments.length > 0
      ? Math.round(
          enrollments.reduce((sum, enrollment) => sum + enrollment.progress, 0) / enrollments.length
        )
      : 0;
  const continueCourse =
    enrollments
      .slice()
      .sort((a, b) => {
        const scoreA = (a.progress < 100 ? 500 : 0) + new Date(a.updatedAt).getTime();
        const scoreB = (b.progress < 100 ? 500 : 0) + new Date(b.updatedAt).getTime();
        return scoreB - scoreA;
      })[0] ?? null;
  const welcomeTitle =
    locale === "uz"
      ? `Qaytganingizdan xursandmiz, ${currentUser.name}!`
      : `Welcome back, ${currentUser.name}!`;
  const dashboardCopy =
    locale === "uz"
      ? {
          overview: "Mening o'qishim",
          heroDescription:
            "Kurslaringizni kuzating, davom ettirish uchun keyingi darsni oching va progressni bitta soddalashtirilgan ish maydonida boshqaring.",
          activeCourses: "Faol kurslar",
          studyTime: "O'qish vaqti",
          averageProgress: "O'rtacha progress",
          continueLearning: "Davom etish",
          curatedForYou: "Siz uchun tanlangan",
          dashboardHint: "Bugun bitta darsni tugatish ham sur'atni saqlab qoladi.",
          yourCourses: "Kurslaringiz",
          trackProgress: "Har bir kurs bo'yicha progress va keyingi qadamlar",
          continueCourse: "Kursni davom ettirish",
          browseMore: "Yana kurslarni ko'rish",
          ready: "Bugungi darsga tayyor",
          readyBody: "Qisqa, muntazam o'qish seanslari uzoq tanaffuslardan ko'ra yaxshiroq natija beradi.",
          xp: "XP",
          level: "Daraja",
          streak: "Streak",
          badgeShowcase: "Badge showcase",
          badgeHint: "Har bir yakunlangan dars sizni keyingi badge ga yaqinlashtiradi."
        }
      : {
          overview: "My Learning",
          heroDescription:
            "Track your courses, reopen the next lesson quickly, and manage progress from one focused workspace.",
          activeCourses: "Active courses",
          studyTime: "Study time",
          averageProgress: "Average progress",
          continueLearning: "Continue Learning",
          curatedForYou: "Curated for you",
          dashboardHint: "Finishing one lesson today is enough to keep momentum alive.",
          yourCourses: "Your Courses",
          trackProgress: "Progress and next steps across every course",
          continueCourse: "Continue Course",
          browseMore: "Browse More Courses",
          ready: "Ready for today's lesson",
          readyBody: "Short, steady study sessions work better than long gaps between lessons.",
          xp: "XP",
          level: "Level",
          streak: "Streak",
          badgeShowcase: "Badge showcase",
          badgeHint: "Each completed lesson moves you closer to the next badge."
        };
  const checklistLabels =
    locale === "uz"
      ? {
          profile: "Profilni to'ldirish",
          lesson: "Birinchi darsni boshlash",
          practice: "Birinchi practice ni bajarish"
        }
      : {
          profile: "Complete profile",
          lesson: "Take first lesson",
          practice: "Do first practice"
        };

  return (
    <Section className="pt-8 sm:pt-10">
      <Container className="space-y-10">
        {params.signedIn === "1" || params.signedUp === "1" || params.enrolled === "1" ? (
          <div className="status-success rounded-xl border px-4 py-3 text-sm">
            {params.enrolled === "1"
              ? t.myLearning.successAdded
              : params.signedUp === "1"
                ? t.myLearning.successSignedUp
                : t.myLearning.successSignedIn}
          </div>
        ) : null}

        {params.onboarding === "1" && onboardingSummary ? (
          <div className="status-success rounded-xl border px-4 py-3 text-sm">
            {locale === "uz"
              ? "Onboarding yakunlandi. Shaxsiy rejangiz va checklist dashboard da tayyor."
              : "Onboarding is complete. Your personalized plan and checklist are now ready on the dashboard."}
          </div>
        ) : null}

        {databaseUnavailable ? (
          <div className="status-warning rounded-xl border px-4 py-3 text-sm">
            {locale === "uz"
              ? "Mening o'qishim ma'lumotlarini hozir yuklab bo'lmadi. Iltimos, birozdan keyin qayta urinib ko'ring."
              : "We couldn't load your learning data right now. Please try again in a moment."}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
          <Card className="overflow-hidden border-primary/10 bg-[linear-gradient(135deg,#312e81,#4f46e5_52%,#6366f1)] text-white shadow-panel">
            <CardContent className="surface-grid space-y-8 p-8 sm:p-10">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="secondary" className="bg-white/14 text-white">
                  {dashboardCopy.overview}
                </Badge>
                <div className="rounded-full bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.16em] text-white/80">
                  {dashboardCopy.curatedForYou}
                </div>
              </div>

              <div className="space-y-4">
                <h1 className="page-title text-white">{welcomeTitle}</h1>
                <p className="page-lead text-white/82">{dashboardCopy.heroDescription}</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-white/12 bg-white/10 px-5 py-4">
                  <p className="text-sm text-white/72">{dashboardCopy.activeCourses}</p>
                  <p className="metric-value mt-2">{enrollments.length}</p>
                </div>
                <div className="rounded-xl border border-white/12 bg-white/10 px-5 py-4">
                  <p className="text-sm text-white/72">{dashboardCopy.studyTime}</p>
                  <p className="metric-value mt-2">
                    {formatDurationSummary(totalMinutes, locale)}
                  </p>
                </div>
                <div className="rounded-xl border border-white/12 bg-white/10 px-5 py-4">
                  <p className="text-sm text-white/72">{dashboardCopy.averageProgress}</p>
                  <p className="metric-value mt-2">{averageProgress}%</p>
                </div>
              </div>

              {gamificationSummary ? (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr),auto,auto]">
                  <div className="rounded-xl border border-white/12 bg-white/10 px-5 py-4">
                    <div className="flex items-center justify-between text-sm text-white/72">
                      <span>{dashboardCopy.xp}</span>
                      <span>{gamificationSummary.totalXp}</span>
                    </div>
                    <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/15">
                      <div
                        className="h-full rounded-full bg-white"
                        style={{
                          width: `${Math.max(
                            0,
                            Math.min(
                              (gamificationSummary.currentLevelXp / Math.max(gamificationSummary.nextLevelXp, 1)) * 100,
                              100
                            )
                          )}%`
                        }}
                      />
                    </div>
                    <p className="mt-3 text-sm text-white/72">
                      {dashboardCopy.level} {gamificationSummary.level} · {gamificationSummary.levelTitle}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/12 bg-white/10 px-5 py-4">
                    <p className="text-sm text-white/72">{dashboardCopy.streak}</p>
                    <div className="mt-2 inline-flex items-center gap-2 font-display text-[2rem] font-semibold leading-none">
                      <Flame className="h-6 w-6" />
                      {gamificationSummary.streak}
                    </div>
                  </div>
                  <div className="rounded-[1.5rem] border border-white/12 bg-white/10 px-5 py-4">
                    <p className="text-sm text-white/72">{dashboardCopy.badgeShowcase}</p>
                    <div className="mt-2 inline-flex items-center gap-2 font-display text-[2rem] font-semibold leading-none">
                      <Trophy className="h-6 w-6" />
                      {gamificationSummary.badges.length}
                    </div>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-white">
            <CardContent className="space-y-6 p-8">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.16em] text-muted-foreground">
                    {dashboardCopy.continueLearning}
                  </p>
                  <h2 className="section-title mt-2">
                    {continueCourse?.course.title ?? dashboardCopy.ready}
                  </h2>
                </div>
                <div className="rounded-full bg-accent p-3 text-primary">
                  <TrendingUp className="h-5 w-5" />
                </div>
              </div>

              <p className="text-sm leading-7 text-muted-foreground">
                {continueCourse?.course.shortDescription ?? dashboardCopy.readyBody}
              </p>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{dashboardCopy.averageProgress}</span>
                  <span>{continueCourse?.progress ?? 0}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${continueCourse?.progress ?? 0}%` }}
                  />
                </div>
                <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                  <span>{formatLessonSummary(totalLessons, locale)}</span>
                  <span>{formatDurationSummary(totalMinutes, locale)}</span>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href={
                    continueCourse
                      ? continueCourse.course.currentLesson?.slug
                        ? `/courses/${continueCourse.course.slug}/lessons/${continueCourse.course.currentLesson.slug}`
                        : `/courses/${continueCourse.course.slug}`
                      : "/courses"
                  }
                  className={cn(buttonVariants({ size: "lg" }), "w-full")}
                >
                  {dashboardCopy.continueLearning}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/courses"
                  className={cn(buttonVariants({ size: "lg", variant: "outline" }), "w-full")}
                >
                  {dashboardCopy.browseMore}
                </Link>
              </div>

              <div className="rounded-xl bg-secondary/55 px-4 py-4 text-sm leading-7 text-muted-foreground">
                {dashboardCopy.dashboardHint}
              </div>
            </CardContent>
          </Card>
        </div>

        {onboardingSummary ? (
          <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
            <Card className="border-primary/10 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(246,248,255,0.98))]">
              <CardContent className="space-y-5 p-7">
                <div className="space-y-2">
                  <Badge variant="outline">
                    {locale === "uz" ? "Shaxsiy reja" : "Personalized plan"}
                  </Badge>
                  <h2 className="section-title">
                    {locale === "uz" ? "ERA siz uchun shu start nuqtani tanladi" : "ERA picked this starting plan for you"}
                  </h2>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl bg-secondary/45 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      {locale === "uz" ? "Assessment" : "Assessment"}
                    </p>
                    <p className="mt-2 font-display text-[2rem] font-semibold leading-none text-foreground">
                      {onboardingSummary.assessmentScore ?? 0}/6
                    </p>
                  </div>
                  <div className="rounded-xl bg-secondary/45 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      {locale === "uz" ? "Tavsiya etilgan daraja" : "Recommended level"}
                    </p>
                    <p className="mt-2 font-display text-[2rem] font-semibold leading-none text-foreground">
                      {onboardingSummary.recommendedLevel?.toLowerCase() ?? "-"}
                    </p>
                  </div>
                </div>

                {onboardingSummary.recommendedCourse ? (
                  <div className="rounded-xl border border-border/70 bg-white p-5">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      {locale === "uz" ? "Boshlash uchun kurs" : "Starting course"}
                    </p>
                    <p className="mt-2 card-title text-foreground">
                      {onboardingSummary.recommendedCourse.title}
                    </p>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                      <Link
                        href={`/courses/${onboardingSummary.recommendedCourse.slug}`}
                        className={cn(buttonVariants({ size: "lg" }), "w-full")}
                      >
                        {locale === "uz" ? "Kursni ochish" : "Open course"}
                      </Link>
                      <Link
                        href={
                          onboardingSummary.recommendedCourse
                            ? `/courses/${onboardingSummary.recommendedCourse.slug}`
                            : "/courses"
                        }
                        className={cn(buttonVariants({ size: "lg", variant: "outline" }), "w-full")}
                      >
                        {locale === "uz" ? "Batafsil ko'rish" : "View details"}
                      </Link>
                    </div>
                  </div>
                ) : null}

                <div className="space-y-3">
                  {onboardingSummary.personalizedPlan.map((item) => (
                    <div key={item} className="rounded-xl border border-border/70 bg-white px-4 py-4 text-sm leading-7 text-muted-foreground">
                      {item}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-5 p-7">
                <div className="space-y-2">
                  <Badge variant="outline">
                    {locale === "uz" ? "Onboarding checklist" : "Onboarding checklist"}
                  </Badge>
                  <h2 className="section-title">
                    {locale === "uz" ? "Keyingi qadamlarni shu tartibda bajaring" : "Follow these next steps"}
                  </h2>
                </div>

                <div className="space-y-3">
                  {onboardingSummary.checklist.map((item) => (
                    <div
                      key={item.id}
                      className={cn(
                        "flex items-center justify-between rounded-xl border px-4 py-4",
                        item.completed
                          ? "border-emerald-200 bg-emerald-50"
                          : "border-border/70 bg-secondary/35"
                      )}
                    >
                      <span className="text-sm font-medium text-foreground">
                        {checklistLabels[item.id as keyof typeof checklistLabels] ?? item.label}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]",
                          item.completed
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-white text-muted-foreground"
                        )}
                      >
                        {item.completed
                          ? locale === "uz"
                            ? "Bajarildi"
                            : "Done"
                          : locale === "uz"
                            ? "Keyingi"
                            : "Next"}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {gamificationSummary ? (
          <Card className="border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(249,250,255,0.98))]">
            <CardContent className="space-y-5 p-7">
              <div className="space-y-2">
                <Badge variant="outline">{dashboardCopy.badgeShowcase}</Badge>
                <h2 className="section-title">
                  {locale === "uz" ? "XP, streak va badge progressi" : "XP, streak, and badge progress"}
                </h2>
                <p className="text-sm leading-7 text-muted-foreground">{dashboardCopy.badgeHint}</p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl bg-secondary/45 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{dashboardCopy.xp}</p>
                  <p className="mt-2 font-display text-[2rem] font-semibold leading-none text-foreground">
                    {gamificationSummary.totalXp}
                  </p>
                </div>
                <div className="rounded-xl bg-secondary/45 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{dashboardCopy.level}</p>
                  <p className="mt-2 font-display text-[2rem] font-semibold leading-none text-foreground">
                    {gamificationSummary.level}
                    <span className="ml-2 text-base font-medium text-muted-foreground">
                      {gamificationSummary.levelTitle}
                    </span>
                  </p>
                </div>
                <div className="rounded-xl bg-secondary/45 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{dashboardCopy.streak}</p>
                  <p className="mt-2 inline-flex items-center gap-2 font-display text-[2rem] font-semibold leading-none text-foreground">
                    <Flame className="h-5 w-5 text-orange-500" />
                    {gamificationSummary.streak}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{locale === "uz" ? "Keyingi level progressi" : "Next level progress"}</span>
                  <span>
                    {gamificationSummary.currentLevelXp}/{gamificationSummary.nextLevelXp}
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#f59e0b,#ef4444)]"
                    style={{
                      width: `${Math.max(
                        0,
                        Math.min(
                          (gamificationSummary.currentLevelXp / Math.max(gamificationSummary.nextLevelXp, 1)) * 100,
                          100
                        )
                      )}%`
                    }}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {gamificationSummary.badges.length > 0 ? (
                  gamificationSummary.badges.map((badgeItem) => (
                    <div key={badgeItem.id} className="rounded-xl border border-border/70 bg-white px-4 py-4">
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                        <Trophy className="h-4 w-4" />
                      </div>
                      <p className="mt-3 text-sm font-semibold text-foreground">{badgeItem.title}</p>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {badgeItem.description ?? (locale === "uz" ? "Badge qo'lga kiritildi." : "Badge earned.")}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-border/70 bg-secondary/25 px-4 py-4 text-sm text-muted-foreground">
                    {locale === "uz"
                      ? "Birinchi badge ni olish uchun bitta darsni yakunlang."
                      : "Complete one lesson to earn your first badge."}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {analyticsSummary ? (
          <StudentAnalyticsDashboard analytics={analyticsSummary} locale={locale} />
        ) : null}

        <div className="space-y-4">
          <div className="space-y-2">
            <Badge variant="outline">{dashboardCopy.yourCourses}</Badge>
            <h2 className="section-title">{dashboardCopy.trackProgress}</h2>
          </div>

          {enrollments.length === 0 ? (
            <EmptyState
              title={t.myLearning.emptyTitle}
              description={t.myLearning.emptyDescription}
              actionLabel={t.myLearning.browseCourses}
              actionHref="/courses"
            />
          ) : (
            <div className="grid gap-6 xl:grid-cols-2">
              {enrollments.map((enrollment) => (
                <Card
                  key={enrollment.id}
                  className="overflow-hidden border-border/70 bg-white transition-all duration-200 hover:-translate-y-1 hover:shadow-panel"
                >
                  <CardHeader className="space-y-5 border-b border-border/70 bg-[linear-gradient(180deg,rgba(249,250,255,1),rgba(255,255,255,0.98))] p-7">
                    <div className="flex flex-wrap gap-2">
                      <Badge>{enrollment.course.category.subject.name}</Badge>
                      <Badge variant="outline">{enrollment.course.category.name}</Badge>
                    </div>
                    <div className="space-y-2">
                      <CardTitle className="sm:text-[1.65rem]">
                        {enrollment.course.title}
                      </CardTitle>
                      <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
                        {enrollment.course.shortDescription ?? t.courses.selectedCourseFallback}
                      </p>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-6 p-7">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                        <GraduationCap className="h-4 w-4 text-primary" />
                        {enrollment.course.instructor.name}
                      </div>
                      <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                        <BookOpen className="h-4 w-4 text-primary" />
                        {formatLessonSummary(enrollment.course._count.lessons, locale)}
                      </div>
                      <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock3 className="h-4 w-4 text-primary" />
                        {formatDurationSummary(enrollment.course.durationMinutes, locale)}
                      </div>
                      <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                        <Sparkles className="h-4 w-4 text-primary" />
                        {enrollment.progress}% {t.myLearning.complete}
                      </div>
                    </div>

                    <div className="rounded-xl bg-secondary/45 p-4">
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>{dashboardCopy.averageProgress}</span>
                        <span>{enrollment.progress}%</span>
                      </div>
                      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white">
                        <div
                          className="h-full rounded-full bg-primary transition-[width] duration-300"
                          style={{ width: `${Math.max(0, Math.min(enrollment.progress, 100))}%` }}
                        />
                      </div>
                      <p className="mt-3 text-sm text-muted-foreground">
                        {t.myLearning.lastUpdated}{" "}
                        {enrollment.updatedAt.toLocaleDateString(locale === "uz" ? "uz-UZ" : "en-US")}
                      </p>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row">
                      <Link
                        href={
                          enrollment.course.currentLesson?.slug
                            ? `/courses/${enrollment.course.slug}/lessons/${enrollment.course.currentLesson.slug}`
                            : `/courses/${enrollment.course.slug}`
                        }
                        className={cn(buttonVariants({ size: "lg" }), "w-full")}
                      >
                        {dashboardCopy.continueCourse}
                      </Link>
                      <Link
                        href="/courses"
                        className={cn(buttonVariants({ size: "lg", variant: "outline" }), "w-full")}
                      >
                        {dashboardCopy.browseMore}
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </Container>
    </Section>
  );
}
