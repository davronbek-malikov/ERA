import Link from "next/link";
import {
  AlertCircle,
  BarChart3,
  BookCheck,
  Clock3,
  ArrowRight
} from "lucide-react";

import type { StudentAnalyticsSummary } from "@/server/analytics";
import { formatDurationSummary, formatLessonSummary } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type StudentAnalyticsDashboardProps = {
  analytics: StudentAnalyticsSummary;
  locale: "en" | "uz";
};

export function StudentAnalyticsDashboard({
  analytics,
  locale
}: StudentAnalyticsDashboardProps) {
  const maxWeeklyMinutes = Math.max(...analytics.weeklyActivity.map((item) => item.minutes), 1);
  const copy =
    locale === "uz"
      ? {
          badge: "Analytics",
          title: "O'qish bo'yicha insight dashboard",
          subtitle:
            "Vaqt, bajarilgan darslar, kurs progressi va sust joylarni bir joyda ko'ring.",
          totalTime: "Jami o'qish vaqti",
          completedLessons: "Yakunlangan darslar",
          averageProgress: "O'rtacha progress",
          weakAreas: "Sust joylar",
          courseProgress: "Kurslar bo'yicha progress",
          weeklyActivity: "So'nggi 7 kun faolligi",
          viewCourse: "Kursni ochish",
          noWeakAreas: "Hozircha aniq sust joy topilmadi. Shu tempni davom ettiring.",
          minutes: "daq",
          activeCourses: "Faol kurslar",
          lessonsCompleted: "dars yakunlandi"
        }
      : {
          badge: "Analytics",
          title: "Learning insight dashboard",
          subtitle:
            "See your study time, completed lessons, course progress, and weak areas in one place.",
          totalTime: "Total learning time",
          completedLessons: "Completed lessons",
          averageProgress: "Average progress",
          weakAreas: "Weak areas",
          courseProgress: "Progress by course",
          weeklyActivity: "Last 7 days activity",
          viewCourse: "Open course",
          noWeakAreas: "No major weak areas detected yet. Keep your momentum going.",
          minutes: "min",
          activeCourses: "Active courses",
          lessonsCompleted: "lessons completed"
        };

  return (
    <Card className="border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(248,250,255,0.98))]">
      <CardContent className="space-y-7 p-7">
        <div className="space-y-2">
          <Badge variant="outline">{copy.badge}</Badge>
          <h2 className="section-title">{copy.title}</h2>
          <p className="text-sm leading-7 text-muted-foreground">{copy.subtitle}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-[1.4rem] bg-secondary/45 p-4">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Clock3 className="h-4 w-4" />
            </div>
            <p className="mt-4 text-xs uppercase tracking-[0.16em] text-muted-foreground">{copy.totalTime}</p>
            <p className="mt-2 font-display text-[2rem] font-semibold leading-none text-foreground">
              {formatDurationSummary(analytics.totalLearningMinutes, locale)}
            </p>
          </div>
          <div className="rounded-[1.4rem] bg-secondary/45 p-4">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <BookCheck className="h-4 w-4" />
            </div>
            <p className="mt-4 text-xs uppercase tracking-[0.16em] text-muted-foreground">{copy.completedLessons}</p>
            <p className="mt-2 font-display text-[2rem] font-semibold leading-none text-foreground">
              {analytics.completedLessons}
            </p>
          </div>
          <div className="rounded-[1.4rem] bg-secondary/45 p-4">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <BarChart3 className="h-4 w-4" />
            </div>
            <p className="mt-4 text-xs uppercase tracking-[0.16em] text-muted-foreground">{copy.averageProgress}</p>
            <p className="mt-2 font-display text-[2rem] font-semibold leading-none text-foreground">
              {analytics.averageProgress}%
            </p>
          </div>
          <div className="rounded-[1.4rem] bg-secondary/45 p-4">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <AlertCircle className="h-4 w-4" />
            </div>
            <p className="mt-4 text-xs uppercase tracking-[0.16em] text-muted-foreground">{copy.activeCourses}</p>
            <p className="mt-2 font-display text-[2rem] font-semibold leading-none text-foreground">
              {analytics.activeCourses}
            </p>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
          <div className="space-y-4 rounded-[1.5rem] border border-border/70 bg-white p-5">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold text-foreground">{copy.courseProgress}</h3>
              <span className="text-sm text-muted-foreground">
                {formatLessonSummary(analytics.completedLessons, locale)}
              </span>
            </div>
            <div className="space-y-4">
              {analytics.courseProgress.map((course) => (
                <div key={course.courseId} className="rounded-[1.25rem] bg-secondary/30 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{course.courseTitle}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {course.completedLessons}/{course.totalLessons} {copy.lessonsCompleted}
                      </p>
                    </div>
                    <Link
                      href={`/courses/${course.courseSlug}`}
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                    >
                      {copy.viewCourse}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>{copy.averageProgress}</span>
                      <span>{course.progressPercent}%</span>
                    </div>
                    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(0, Math.min(course.progressPercent, 100))}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[1.5rem] border border-border/70 bg-white p-5">
              <h3 className="text-lg font-semibold text-foreground">{copy.weeklyActivity}</h3>
              <div className="mt-5 grid grid-cols-7 items-end gap-3">
                {analytics.weeklyActivity.map((item) => (
                  <div key={item.label} className="flex flex-col items-center gap-3">
                    <div className="flex h-32 items-end">
                      <div
                        className="w-8 rounded-t-2xl bg-[linear-gradient(180deg,#4f46e5,#312e81)]"
                        style={{
                          height: `${Math.max((item.minutes / maxWeeklyMinutes) * 100, item.minutes > 0 ? 16 : 6)}%`
                        }}
                      />
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-medium text-foreground">{item.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.minutes} {copy.minutes}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-border/70 bg-white p-5">
              <h3 className="text-lg font-semibold text-foreground">{copy.weakAreas}</h3>
              <div className="mt-4 space-y-3">
                {analytics.weakAreas.length > 0 ? (
                  analytics.weakAreas.map((item) => (
                    <div key={item.id} className="rounded-[1.25rem] bg-amber-50 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-foreground">{item.title}</p>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">
                          {item.metricLabel}: {item.metricValue}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.reason}</p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[1.25rem] border border-dashed border-border/70 bg-secondary/20 px-4 py-4 text-sm text-muted-foreground">
                    {copy.noWeakAreas}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
