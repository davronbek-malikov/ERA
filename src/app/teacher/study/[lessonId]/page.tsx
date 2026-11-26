import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { WorkspacePage } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { TeacherStudyEditor } from "@/components/study/teacher-study-editor";
import { AuthzError } from "@/server/authz";
import { getTeacherStudy } from "@/server/study/service";
import { requireTeacher } from "@/server/workspace";

export const metadata: Metadata = { title: "Study guide", robots: { index: false } };
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ lessonId: string }> };

export default async function TeacherStudyPage({ params }: PageProps) {
  const { lessonId } = await params;
  const user = await requireTeacher(`/teacher/study/${lessonId}`);
  let data: Awaited<ReturnType<typeof getTeacherStudy>>;
  try {
    data = await getTeacherStudy(user, lessonId);
  } catch (error) {
    if (error instanceof AuthzError) notFound();
    throw error;
  }
  return (
    <WorkspaceShell workspace="teacher">
      <WorkspacePage className="flex flex-col gap-6">
        <PageHeader
          breadcrumbs={[{ label: "O'quv xonasi", href: "/teacher/study" }, { label: `${data.lesson.position}. ${data.lesson.title}` }]}
          title={`${data.lesson.position}. ${data.lesson.title}`}
          description="Material yuklang → AI bilan yarating → ko'rib chiqing → nashr qiling."
        />
        <TeacherStudyEditor
          lessonId={data.lesson.id}
          lessonTitle={data.lesson.title}
          courseTitle={data.course.title}
          previewHref={`/learn/courses/${data.course.slug}/lessons/${data.lesson.slug}/study`}
          hasNotes={data.lesson.hasNotes}
          materials={data.materials}
          guide={data.guide}
          results={data.results}
        />
      </WorkspacePage>
    </WorkspaceShell>
  );
}
