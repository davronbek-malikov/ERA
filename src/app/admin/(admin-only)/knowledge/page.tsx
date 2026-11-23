import type { Metadata } from "next";

import { KnowledgeManager } from "@/components/knowledge/knowledge-manager";
import { WorkspacePage } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { prisma } from "@/lib/prisma";
import { retryOnDatabaseFailure } from "@/lib/server-data";
import { isKnowledgeSearchConfigured } from "@/server/knowledge/embeddings";
import { requireAdmin } from "@/server/workspace";

export const metadata: Metadata = { title: "Knowledge base", robots: { index: false } };

export default async function AdminKnowledgePage() {
  await requireAdmin("/admin/knowledge");
  const courses = await retryOnDatabaseFailure(() =>
    prisma.course.findMany({
      orderBy: { title: "asc" },
      select: { id: true, title: true, lessons: { orderBy: { position: "asc" }, select: { id: true, title: true } } }
    })
  );

  return (
    <WorkspaceShell workspace="admin">
      <WorkspacePage className="flex flex-col gap-6">
        <PageHeader
          breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Knowledge base" }]}
          title="Knowledge base"
          description="Documents the ERA assistants can answer from. Platform-wide documents apply to everyone; course and lesson documents only to people with access to that course."
        />
        <KnowledgeManager role="admin" courses={courses} embeddingConfigured={isKnowledgeSearchConfigured()} />
      </WorkspacePage>
    </WorkspaceShell>
  );
}
