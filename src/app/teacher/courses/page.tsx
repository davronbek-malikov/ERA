import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Plus } from "lucide-react";

import { CourseStatusBadge } from "@/components/education/course-status";
import { WorkspacePage } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { DataTable } from "@/components/ui/table";
import { FilterBar } from "@/components/workspace/workspace-ui";
import { formatRelativeDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getTeacherCourses } from "@/server/teacher";
import { getTeacherInstructorId, requireTeacher } from "@/server/workspace";

export const metadata: Metadata = { title: "My courses", robots: { index: false } };
export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ q?: string; status?: string; sort?: string }> };

export default async function TeacherCoursesPage({ searchParams }: PageProps) {
  const user = await requireTeacher("/teacher/courses");
  const [params, instructorId] = await Promise.all([searchParams, getTeacherInstructorId(user)]);
  const courses = instructorId ? await getTeacherCourses(instructorId, params) : [];
  const filtered = Boolean(params.q || params.status);

  const createLink = (
    <Link href="/admin/courses" className={cn(buttonVariants())}>
      <Plus />
      New course
    </Link>
  );

  return (
    <WorkspaceShell workspace="teacher">
      <WorkspacePage className="flex flex-col gap-6">
        <PageHeader
          breadcrumbs={[{ label: "Teacher", href: "/teacher" }, { label: "My courses" }]}
          title="My courses"
          description="Courses you teach. Only your own courses appear here."
          actions={createLink}
        />

        {!instructorId ? (
          <Alert variant="warning" title="Your account isn't linked to a teacher profile yet">
            Ask an administrator to link your account. Until then no courses are shown.
          </Alert>
        ) : (
          <>
            <FilterBar
              action="/teacher/courses"
              query={params.q}
              searchLabel="Search courses"
              searchPlaceholder="Course title"
              applyLabel="Apply"
              clearLabel="Clear"
              selects={[
                {
                  name: "status",
                  label: "Status",
                  value: params.status,
                  options: [
                    { value: "", label: "All statuses" },
                    { value: "PUBLISHED", label: "Published" },
                    { value: "DRAFT", label: "Draft" },
                    { value: "ARCHIVED", label: "Archived" }
                  ]
                },
                {
                  name: "sort",
                  label: "Sort by",
                  value: params.sort,
                  options: [
                    { value: "", label: "Last updated" },
                    { value: "title", label: "Title (A–Z)" },
                    { value: "students", label: "Most students" }
                  ]
                }
              ]}
            />

            <DataTable
              caption="Your courses"
              rows={courses}
              getRowKey={(course) => course.id}
              emptyState={
                filtered ? (
                  <EmptyState title="No courses match these filters" description="Try a different search or clear the filters." actionLabel="Clear filters" actionHref="/teacher/courses" />
                ) : (
                  <EmptyState icon={<BookOpen />} title="No courses yet" description="Create your first course to start teaching on ERA." action={createLink} />
                )
              }
              columns={[
                {
                  key: "course",
                  header: "Course",
                  mobile: "title",
                  cell: (course) => (
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        aria-hidden="true"
                        className="hidden size-12 shrink-0 rounded-lg bg-muted bg-cover bg-center sm:block"
                        style={course.thumbnailUrl ? { backgroundImage: `url(${course.thumbnailUrl})` } : undefined}
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{course.title}</p>
                        {course.shortDescription ? (
                          <p className="line-clamp-1 max-w-md text-xs text-muted-foreground">{course.shortDescription}</p>
                        ) : null}
                      </div>
                    </div>
                  )
                },
                { key: "students", header: "Students", align: "right", cell: (course) => course._count.enrollments },
                { key: "lessons", header: "Lessons", align: "right", mobile: "hidden", cell: (course) => course._count.lessons },
                { key: "status", header: "Status", cell: (course) => <CourseStatusBadge status={course.status} /> },
                { key: "updated", header: "Last updated", cell: (course) => formatRelativeDate(course.updatedAt) }
              ]}
              rowActions={(course) => (
                <div className="flex justify-end gap-1">
                  <Link href={`/teacher/lessons?course=${course.id}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
                    Lessons
                  </Link>
                  <Link href={`/admin/courses?edit=${course.id}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
                    Edit
                  </Link>
                </div>
              )}
            />
          </>
        )}
      </WorkspacePage>
    </WorkspaceShell>
  );
}
