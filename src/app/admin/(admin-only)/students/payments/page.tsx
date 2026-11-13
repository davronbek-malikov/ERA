import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { WorkspacePage } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { AuthzError } from "@/server/authz";
import { getManagementActor } from "@/server/management/actor";
import { requireAdmin } from "@/server/workspace";
import { PaymentsView } from "@/components/management/payments-view";

export const metadata: Metadata = { title: "Payments", robots: { index: false } };
export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Page({ searchParams }: PageProps) {
  const user = await requireAdmin("/admin/students/payments");
  const actor = await getManagementActor(user, "admin");
  const params = await searchParams;
  if (!actor) notFound();
  return (
    <WorkspaceShell workspace="admin">
      <WorkspacePage className="flex flex-col gap-6">
        <PageHeader breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Student management", href: "/admin/students" }, { label: "Payments" }]} title={"Payments"} description={"Payments are made outside ERA. Record them here, verify they arrived, then approve. Only approved payments count."} />
        <PaymentsView actor={actor} params={params} basePath="/admin/students/payments" profilePath="/admin/students" workspace="admin" />
      </WorkspacePage>
    </WorkspaceShell>
  );
}
