import { AlertTriangle, BookOpen, CheckCircle2, ChevronRight } from "lucide-react";

import type { Workspace } from "@/components/management/enrollment-forms";
import { CourseOrderButtons, CreateCourseButton, LessonEditorButton } from "@/components/management/teaching-forms";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import type { ManagementActor } from "@/server/management/actor";
import { listInstructorsForActor } from "@/server/management/queries";
import { listTeachingCourses } from "@/server/management/teaching";
import { getT } from "@/lib/i18n-server";

/*
 * Courses & lessons (docs/ERA_TEACHER_HOMEWORK.md): each course is a list of lessons, and each lesson records what
 * was taught and the homework. This is what the student profile shows next to each student's homework check.
 */
export async function TeachingCoursesView({ actor, workspace }: { actor: ManagementActor; workspace: Workspace }) {
  const T = await getT();
  const [courses, instructors] = await Promise.all([listTeachingCourses(actor), actor.kind === "admin" ? listInstructorsForActor(actor) : Promise.resolve([])]);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <CreateCourseButton workspace={workspace} instructors={instructors.map((instructor) => ({ id: instructor.id, name: instructor.name }))} />
      </div>

      {courses.length ? (
        // Minimal list: each course is one row; open it to see and edit its lessons, open a lesson to read it.
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {courses.map((course, index) => {
            const missing = course.lessons.filter((lesson) => !lesson.homework).length;
            return (
              <li key={course.id}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden="true" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-medium">{course.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {T("{lessons} lessons · {students} active students", { lessons: course.lessons.length, students: course.activeStudents })}
                      </span>
                    </span>
                    {missing ? (
                      <Badge variant="warning" className="shrink-0" title={T("{count} without homework", { count: missing })}>
                        <span className="hidden sm:inline">{T("{count} without homework", { count: missing })}</span>
                        <span className="flex items-center gap-1 sm:hidden">
                          <AlertTriangle className="size-3" aria-hidden="true" />
                          {missing}
                        </span>
                      </Badge>
                    ) : course.lessons.length ? (
                      <CheckCircle2 className="size-4 shrink-0 text-success" aria-label={T("All lessons have homework")} />
                    ) : null}
                  </summary>

                  <div className="flex flex-col gap-3 border-t border-border bg-surface px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">{course.instructor.name}</span>
                      <span className="flex flex-wrap items-center gap-1">
                        <CourseOrderButtons workspace={workspace} order={courses.map((item) => item.id)} index={index} />
                        <LessonEditorButton workspace={workspace} courseId={course.id} mode="add" />
                      </span>
                    </div>
                    {course.lessons.length ? (
                      <ol className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
                        {course.lessons.map((lesson) => (
                          <li key={lesson.id}>
                            <details className="group/lesson">
                              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
                                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open/lesson:rotate-90" aria-hidden="true" />
                                <span className="min-w-0 flex-1">
                                  {lesson.position}. {lesson.title}
                                </span>
                                {lesson.homework ? (
                                  <CheckCircle2 className="size-3.5 shrink-0 text-success" aria-label={T("Homework")} />
                                ) : (
                                  <AlertTriangle className="size-3.5 shrink-0 text-warning" aria-label={T("No homework yet")} />
                                )}
                              </summary>
                              <div className="flex flex-col gap-2 border-t border-border px-3 py-3 text-sm">
                                <div className="grid gap-3 md:grid-cols-2">
                                  <div>
                                    <p className="text-xs font-medium text-muted-foreground">{T("What I taught")}</p>
                                    <p className="whitespace-pre-wrap">{lesson.taughtSummary || "—"}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs font-medium text-muted-foreground">{T("Homework")}</p>
                                    <p className="whitespace-pre-wrap">{lesson.homework || "—"}</p>
                                  </div>
                                </div>
                                <div>
                                  <LessonEditorButton workspace={workspace} courseId={course.id} mode="edit" lesson={lesson} />
                                </div>
                              </div>
                            </details>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="text-sm text-muted-foreground">{T("No lessons yet. Use Add lesson.")}</p>
                    )}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={<BookOpen />} title={T("No courses yet")} description={T("Create your first course, for example Machine Learning Foundation with 11 lessons.")} />
      )}
    </div>
  );
}
