import type { Metadata } from "next";

import { WorkspacePage } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { Alert } from "@/components/ui/feedback";
import { AuthzError } from "@/server/authz";
import { getManagementActor } from "@/server/management/actor";
import { requireTeacher } from "@/server/workspace";
import { PaymentsView } from "@/components/management/payments-view";

export const metadata: Metadata = { title: "Payments", robots: { index: false } };
export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Page({ searchParams }: PageProps) {
  const user = await requireTeacher("/teacher/payments");
  const actor = await getManagementActor(user, "teacher");
  const params = await searchParams;
  return (
    <WorkspaceShell workspace="teacher">
      <WorkspacePage className="flex flex-col gap-6">
        <PageHeader breadcrumbs={[{ label: "Teacher", href: "/teacher" }, { label: "Payments" }]} title={"Payments"} description={"Payments from your students, recorded outside ERA and verified here."} />
        {!actor ? (
          <Alert variant="warning" title="Your account isn't linked to a teacher profile yet">
            Ask an administrator to link your account.
          </Alert>
        ) : null}
        {actor ? (
          <PaymentsView actor={actor} params={params} basePath="/teacher/payments" profilePath="/teacher/my-students" workspace="teacher" />
        ) : null}
      </WorkspacePage>
    </WorkspaceShell>
  );
}
