import type { Metadata } from "next";
import Link from "next/link";
import { BookPlus, ClipboardCheck, MessageSquare, Send, UserPlus } from "lucide-react";

import { WorkspacePage } from "@/components/layout/app-shell";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { ReminderPanel } from "@/components/management/reminder-panel";
import { Alert } from "@/components/ui/feedback";
import { WorkspaceAssistant } from "@/components/workspace/workspace-assistant";
import { cn } from "@/lib/utils";
import { getManagementActor } from "@/server/management/actor";
import { requireTeacher } from "@/server/workspace";
import { getT } from "@/lib/i18n-server";

export const metadata: Metadata = { title: "ERA Assistant", robots: { index: false } };
export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ c?: string; tab?: string }> };

/** Two tabs: the chatbot, and the automatic Telegram message sender (weekly homework rule reminders). */
export default async function TeacherAssistantPage({ searchParams }: PageProps) {
  const T = await getT();
  // "Continue in the assistant" from Ask ERA AI opens that conversation (ownership is checked by the API).
  const { c: initialConversationId, tab } = await searchParams;
  const user = await requireTeacher("/teacher/assistant");
  const auto = tab === "auto";
  const actor = auto ? await getManagementActor(user, "teacher") : null;

  const tabClass = (active: boolean) =>
    cn(
      "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
      active ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:bg-muted hover:text-foreground"
    );

  return (
    <WorkspaceShell workspace="teacher">
      <WorkspacePage width="full" className="flex flex-col gap-3 py-4">
        <nav aria-label="ERA Assistant" className="flex w-fit gap-1 rounded-full border border-border bg-card p-1">
          <Link href="/teacher/assistant" className={tabClass(!auto)} aria-current={!auto ? "page" : undefined}>
            <MessageSquare className="size-4" aria-hidden="true" />
            {T("Chatbot")}
          </Link>
          <Link href="/teacher/assistant?tab=auto" className={tabClass(auto)} aria-current={auto ? "page" : undefined}>
            <Send className="size-4" aria-hidden="true" />
            {T("Automatic messages")}
          </Link>
        </nav>
        {auto ? (
          actor ? (
            <ReminderPanel actor={actor} />
          ) : (
            <Alert variant="warning" title={T("Your account isn't linked to a teacher profile yet")}>
              {T("Ask an administrator to link your account.")}
            </Alert>
          )
        ) : (
          <WorkspaceAssistant
            initialConversationId={initialConversationId}
            kind="teacher-assistant"
            compact
            name="ERA Assistant"
            greeting={T("What should we check today?")}
            suggestions={[
              { label: T("Homework I still need to check"), prompt: "Whose homework do I still need to check?", icon: <ClipboardCheck /> },
              { label: T("Add a student"), prompt: "Add student ", icon: <UserPlus /> },
              { label: T("Create a course"), prompt: "Create course Machine Learning Foundation, 4 weeks, 11 lessons", icon: <BookPlus /> }
            ]}
          />
        )}
      </WorkspacePage>
    </WorkspaceShell>
  );
}
