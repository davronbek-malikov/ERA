import type { Metadata } from "next";

import { KnowledgeManager } from "@/components/knowledge/knowledge-manager";
import { WorkspacePage } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { prisma } from "@/lib/prisma";
import { retryOnDatabaseFailure } from "@/lib/server-data";
import { isKnowledgeSearchConfigured } from "@/server/knowledge/embeddings";
import { getTeacherInstructorId, requireTeacher } from "@/server/workspace";

export const metadata: Metadata = { title: "Knowledge base", robots: { index: false } };

export default async function TeacherKnowledgePage() {
  const user = await requireTeacher("/teacher/knowledge");
  const instructorId = await getTeacherInstructorId(user);
  // Only the teacher's own courses can receive documents (the API re-checks ownership).
  const courses = instructorId
    ? await retryOnDatabaseFailure(() =>
        prisma.course.findMany({
          where: { instructorId },
          orderBy: { title: "asc" },
          select: { id: true, title: true, lessons: { orderBy: { position: "asc" }, select: { id: true, title: true } } }
        })
      )
    : [];

  return (
    <WorkspaceShell workspace="teacher">
      <WorkspacePage className="flex flex-col gap-6">
        <PageHeader
          breadcrumbs={[{ label: "Teacher", href: "/teacher" }, { label: "Knowledge base" }]}
          title="Knowledge base"
          description="Upload lesson materials so ERA Tutor can answer your students from them, with sources. Mark answer keys as teachers only."
        />
        <KnowledgeManager role="teacher" courses={courses} embeddingConfigured={isKnowledgeSearchConfigured()} />
      </WorkspacePage>
    </WorkspaceShell>
  );
}
