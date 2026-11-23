import type { Metadata } from "next";
import { BarChart3, ClipboardCheck, Wallet } from "lucide-react";

import { WorkspacePage } from "@/components/layout/app-shell";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { WorkspaceAssistant } from "@/components/workspace/workspace-assistant";
import { requireAdmin } from "@/server/workspace";
import { getT } from "@/lib/i18n-server";

export const metadata: Metadata = { title: "Admin Assistant", robots: { index: false } };

type PageProps = { searchParams: Promise<{ c?: string }> };

export default async function AdminAssistantPage({ searchParams }: PageProps) {
  const T = await getT();
  // "Continue in the assistant" from Ask ERA AI opens that conversation (ownership is checked by the API).
  const { c: initialConversationId } = await searchParams;
  await requireAdmin("/admin/assistant");

  return (
    <WorkspaceShell workspace="admin">
      <WorkspacePage width="full" className="py-4">
        <WorkspaceAssistant
          initialConversationId={initialConversationId}
          kind="admin-assistant"
          name="Admin Assistant"
          greeting={T("What's on the agenda today?")}
          suggestions={[
            { label: "Who hasn't paid?", prompt: "Which students have not paid?", icon: <Wallet /> },
            { label: "Payments waiting for approval", prompt: "Who has pending payments?", icon: <ClipboardCheck /> },
            { label: "Platform summary", prompt: "Summarize platform statistics", icon: <BarChart3 /> }
          ]}
        />
      </WorkspacePage>
    </WorkspaceShell>
  );
}
