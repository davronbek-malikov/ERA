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
            "Whose homework do I still need to check?",
            "Who hasn't done lesson 3's homework?",
            "Show Ali's homework and payments",
            "Create course Machine Learning Foundation, 4 weeks, 11 lessons",
            "Lesson 2: I taught linear regression with scikit-learn. Homework: train a model on the housing dataset and push the notebook to GitHub",
            "Add student Ali Karimov, ali@gmail.com, GitHub github.com/alik, to Machine Learning Foundation starting today, 500,000 won",
            "Ali did lesson 2's homework correctly: github.com/alik/ml/tree/main/lesson-2"
          ]}
        />
      </WorkspacePage>
    </WorkspaceShell>
  );
}
