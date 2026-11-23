import type { Metadata } from "next";
import { ShieldCheck, Users } from "lucide-react";

import { CourseProgressCell, StudentIdentity } from "@/components/education/student-identity";
import { WorkspacePage } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/feedback";
import { DataTable } from "@/components/ui/table";
import { FilterBar } from "@/components/workspace/workspace-ui";
import { formatRelativeDate } from "@/lib/format";
import { getTeacherStudents } from "@/server/teacher";
import { getTeacherInstructorId, requireTeacher } from "@/server/workspace";

export const metadata: Metadata = { title: "Student progress", robots: { index: false } };
export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ q?: string; course?: string }> };

export default async function TeacherStudentsPage({ searchParams }: PageProps) {
  const user = await requireTeacher("/teacher/students");
  const [params, instructorId] = await Promise.all([searchParams, getTeacherInstructorId(user)]);
  const data = instructorId ? await getTeacherStudents(instructorId, { q: params.q, courseId: params.course }) : null;
  const filtered = Boolean(params.q || params.course);

  return (
    <WorkspaceShell workspace="teacher">
      <WorkspacePage className="flex flex-col gap-6">
        <PageHeader
          breadcrumbs={[{ label: "Teacher", href: "/teacher" }, { label: "Progress" }]}
          title="Student progress"
          description="Students enrolled in your courses, with their progress in those courses only."
        />

        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent-strong" aria-hidden="true" />
          ERA Tutor conversations are private to each student and never appear here. Contact details aren&apos;t shown.
        </p>

        {!data ? (
          <Alert variant="warning" title="Your account isn't linked to a teacher profile yet">
            Ask an administrator to link your account.
          </Alert>
        ) : (
          <>
            <FilterBar
              action="/teacher/students"
              query={params.q}
              searchLabel="Search students"
              searchPlaceholder="Student name"
              applyLabel="Apply"
              clearLabel="Clear"
              selects={[
                {
                  name: "course",
                  label: "Course",
                  value: params.course,
                  options: [{ value: "", label: "All my courses" }, ...data.courses.map((course) => ({ value: course.id, label: course.title }))]
                }
              ]}
            />

            <DataTable
              caption="Students in your courses"
              rows={data.rows}
              getRowKey={(row) => row.id}
              emptyState={
                filtered ? (
                  <EmptyState title="No students match these filters" description="Try another name or course." actionLabel="Clear filters" actionHref="/teacher/students" />
                ) : (
                  <EmptyState icon={<Users />} title="No students yet" description="Students appear here once they enroll in one of your courses." />
                )
              }
              columns={[
                { key: "student", header: "Student", mobile: "title", cell: (row) => <StudentIdentity student={{ id: row.id, name: row.name }} /> },
                {
                  key: "courses",
                  header: "Enrolled courses",
                  cell: (row) => (
                    <ul className="flex flex-col gap-0.5">
                      {row.courses.map((course) => (
                        <li key={course.slug} className="flex items-center justify-between gap-3 text-sm">
                          <span className="truncate">{course.title}</span>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{course.progress}%</span>
                        </li>
                      ))}
                    </ul>
                  )
                },
                {
                  key: "progress",
                  header: "Average progress",
                  cell: (row) => (
                    <CourseProgressCell
                      value={row.averageProgress}
                      completedLessons={row.courses.filter((course) => course.progress >= 100).length}
                      totalLessons={row.courses.length}
                    />
                  )
                },
                {
                  key: "assignments",
                  header: "Practice",
                  cell: (row) =>
                    row.exercisesAttempted === 0 ? (
                      <span className="text-muted-foreground">Not started</span>
                    ) : (
                      <Badge variant={row.exercisesPassed === row.exercisesAttempted ? "success" : "warning"}>
                        {row.exercisesPassed}/{row.exercisesAttempted} passed
                      </Badge>
                    )
                },
                { key: "activity", header: "Recent activity", cell: (row) => formatRelativeDate(row.lastActivityAt) }
              ]}
            />
            <p className="text-xs text-muted-foreground">
              Average progress counts courses completed out of the courses each student takes with you.
            </p>
          </>
        )}
      </WorkspacePage>
    </WorkspaceShell>
  );
}
