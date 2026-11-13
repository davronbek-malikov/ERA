import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { WorkspacePage } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { TeachingCoursesView } from "@/components/management/courses-view";
import { getManagementActor } from "@/server/management/actor";
import { requireAdmin } from "@/server/workspace";

export const metadata: Metadata = { title: "Courses & lessons", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminCoursesLessonsPage() {
  const user = await requireAdmin("/admin/students/courses");
  const actor = await getManagementActor(user, "admin");
  if (!actor) notFound();
  return (
    <WorkspaceShell workspace="admin">
      <WorkspacePage className="flex flex-col gap-6">
        <PageHeader
          breadcrumbs={[{ label: "Student management", href: "/admin/students" }, { label: "Courses & lessons" }]}
          title="Courses & lessons"
          description="Lessons with what was taught and the homework, for every course."
        />
        <TeachingCoursesView actor={actor} workspace="admin" />
      </WorkspacePage>
    </WorkspaceShell>
  );
}
