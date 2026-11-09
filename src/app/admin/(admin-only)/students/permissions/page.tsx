import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";

import { WorkspacePage } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { TeacherPermissionsForm } from "@/components/management/misc-forms";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { PERMISSION_LABEL } from "@/server/management/actor";
import { listTeacherPermissions } from "@/server/management/teacher-permissions";
import { requireAdmin } from "@/server/workspace";

export const metadata: Metadata = { title: "Teacher permissions", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Administrators decide what each teacher may do in Student Management. Every change is audited. */
export default async function TeacherPermissionsPage() {
  await requireAdmin("/admin/students/permissions");
  const teachers = await listTeacherPermissions();

  return (
    <WorkspaceShell workspace="admin">
      <WorkspacePage className="flex flex-col gap-6">
        <PageHeader
          breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Student management", href: "/admin/students" }, { label: "Teacher permissions" }]}
          title="Teacher permissions"
          description="Every teacher sees only the students assigned to them and can always add notes and schedule exams. Everything else must be allowed here."
        />
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent-strong" aria-hidden="true" />
          The same rules apply in the ERA Assistant: a teacher&apos;s assistant can only do what the teacher may do.
        </p>
        {teachers.length ? (
          <ul className="grid gap-4 lg:grid-cols-2">
            {teachers.map((teacher) => (
              <li key={teacher.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-col">
                    <h2 className="card-title">{teacher.name}</h2>
                    <span className="text-xs text-muted-foreground">
                      {teacher.account ? teacher.account.email : "No sign-in account linked"} · {teacher.enrollments} assigned enrollment{teacher.enrollments === 1 ? "" : "s"}
                    </span>
                  </div>
                  {!teacher.account ? <Badge variant="warning">Not linked</Badge> : null}
                </div>
                <TeacherPermissionsForm instructorId={teacher.id} initial={teacher.permissions} labels={PERMISSION_LABEL} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No teacher profiles yet" description="Create teacher profiles under Teacher profiles first." />
        )}
      </WorkspacePage>
    </WorkspaceShell>
  );
}
