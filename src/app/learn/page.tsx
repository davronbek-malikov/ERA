import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, CheckCircle2, CirclePlay, ClipboardList, PlayCircle, Sparkles, XCircle } from "lucide-react";

import { WorkspacePage } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/feedback";
import { ListPanel, ListRow, SectionHeader, StatStrip } from "@/components/workspace/workspace-ui";
import { formatRelativeDate } from "@/lib/format";
import { getLocale } from "@/lib/i18n-server";
import { cn } from "@/lib/utils";
import { getStudentDashboard } from "@/server/student";
import { requireStudent } from "@/server/workspace";

export const metadata: Metadata = { title: "My learning", robots: { index: false } };
export const dynamic = "force-dynamic";

const copy = {
  en: {
    welcome: (name: string) => `Welcome back, ${name}`,
    lead: "Pick up where you left off. ERA Tutor is available inside every lesson.",
    continue: "Continue learning",
    resume: "Resume lesson",
    start: "Start learning",
    lessonOf: (title: string) => `Next: ${title}`,
    lastStudied: (when: string) => `Last studied ${when}`,
    myCourses: "My courses",
    allCourses: "All my courses",
    browse: "Browse courses",
    noCourses: "You haven't started a course yet",
    noCoursesBody: "Enroll in a course to start learning with ERA Tutor beside you.",
    assignments: "Upcoming assignments",
    noAssignments: "No homework yet",
    noAssignmentsBody: "Your teachers' homework will appear here once ERA supports it.",
    feedback: "Recent feedback",
    noFeedback: "No feedback yet",
    noFeedbackBody: "Results from practice exercises in your lessons will appear here.",
    passed: "Passed",
    tryAgain: "Try again",
    tests: (passed: number, total: number) => `${passed}/${total} checks`,
    progress: "Learning progress",
    lessonsDone: "Lessons completed",
    coursesActive: "Courses",
    overall: "Overall",
    history: "Study history",
    noHistory: "Your study sessions will appear here.",
    tutorTitle: "ERA Tutor",
    tutorBody: "Ask questions while you watch any lesson: explanations, examples and translations, without leaving the video.",
    openLesson: "Open a lesson",
    courseProgress: "Course progress"
  },
  uz: {
    welcome: (name: string) => `Xush kelibsiz, ${name}`,
    lead: "Qolgan joyingizdan davom eting. ERA Tutor har bir darsda yoningizda.",
    continue: "O'qishni davom ettirish",
    resume: "Darsni davom ettirish",
    start: "O'qishni boshlash",
    lessonOf: (title: string) => `Keyingisi: ${title}`,
    lastStudied: (when: string) => `Oxirgi marta ${when}`,
    myCourses: "Kurslarim",
    allCourses: "Barcha kurslarim",
    browse: "Kurslarni ko'rish",
    noCourses: "Hali kursni boshlamagansiz",
    noCoursesBody: "ERA Tutor bilan o'qishni boshlash uchun kursga yoziling.",
    assignments: "Yaqinlashayotgan topshiriqlar",
    noAssignments: "Hozircha uy vazifasi yo'q",
    noAssignmentsBody: "ERA uy vazifalarini qo'llab-quvvatlagach, o'qituvchilaringiz topshiriqlari shu yerda chiqadi.",
    feedback: "So'nggi natijalar",
    noFeedback: "Hozircha natija yo'q",
    noFeedbackBody: "Darslardagi amaliy mashqlar natijalari shu yerda chiqadi.",
    passed: "O'tdi",
    tryAgain: "Qayta urinib ko'ring",
    tests: (passed: number, total: number) => `${passed}/${total} tekshiruv`,
    progress: "O'qish natijalari",
    lessonsDone: "Tugatilgan darslar",
    coursesActive: "Kurslar",
    overall: "Umumiy",
    history: "O'qish tarixi",
    noHistory: "O'qish mashg'ulotlaringiz shu yerda chiqadi.",
    tutorTitle: "ERA Tutor",
    tutorBody: "Har qanday darsni ko'rayotib savol bering: tushuntirish, misol va tarjima, videoni tark etmasdan.",
    openLesson: "Darsni ochish",
    courseProgress: "Kurs bo'yicha natija"
  }
};

