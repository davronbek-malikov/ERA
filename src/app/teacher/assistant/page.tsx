import type { Metadata } from "next";

import { WorkspacePage } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { WorkspaceAssistant } from "@/components/workspace/workspace-assistant";
import { prisma } from "@/lib/prisma";
import { retryOnDatabaseFailure } from "@/lib/server-data";
import { getTeacherInstructorId, requireTeacher } from "@/server/workspace";

export const metadata: Metadata = { title: "ERA Assistant", robots: { index: false } };

type PageProps = { searchParams: Promise<{ c?: string }> };

export default async function TeacherAssistantPage({ searchParams }: PageProps) {
  // "Continue in the assistant" from Ask ERA AI opens that conversation (ownership is checked by the API).
  const { c: initialConversationId } = await searchParams;
  const user = await requireTeacher("/teacher/assistant");
  const instructorId = await getTeacherInstructorId(user);
  // Only the teacher's own courses are offered as context (the server re-checks ownership on every message).
  const courses = instructorId
    ? await retryOnDatabaseFailure(() =>
        prisma.course.findMany({ where: { instructorId }, orderBy: { updatedAt: "desc" }, select: { id: true, title: true } })
      )
    : [];

  return (
    <WorkspaceShell workspace="teacher">
      <WorkspacePage className="flex flex-col gap-6">
        <PageHeader
          breadcrumbs={[{ label: "Teacher", href: "/teacher" }, { label: "ERA Assistant" }]}
          title="ERA Assistant"
          description="Draft lessons, homework and quizzes. It only uses your own courses, and nothing is published automatically."
        />
        <WorkspaceAssistant
          initialConversationId={initialConversationId}
          kind="teacher-assistant"
          name="ERA Assistant"
          intro="I'll help you plan and draft course content. Choose one of your courses below to give me its outline. Everything I write is a draft until you review it and add it in the course editor."
          courses={courses}
          suggestions={[
            "Draft a lesson outline",
            "Create a 5-question multiple-choice quiz",
            "Suggest homework for this course",
            "Write a practice exercise with a solution",
            "Improve this explanation (paste your text)"
          ]}
        />
      </WorkspacePage>
    </WorkspaceShell>
  );
}
