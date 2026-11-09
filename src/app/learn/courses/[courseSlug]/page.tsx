import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Circle, CirclePlay } from "lucide-react";

import { LessonModeBanner } from "@/components/education/lesson-mode-banner";
import { WorkspacePage } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { AccessDenied } from "@/components/shared/access-denied";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/feedback";
import { ListPanel, SectionHeader } from "@/components/workspace/workspace-ui";
import { getLocale } from "@/lib/i18n-server";
import { cn } from "@/lib/utils";
import { getStudentCourse } from "@/server/student";
import { requireSignedIn } from "@/server/workspace";

export const metadata: Metadata = { title: "Course", robots: { index: false } };
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ courseSlug: string }> };

const copy = {
  en: {
    enrolled: "Enrolled",
    progress: "Course progress",
    lessonsDone: (done: number, total: number) => `${done} of ${total} lessons completed`,
    continue: "Continue course",
    start: "Start course",
    by: "Instructor",
    learn: "What you'll learn",
    curriculum: "Lessons",
    noLessons: "Your teacher is preparing the first lesson.",
    lessons: "Lessons",
    completed: "Completed",
    notEnrolledTitle: (course: string) => `You're not enrolled in ${course}`,
    notEnrolledBody: "Enroll on the course page to open its lessons and ERA Tutor.",
    goToCourse: "Go to the course page",
    blockedTitle: (course: string) => `Access to ${course} is paused`,
    myCourses: "See my enrollments"
  },
  uz: {
    enrolled: "Yozilgansiz",
    progress: "Kurs bo'yicha natija",
    lessonsDone: (done: number, total: number) => `${total} ta darsdan ${done} tasi tugatildi`,
    continue: "Kursni davom ettirish",
    start: "Kursni boshlash",
    by: "O'qituvchi",
    learn: "Nimalarni o'rganasiz",
    curriculum: "Darslar",
    noLessons: "O'qituvchingiz birinchi darsni tayyorlamoqda.",
    lessons: "Darslar",
    completed: "Tugatilgan",
    notEnrolledTitle: (course: string) => `Siz ${course} kursiga yozilmagansiz`,
    notEnrolledBody: "Darslar va ERA Tutorni ochish uchun kurs sahifasida yoziling.",
    goToCourse: "Kurs sahifasiga o'tish",
    blockedTitle: (course: string) => `${course} kursiga kirish to'xtatilgan`,
    myCourses: "Yozilishlarimni ko'rish"
  }
};

export default async function LearnCoursePage({ params }: PageProps) {
  const { courseSlug } = await params;
  const user = await requireSignedIn(`/learn/courses/${courseSlug}`);
  const [locale, { access, course }] = await Promise.all([getLocale(), getStudentCourse(user, courseSlug)]);
  const t = copy[locale];

  if (access.status === "not-found") {
    notFound();
  }

  const workspace = user.role === "STUDENT" ? "student" : user.role === "ADMIN" ? "admin" : "teacher";

  if (access.status === "access-blocked") {
    return (
      <WorkspaceShell workspace={workspace}>
        <WorkspacePage width="narrow">
          <AccessDenied
            title={t.blockedTitle(access.courseTitle)}
            description={access.message}
            action={
              <Link href="/learn/courses" className={cn(buttonVariants({ variant: "outline" }))}>
                {t.myCourses}
              </Link>
            }
          />
        </WorkspacePage>
      </WorkspaceShell>
    );
  }

  if (access.status === "not-enrolled" || !course) {
    return (
      <WorkspaceShell workspace={workspace}>
        <WorkspacePage width="narrow">
          <AccessDenied
            title={t.notEnrolledTitle(access.status === "not-enrolled" ? access.courseTitle : "")}
            description={t.notEnrolledBody}
            action={
              <Link href={`/courses/${courseSlug}`} className={cn(buttonVariants({ variant: "outline" }))}>
                {t.goToCourse}
              </Link>
            }
          />
        </WorkspacePage>
      </WorkspaceShell>
    );
  }

  const totalLessons = course.groups.reduce((sum, group) => sum + group.lessons.length, 0);

  return (
    <WorkspaceShell workspace={workspace}>
      {access.status === "ok" && access.mode !== "student" ? <LessonModeBanner mode={access.mode} locale={locale} /> : null}
      <WorkspacePage className="flex flex-col gap-8">
        <PageHeader
          breadcrumbs={[{ label: t.lessons, href: "/learn/courses" }, { label: course.title }]}
          eyebrow={access.status === "ok" && access.mode === "student" ? <Badge variant="success">{t.enrolled}</Badge> : undefined}
          title={course.title}
          description={course.subtitle ?? course.shortDescription ?? undefined}
          actions={
            course.resumeLessonSlug ? (
              <Link href={`/learn/courses/${course.slug}/lessons/${course.resumeLessonSlug}`} className={cn(buttonVariants({ size: "lg" }))}>
                <CirclePlay />
                {course.progress > 0 ? t.continue : t.start}
              </Link>
            ) : undefined
          }
        />

        <div className="grid gap-8 lg:grid-cols-[1fr,18rem]">
          <div className="flex flex-col gap-8">
            {course.description ? <p className="section-copy whitespace-pre-line">{course.description}</p> : null}

            <section className="flex flex-col gap-4">
              <SectionHeader title={t.curriculum} />
              {totalLessons === 0 ? (
                <EmptyState title={t.noLessons} description="" />
              ) : (
                course.groups.map((group) => (
                  <div key={group.id} className="flex flex-col gap-2">
                    {group.title ? <h3 className="card-title">{group.title}</h3> : null}
                    <ListPanel label={group.title || t.lessons}>
                      {group.lessons.map((lesson) => (
                        <li key={lesson.id}>
                          <Link
                            href={`/learn/courses/${course.slug}/lessons/${lesson.slug}`}
                            className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                          >
                            {lesson.completed ? (
                              <CheckCircle2 className="size-4 shrink-0 text-success" aria-label={t.completed} />
                            ) : (
                              <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                            )}
                            <span className="min-w-0 flex-1 truncate text-sm font-medium">{lesson.title}</span>
                            {lesson.duration ? <span className="text-xs text-muted-foreground">{lesson.duration}</span> : null}
                          </Link>
                        </li>
                      ))}
                    </ListPanel>
                  </div>
                ))
              )}
            </section>
          </div>

          <aside className="flex h-fit flex-col gap-5 rounded-xl border border-border bg-card p-4">
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">{t.progress}</p>
              <Progress value={course.progress} label={t.progress} />
              <p className="text-sm">{t.lessonsDone(course.completedCount, totalLessons)}</p>
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground">{t.by}</p>
              <p className="text-sm font-medium">{course.instructor.name}</p>
              {course.instructor.title ? <p className="text-xs text-muted-foreground">{course.instructor.title}</p> : null}
            </div>
            {course.outcomes.length > 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground">{t.learn}</p>
                <ul className="flex list-disc flex-col gap-1 pl-5 text-sm marker:text-muted-foreground">
                  {course.outcomes.map((outcome) => (
                    <li key={outcome}>{outcome}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        </div>
      </WorkspacePage>
    </WorkspaceShell>
  );
}
