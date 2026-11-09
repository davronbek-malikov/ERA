import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { WorkspacePage } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { AuthzError } from "@/server/authz";
import { getManagementActor, requireStudentInScope } from "@/server/management/actor";
import { requireTeacher } from "@/server/workspace";
import { StudentProfileView } from "@/components/management/profile-view";

export const metadata: Metadata = { title: "Student profile", robots: { index: false } };
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ studentId: string }> };

export default async function Page({ params }: PageProps) {
  const user = await requireTeacher("/teacher/my-students");
  const actor = await getManagementActor(user, "teacher");
  const { studentId } = await params;
  if (!actor) notFound();
  let name: string;
  try {
    name = (await requireStudentInScope(actor, studentId)).name;
  } catch (error) {
    if (error instanceof AuthzError) notFound();
    throw error;
  }
  return (
    <WorkspaceShell workspace="teacher">
      <WorkspacePage className="flex flex-col gap-6">
        <PageHeader breadcrumbs={[{ label: "Teacher", href: "/teacher" }, { label: "My students", href: "/teacher/my-students" }, { label: name }]} title={name} description={"Your enrollments with this student, their history and notes."} />
        <StudentProfileView actor={actor} studentId={studentId} workspace="teacher" />
      </WorkspacePage>
    </WorkspaceShell>
  );
}
