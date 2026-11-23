import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";

import { WorkspacePage } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { DataTable } from "@/components/ui/table";
import { formatRelativeDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getTeacherAssignments } from "@/server/teacher";
import { getTeacherInstructorId, requireTeacher } from "@/server/workspace";

export const metadata: Metadata = { title: "Assignments", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function TeacherAssignmentsPage() {
  const user = await requireTeacher("/teacher/assignments");
  const instructorId = await getTeacherInstructorId(user);
  const assignments = instructorId ? await getTeacherAssignments(instructorId) : [];

  return (
    <WorkspaceShell workspace="teacher">
      <WorkspacePage className="flex flex-col gap-6">
        <PageHeader
          breadcrumbs={[{ label: "Teacher", href: "/teacher" }, { label: "Assignments" }]}
          title="Assignments"
          description="Practice exercises in your lessons and how students are doing on them."
        />

        <Alert variant="info" title="Homework with deadlines isn't available yet">
          ERA doesn&apos;t store homework, due dates or teacher grading yet; that needs a database update. For now, this page shows
          the coding practice exercises in your lessons. They&apos;re checked automatically when students run them.
        </Alert>

        {!instructorId ? (
          <Alert variant="warning" title="Your account isn't linked to a teacher profile yet">
            Ask an administrator to link your account.
          </Alert>
        ) : (
          <DataTable
            caption="Practice exercises in your courses"
            rows={assignments}
            getRowKey={(row) => row.id}
            emptyState={
              <EmptyState
                icon={<ClipboardCheck />}
                title="No practice exercises yet"
                description="Exercises added to your lessons will appear here with their submissions."
              />
            }
            columns={[
              {
                key: "title",
                header: "Assignment",
                mobile: "title",
                cell: (row) => (
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.title}</p>
                    <p className="text-xs text-muted-foreground">{row.type === "MINI_PROJECT" ? "Mini project" : "Coding exercise"}</p>
                  </div>
                )
              },
              {
                key: "lesson",
                header: "Course and lesson",
                cell: (row) => (
                  <div className="min-w-0">
                    <p className="truncate">{row.courseTitle}</p>
                    <p className="truncate text-xs text-muted-foreground">{row.lessonTitle}</p>
                  </div>
                )
              },
              { key: "deadline", header: "Deadline", mobile: "hidden", cell: () => <span className="text-muted-foreground">No deadline</span> },
              {
                key: "submissions",
                header: "Submissions",
                align: "right",
                cell: (row) => (
                  <span>
                    {row.submissionCount}
                    <span className="text-xs text-muted-foreground"> from {row.studentCount} students</span>
                  </span>
                )
              },
              {
                key: "status",
                header: "Review status",
                cell: (row) =>
                  row.studentCount === 0 ? (
                    <Badge>No submissions</Badge>
                  ) : (
                    <Badge variant={row.passedStudentCount === row.studentCount ? "success" : "warning"}>
                      {row.passedStudentCount}/{row.studentCount} passed · auto-checked
                    </Badge>
                  )
              },
              { key: "latest", header: "Latest submission", mobile: "hidden", cell: (row) => formatRelativeDate(row.latestSubmissionAt) }
            ]}
            rowActions={(row) => (
              <Link
                href={`/learn/courses/${row.courseSlug}/lessons/${row.lessonSlug}`}
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                aria-label={`Preview the lesson for ${row.title}`}
              >
                Preview
              </Link>
            )}
          />
        )}
      </WorkspacePage>
    </WorkspaceShell>
  );
}
