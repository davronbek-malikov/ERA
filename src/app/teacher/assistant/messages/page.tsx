import type { Metadata } from "next";

import { WorkspacePage } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { MessagesPanel } from "@/components/management/messages-panel";
import { Alert } from "@/components/ui/feedback";
import { getT } from "@/lib/i18n-server";
import { getManagementActor } from "@/server/management/actor";
import { requireTeacher } from "@/server/workspace";

export const metadata: Metadata = { title: "Messages", robots: { index: false } };
export const dynamic = "force-dynamic";

/** ERA Assistant → Messages: Telegram messages to students, now, at an exact time or every week. */
export default async function TeacherMessagesPage() {
  const T = await getT();
  const user = await requireTeacher("/teacher/assistant/messages");
  const actor = await getManagementActor(user, "teacher");
  return (
    <WorkspaceShell workspace="teacher">
      <WorkspacePage width="full" className="flex flex-col gap-6">
        <PageHeader
          breadcrumbs={[{ label: "ERA Assistant", href: "/teacher/assistant" }, { label: T("Messages") }]}
          title={T("Messages")}
          description={T("Send Telegram messages to your students: to everyone, to students behind the weekly rule, or to the ones you choose.")}
        />
        {actor ? (
          <MessagesPanel actor={actor} />
        ) : (
          <Alert variant="warning" title={T("Your account isn't linked to a teacher profile yet")}>
            {T("Ask an administrator to link your account.")}
          </Alert>
        )}
      </WorkspacePage>
    </WorkspaceShell>
  );
}
