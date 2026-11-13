import { BookOpen } from "lucide-react";

import type { Workspace } from "@/components/management/enrollment-forms";
import { CreateCourseButton, LessonEditorButton } from "@/components/management/teaching-forms";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import type { ManagementActor } from "@/server/management/actor";
import { listInstructorsForActor } from "@/server/management/queries";
import { listTeachingCourses } from "@/server/management/teaching";

/*
 * Courses & lessons (docs/ERA_TEACHER_HOMEWORK.md): each course is a list of lessons, and each lesson records what
 * was taught and the homework. This is what the student profile shows next to each student's homework check.
 */
export async function TeachingCoursesView({ actor, workspace }: { actor: ManagementActor; workspace: Workspace }) {
  const [courses, instructors] = await Promise.all([listTeachingCourses(actor), actor.kind === "admin" ? listInstructorsForActor(actor) : Promise.resolve([])]);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {actor.kind === "admin" ? "All courses." : "Your courses."} Write what you taught and the homework for each lesson; they appear next to every
          student&apos;s homework check.
        </p>
        <CreateCourseButton workspace={workspace} instructors={instructors.map((instructor) => ({ id: instructor.id, name: instructor.name }))} />
      </div>

      {courses.length ? (
        <ul className="flex flex-col gap-6">
          {courses.map((course) => {
            const missing = course.lessons.filter((lesson) => !lesson.homework).length;
            return (
              <li key={course.id} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <h2 className="card-title">{course.title}</h2>
                    <p className="text-xs text-muted-foreground">
                      {course.lessons.length} lesson{course.lessons.length === 1 ? "" : "s"} · {course.activeStudents} active student
                      {course.activeStudents === 1 ? "" : "s"} · {course.instructor.name}
                    </p>
                  </div>
                  <span className="flex flex-wrap items-center gap-2">
                    {missing ? <Badge variant="warning">{missing} without homework</Badge> : <Badge variant="success">All lessons have homework</Badge>}
                    <LessonEditorButton workspace={workspace} courseId={course.id} mode="add" />
                  </span>
                </div>
                {course.lessons.length ? (
                  <ol className="flex flex-col divide-y divide-border rounded-lg border border-border">
                    {course.lessons.map((lesson) => (
                      <li key={lesson.id} className="flex flex-col gap-2 p-3 md:flex-row md:items-start md:justify-between">
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="font-medium">
                            {lesson.position}. {lesson.title}
                          </span>
                          <div className="grid gap-2 text-sm md:grid-cols-2">
                            <p className="whitespace-pre-wrap text-muted-foreground">
                              <span className="font-medium text-foreground">Taught: </span>
                              {lesson.taughtSummary || "—"}
                            </p>
                            <p className="whitespace-pre-wrap text-muted-foreground">
                              <span className="font-medium text-foreground">Homework: </span>
                              {lesson.homework || "—"}
                            </p>
                          </div>
                        </div>
                        <LessonEditorButton workspace={workspace} courseId={course.id} mode="edit" lesson={lesson} />
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-muted-foreground">No lessons yet. Use Add lesson.</p>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={<BookOpen />} title="No courses yet" description="Create your first course, for example Machine Learning Foundation with 11 lessons." />
      )}
    </div>
  );
}
