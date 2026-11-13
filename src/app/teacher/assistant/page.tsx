import type { Metadata } from "next";
import { BookPlus, ClipboardCheck, UserPlus } from "lucide-react";

import { WorkspacePage } from "@/components/layout/app-shell";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { WorkspaceAssistant } from "@/components/workspace/workspace-assistant";
import { requireTeacher } from "@/server/workspace";

export const metadata: Metadata = { title: "ERA Assistant", robots: { index: false } };

type PageProps = { searchParams: Promise<{ c?: string }> };

export default async function TeacherAssistantPage({ searchParams }: PageProps) {
  // "Continue in the assistant" from Ask ERA AI opens that conversation (ownership is checked by the API).
  const { c: initialConversationId } = await searchParams;
  await requireTeacher("/teacher/assistant");

  return (
    <WorkspaceShell workspace="teacher">
      <WorkspacePage width="full" className="py-4">
        <WorkspaceAssistant
          initialConversationId={initialConversationId}
          kind="teacher-assistant"
          name="ERA Assistant"
          greeting="What should we check today?"
          suggestions={[
            { label: "Homework I still need to check", prompt: "Whose homework do I still need to check?", icon: <ClipboardCheck /> },
            { label: "Add a student", prompt: "Add student ", icon: <UserPlus /> },
            { label: "Create a course", prompt: "Create course Machine Learning Foundation, 4 weeks, 11 lessons", icon: <BookPlus /> }
          ]}
        />
      </WorkspacePage>
    </WorkspaceShell>
  );
}
