import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { WorkspacePage } from "@/components/layout/app-shell";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { AccessDenied } from "@/components/shared/access-denied";
import { StudyRoom } from "@/components/study/study-room";
import { buttonVariants } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { AuthzError } from "@/server/authz";
import { isStudyLanguage, type StudyLanguage } from "@/server/study/content";
import { getStudentStudy } from "@/server/study/service";
import { requireSignedIn } from "@/server/workspace";

export const metadata: Metadata = { title: "Study room", robots: { index: false } };
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ courseSlug: string; lessonSlug: string }>; searchParams: Promise<{ lang?: string }> };

/** Lesson study room: full lesson + Summary / Ask a question / Test yourself (docs/ERA_STUDY_ROOM.md). */
export default async function StudyRoomPage({ params, searchParams }: PageProps) {
  const { courseSlug, lessonSlug } = await params;
  const { lang } = await searchParams;
  const lessonPath = `/learn/courses/${courseSlug}/lessons/${lessonSlug}`;
  const user = await requireSignedIn(`${lessonPath}/study`);
  // Uzbek by default; the student's last choice (?lang=en / ?lang=uz) is remembered in a cookie.
  const cookieLanguage = (await cookies()).get("era_study_lang")?.value;
  const language: StudyLanguage = isStudyLanguage(lang) ? lang : isStudyLanguage(cookieLanguage) ? cookieLanguage : "uz";

  const lesson = await prisma.lesson.findFirst({ where: { slug: lessonSlug, course: { slug: courseSlug } }, select: { id: true } });
  if (!lesson) notFound();

  let data: Awaited<ReturnType<typeof getStudentStudy>>;
  try {
    data = await getStudentStudy(user, lesson.id, language);
  } catch (error) {
    if (error instanceof AuthzError && error.status === 404) {
      return (
        <WorkspaceShell workspace="student">
          <WorkspacePage width="narrow">
            <AccessDenied
              title={language === "en" ? "This lesson has no study guide yet" : "Bu dars uchun hali darslik tayyor emas"}
              description={language === "en" ? "Your teacher will publish it soon." : "O'qituvchingiz uni tez orada joylaydi."}
              action={
                <Link href={lessonPath} className={cn(buttonVariants({ variant: "outline" }))}>
                  {language === "en" ? "Back to the lesson" : "Darsga qaytish"}
                </Link>
              }
            />
          </WorkspacePage>
        </WorkspaceShell>
      );
    }
    if (error instanceof AuthzError) {
      return (
        <WorkspaceShell workspace="student">
          <WorkspacePage width="narrow">
            <AccessDenied
              title={language === "en" ? "You can't open this lesson" : "Bu darsni ocha olmaysiz"}
              description={error.message}
              action={
                <Link href={`/courses/${courseSlug}`} className={cn(buttonVariants({ variant: "outline" }))}>
                  {language === "en" ? "Go to the course page" : "Kurs sahifasiga o'tish"}
                </Link>
              }
            />
          </WorkspacePage>
        </WorkspaceShell>
      );
    }
    throw error;
  }

  return (
    <WorkspaceShell workspace="student">
      <WorkspacePage width="full" className="mx-auto max-w-[1400px]">
        <StudyRoom
          lessonId={data.lesson.id}
          lessonTitle={data.lesson.title}
          courseTitle={data.course.title}
          backHref={lessonPath}
          language={data.language}
          englishAvailable={data.englishAvailable}
          preview={data.preview}
          content={data.content}
          progress={data.progress}
        />
      </WorkspacePage>
    </WorkspaceShell>
  );
}
