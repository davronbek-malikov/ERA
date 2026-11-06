import type { Metadata } from "next";
import Link from "next/link";
import { BookOpenCheck, Eye, FileText, ListChecks, PlayCircle, Plus, SquareCode } from "lucide-react";

import { CourseStatusBadge } from "@/components/education/course-status";
import { WorkspacePage } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Select } from "@/components/ui/select";
import { ListPanel, ListRow, SectionHeader } from "@/components/workspace/workspace-ui";
import { formatRelativeDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getTeacherLessonBoard } from "@/server/teacher";
import { getTeacherInstructorId, requireTeacher } from "@/server/workspace";

export const metadata: Metadata = { title: "Lessons", robots: { index: false } };
export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ course?: string }> };
type Board = Awaited<ReturnType<typeof getTeacherLessonBoard>>;
type BoardLesson = Board["unassigned"][number];

function ContentIndicators({ lesson }: { lesson: BoardLesson }) {
  const items = [
    { on: Boolean(lesson.videoUrl), label: "Video", icon: <PlayCircle /> },
    { on: Boolean(lesson.content), label: "Notes", icon: <FileText /> },
    { on: lesson._count.quizQuestions > 0, label: `Quiz (${lesson._count.quizQuestions})`, icon: <ListChecks /> },
    { on: lesson._count.practiceExercises > 0, label: `Practice (${lesson._count.practiceExercises})`, icon: <SquareCode /> }
  ];

  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Lesson content">
      {items.map((item) => (
        <li
          key={item.label}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs [&_svg]:size-3.5",
            item.on ? "bg-success/10 text-success" : "bg-muted text-muted-foreground line-through decoration-muted-foreground/40"
          )}
        >
          {item.icon}
          <span>
            {item.label}
            <span className="sr-only">{item.on ? ": added" : ": missing"}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function LessonRows({ lessons, courseSlug }: { lessons: BoardLesson[]; courseSlug: string }) {
  return (
    <ListPanel label="Lessons">
      {lessons.map((lesson) => (
        <ListRow key={lesson.id} className="items-start md:items-center">
          <span className="w-6 shrink-0 pt-0.5 text-sm tabular-nums text-muted-foreground md:pt-0">{lesson.position}</span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <p className="truncate font-medium">{lesson.title}</p>
            <ContentIndicators lesson={lesson} />
          </div>
          <span className="hidden text-xs text-muted-foreground lg:inline">Updated {formatRelativeDate(lesson.updatedAt)}</span>
          <CourseStatusBadge status={lesson.status} />
          <div className="flex gap-1">
            <Link
              href={`/learn/courses/${courseSlug}/lessons/${lesson.slug}`}
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
              aria-label={`Preview ${lesson.title} as students see it`}
            >
              <Eye />
              Preview
            </Link>
            <Link href={`/admin/lessons?edit=${lesson.id}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))} aria-label={`Edit ${lesson.title}`}>
              Edit
            </Link>
          </div>
        </ListRow>
      ))}
    </ListPanel>
  );
}

export default async function TeacherLessonsPage({ searchParams }: PageProps) {
  const user = await requireTeacher("/teacher/lessons");
  const [params, instructorId] = await Promise.all([searchParams, getTeacherInstructorId(user)]);
  const board = instructorId ? await getTeacherLessonBoard(instructorId, params.course) : null;
  const lessonCount = board ? board.modules.reduce((sum, module) => sum + module.lessons.length, 0) + board.unassigned.length : 0;

  return (
    <WorkspaceShell workspace="teacher">
      <WorkspacePage className="flex flex-col gap-6">
        <PageHeader
          breadcrumbs={[{ label: "Teacher", href: "/teacher" }, { label: "Lessons" }]}
          title="Lessons"
          description="Organise lessons by module, check what each lesson contains, and preview it as students will see it."
          actions={
            <Link href="/admin/lessons" className={cn(buttonVariants())}>
              <Plus />
              New lesson
            </Link>
          }
        />

        {!board ? (
          <Alert variant="warning" title="Your account isn't linked to a teacher profile yet">
            Ask an administrator to link your account. Until then no lessons are shown.
          </Alert>
        ) : !board.selected ? (
          <EmptyState icon={<BookOpenCheck />} title="No courses yet" description="Create a course first, then add lessons to it." actionLabel="Create course" actionHref="/admin/courses" />
        ) : (
          <>
            <form action="/teacher/lessons" method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex flex-col gap-1.5 sm:w-80">
                <span className="text-xs font-medium text-muted-foreground">Course</span>
                <Select name="course" defaultValue={board.selected.id}>
                  {board.courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                    </option>
                  ))}
                </Select>
              </label>
              <Button type="submit" variant="outline">
                Show lessons
              </Button>
            </form>

            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <CourseStatusBadge status={board.selected.status} />
              <span>
                {lessonCount} lessons in {board.modules.length} modules
              </span>
            </div>

            {lessonCount === 0 ? (
              <EmptyState title="This course has no lessons yet" description="Add the first lesson to start building the course." actionLabel="Create lesson" actionHref="/admin/lessons" />
            ) : (
              <div className="flex flex-col gap-8">
                {board.modules.map((module) => (
                  <section key={module.id} className="flex flex-col gap-3">
                    <SectionHeader
                      title={`${module.position}. ${module.title}`}
                      description={module.description ?? undefined}
                    />
                    {module.lessons.length > 0 ? (
                      <LessonRows lessons={module.lessons} courseSlug={board.selected!.slug} />
                    ) : (
                      <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">No lessons in this module yet.</p>
                    )}
                  </section>
                ))}
                {board.unassigned.length > 0 ? (
                  <section className="flex flex-col gap-3">
                    <SectionHeader title="Not in a module" description="Lessons that aren't assigned to a module yet." />
                    <LessonRows lessons={board.unassigned} courseSlug={board.selected.slug} />
                  </section>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Creating and reordering modules isn&apos;t available in the editor yet. Lessons are edited in the lesson editor.
                </p>
              </div>
            )}
          </>
        )}
      </WorkspacePage>
    </WorkspaceShell>
  );
}