export default async function LearnDashboardPage() {
  const user = await requireStudent("/learn");
  const [locale, data] = await Promise.all([getLocale(), getStudentDashboard(user.id)]);
  const t = copy[locale];
  const next = data.continueCourse;
  const overall = data.totalLessons === 0 ? 0 : Math.round((data.completedCount / data.totalLessons) * 100);

  return (
    <WorkspaceShell workspace="student">
      <WorkspacePage className="flex flex-col gap-8">
        <PageHeader title={t.welcome(user.name.split(" ")[0])} description={t.lead} />

        {next && next.resumeLesson ? (
          <section aria-labelledby="continue-heading" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:p-6">
            <div
              aria-hidden="true"
              className="flex aspect-video w-full shrink-0 items-center justify-center rounded-lg bg-primary bg-cover bg-center text-primary-foreground sm:w-48"
              style={next.thumbnailUrl ? { backgroundImage: `url(${next.thumbnailUrl})` } : undefined}
            >
              {next.thumbnailUrl ? null : <PlayCircle className="size-8 opacity-80" />}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <p id="continue-heading" className="eyebrow-label text-primary">
                {t.continue}
              </p>
              <h2 className="section-title truncate">{next.title}</h2>
              <p className="truncate text-sm text-muted-foreground">{t.lessonOf(next.resumeLesson.title)}</p>
              <div className="flex items-center gap-3">
                <Progress value={next.progress} label={t.courseProgress} className="max-w-xs" />
                <span className="text-xs tabular-nums text-muted-foreground">{next.progress}%</span>
              </div>
              <p className="text-xs text-muted-foreground">{t.lastStudied(formatRelativeDate(next.lastStudiedAt, locale))}</p>
            </div>
            <Link
              href={`/learn/courses/${next.slug}/lessons/${next.resumeLesson.slug}`}
              className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}
            >
              <CirclePlay />
              {next.progress > 0 ? t.resume : t.start}
            </Link>
          </section>
        ) : null}

        <StatStrip
          metrics={[
            { label: t.coursesActive, value: data.courses.length },
            { label: t.lessonsDone, value: data.completedCount, hint: `${data.totalLessons}` },
            { label: t.overall, value: `${overall}%` }
          ]}
        />

        <section className="flex flex-col gap-3">
          <SectionHeader
            title={t.myCourses}
            action={
              data.courses.length > 0 ? (
                <Link href="/learn/courses" className="text-sm font-medium text-primary hover:underline">
                  {t.allCourses}
                </Link>
              ) : undefined
            }
          />
          {data.courses.length === 0 ? (
            <EmptyState icon={<BookOpen />} title={t.noCourses} description={t.noCoursesBody} actionLabel={t.browse} actionHref="/courses" />
          ) : (
            <ListPanel label={t.myCourses}>
              {data.courses.slice(0, 4).map((course) => (
                <ListRow key={course.id}>
                  <Link href={`/learn/courses/${course.slug}`} className="min-w-0 flex-1">
                    <span className="block truncate font-medium hover:text-primary">{course.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{course.instructorName}</span>
                  </Link>
                  <div className="flex w-full items-center gap-3 sm:w-48">
                    <Progress value={course.progress} label={`${t.courseProgress}: ${course.title}`} />
                    <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{course.progress}%</span>
                  </div>
                </ListRow>
              ))}
            </ListPanel>
          )}
        </section>

        <div className="grid gap-8 lg:grid-cols-2">
          <section className="flex flex-col gap-3">
            <SectionHeader title={t.assignments} />
            <EmptyState icon={<ClipboardList />} title={t.noAssignments} description={t.noAssignmentsBody} />
          </section>

          <section className="flex flex-col gap-3">
            <SectionHeader title={t.feedback} />
            {data.feedback.length === 0 ? (
              <EmptyState title={t.noFeedback} description={t.noFeedbackBody} />
            ) : (
              <ListPanel label={t.feedback}>
                {data.feedback.map((item) => (
                  <ListRow key={item.id} className="flex-nowrap items-start">
                    {item.status === "PASSED" ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                    ) : (
                      <XCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    )}
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/learn/courses/${item.exercise.lesson.course.slug}/lessons/${item.exercise.lesson.slug}`}
                        className="block truncate text-sm font-medium hover:text-primary"
                      >
                        {item.exercise.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {item.status === "PASSED" ? t.passed : t.tryAgain} · {t.tests(item.passedCount, item.totalTests)} ·{" "}
                        {formatRelativeDate(item.createdAt, locale)}
                      </p>
                    </div>
                  </ListRow>
                ))}
              </ListPanel>
            )}
          </section>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr,20rem]">
          <section className="flex flex-col gap-3">
            <SectionHeader title={t.history} />
            {data.history.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">{t.noHistory}</p>
            ) : (
              <ListPanel label={t.history}>
                {data.history.map((event) => (
                  <ListRow key={event.id}>
                    <span className="min-w-0 flex-1 truncate text-sm">{event.message}</span>
                    <span className="text-xs text-muted-foreground">{formatRelativeDate(event.createdAt, locale)}</span>
                  </ListRow>
                ))}
              </ListPanel>
            )}
          </section>

          <aside className="flex h-fit flex-col gap-2 rounded-xl border border-accent-strong/20 bg-accent p-4">
            <p className="flex items-center gap-2 font-medium text-accent-foreground">
              <Sparkles className="size-4" aria-hidden="true" />
              {t.tutorTitle}
            </p>
            <p className="text-sm text-accent-foreground">{t.tutorBody}</p>
            {next?.resumeLesson ? (
              <Link
                href={`/learn/courses/${next.slug}/lessons/${next.resumeLesson.slug}`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "self-start")}
              >
                {t.openLesson}
              </Link>
            ) : null}
          </aside>
        </div>
      </WorkspacePage>
    </WorkspaceShell>
  );
}
