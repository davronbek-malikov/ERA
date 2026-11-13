import type { Metadata } from "next";

import { WorkspacePage } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { TeachingCoursesView } from "@/components/management/courses-view";
import { Alert } from "@/components/ui/feedback";
import { getManagementActor } from "@/server/management/actor";
import { requireTeacher } from "@/server/workspace";
import { getT } from "@/lib/i18n-server";

export const metadata: Metadata = { title: "Courses & lessons", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function TeacherCoursesPage() {
  const T = await getT();
  const user = await requireTeacher("/teacher/my-students/courses");
  const actor = await getManagementActor(user, "teacher");
  return (
    <WorkspaceShell workspace="teacher">
      <WorkspacePage className="flex flex-col gap-6">
        <PageHeader
          breadcrumbs={[{ label: T("My students"), href: "/teacher/my-students" }, { label: T("Courses & lessons") }]}
          title={T("Courses & lessons")}
          description={T("What you taught in each lesson and the homework you gave.")}
        />
        {actor ? (
          <TeachingCoursesView actor={actor} workspace="teacher" />
        ) : (
          <Alert variant="warning" title={T("Your account isn't linked to a teacher profile yet")}>
            {T("Ask an administrator to link your account.")}
          </Alert>
        )}
      </WorkspacePage>
    </WorkspaceShell>
  );
}
