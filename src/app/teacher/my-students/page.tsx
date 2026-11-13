import type { Metadata } from "next";

import { WorkspacePage } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { Alert } from "@/components/ui/feedback";
import { AuthzError } from "@/server/authz";
import { getManagementActor } from "@/server/management/actor";
import { requireTeacher } from "@/server/workspace";
import { StudentManagementDashboard } from "@/components/management/dashboard-view";
import { getT } from "@/lib/i18n-server";

export const metadata: Metadata = { title: "My students", robots: { index: false } };
export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Page({ searchParams }: PageProps) {
  const T = await getT();
  const user = await requireTeacher("/teacher/my-students");
  const actor = await getManagementActor(user, "teacher");
  const params = await searchParams;
  return (
    <WorkspaceShell workspace="teacher">
      <WorkspacePage className="flex flex-col gap-6">
        <PageHeader breadcrumbs={[{ label: T("Teacher"), href: "/teacher" }, { label: T("My students") }]} title={T("My students")} description={T("Students assigned to you, their courses, dates and — if you may see them — payments.")} />
        {!actor ? (
          <Alert variant="warning" title={T("Your account isn't linked to a teacher profile yet")}>
            {T("Ask an administrator to link your account.")}
          </Alert>
        ) : null}
        {actor ? (
          <StudentManagementDashboard actor={actor} params={params} basePath="/teacher/my-students" profilePath="/teacher/my-students" workspace="teacher" />
        ) : null}
      </WorkspacePage>
    </WorkspaceShell>
  );
}
