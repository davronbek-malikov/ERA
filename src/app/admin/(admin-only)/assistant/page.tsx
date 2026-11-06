import type { Metadata } from "next";

import { WorkspacePage } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { WorkspaceAssistant } from "@/components/workspace/workspace-assistant";
import { requireAdmin } from "@/server/workspace";

export const metadata: Metadata = { title: "Admin Assistant", robots: { index: false } };

type PageProps = { searchParams: Promise<{ c?: string }> };

export default async function AdminAssistantPage({ searchParams }: PageProps) {
  // "Continue in the assistant" from Ask ERA AI opens that conversation (ownership is checked by the API).
  const { c: initialConversationId } = await searchParams;
  await requireAdmin("/admin/assistant");

  return (
    <WorkspaceShell workspace="admin">
      <WorkspacePage className="flex flex-col gap-6">
        <PageHeader
          breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Admin Assistant" }]}
          title="Admin Assistant"
          description="Ask about platform statistics and course activity. It works with aggregate data only and never reads private conversations."
        />
        <WorkspaceAssistant
          initialConversationId={initialConversationId}
          kind="admin-assistant"
          name="Admin Assistant"
          intro="I'll explain platform statistics and course activity, and where to find admin functions. I can't change anything myself: you make changes in the admin pages."
          suggestions={[
            "Summarize platform statistics",
            "Which courses are still unpublished?",
            "Which courses have the most enrollments?",
            "How do I add a new teacher?"
          ]}
        />
      </WorkspacePage>
    </WorkspaceShell>
  );
}
