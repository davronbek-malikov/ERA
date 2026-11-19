import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";

import { WorkspacePage } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { MyEnrollmentsSection } from "@/components/management/my-enrollments";
import { EmptyState } from "@/components/shared/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/feedback";
import { formatRelativeDate } from "@/lib/format";
import { getLocale } from "@/lib/i18n-server";
import { cn } from "@/lib/utils";
import { getStudentDashboard } from "@/server/student";
import { requireStudent } from "@/server/workspace";

export const metadata: Metadata = { title: "My courses", robots: { index: false } };
export const dynamic = "force-dynamic";

const copy = {
  en: {
    title: "My courses",
    lead: "Courses you're enrolled in.",
    lessons: (count: number) => `${count} lessons`,
    continue: "Continue",
    overview: "Course page",
    progress: "Course progress",
    lastStudied: (when: string) => `Last studied ${when}`,
    empty: "You haven't enrolled in a course yet",
    emptyBody: "Browse the catalog and enroll to start learning.",
    browse: "Browse courses"
  },
  uz: {
    title: "Kurslarim",
    lead: "Siz yozilgan kurslar.",
    lessons: (count: number) => `${count} ta dars`,
    continue: "Davom ettirish",
    overview: "Kurs sahifasi",
    progress: "Kurs bo'yicha natija",
    lastStudied: (when: string) => `Oxirgi marta ${when}`,
    empty: "Hali hech qaysi kursga yozilmagansiz",
    emptyBody: "O'qishni boshlash uchun katalogdan kurs tanlang.",
    browse: "Kurslarni ko'rish"
  }
};

export default async function LearnCoursesPage() {
  const user = await requireStudent("/learn/courses");
  const [locale, data] = await Promise.all([getLocale(), getStudentDashboard(user.id)]);
  const t = copy[locale];

  return (
    <WorkspaceShell workspace="student">
      <WorkspacePage className="flex flex-col gap-6">
        <PageHeader title={t.title} description={t.lead} />
        {data.courses.length === 0 ? (
          <EmptyState icon={<BookOpen />} title={t.empty} description={t.emptyBody} actionLabel={t.browse} actionHref="/courses" />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.courses.map((course) => (
              <li key={course.id} className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
                <div
                  aria-hidden="true"
                  className="aspect-video w-full bg-muted bg-cover bg-center"
                  style={course.thumbnailUrl ? { backgroundImage: `url(${course.thumbnailUrl})` } : undefined}
                />
                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div className="flex flex-col gap-0.5">
                    <h2 className="card-title">{course.title}</h2>
                    <p className="text-xs text-muted-foreground">
                      {course.instructorName} · {t.lessons(course.lessonCount)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Progress value={course.progress} label={`${t.progress}: ${course.title}`} />
                    <span className="text-xs tabular-nums text-muted-foreground">{course.progress}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{t.lastStudied(formatRelativeDate(course.lastStudiedAt, locale))}</p>
                  <div className="mt-auto flex gap-2">
                    {course.resumeLesson ? (
                      <Link href={`/learn/courses/${course.slug}/lessons/${course.resumeLesson.slug}`} className={cn(buttonVariants({ size: "sm" }))}>
                        {t.continue}
                      </Link>
                    ) : null}
                    <Link href={`/learn/courses/${course.slug}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                      {t.overview}
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <MyEnrollmentsSection userId={user.id} />
      </WorkspacePage>
    </WorkspaceShell>
  );
}
