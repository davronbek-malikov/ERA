import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Classroom } from "@/components/classroom/classroom";
import { WorkspacePage } from "@/components/layout/app-shell";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { AccessDenied } from "@/components/shared/access-denied";
import { buttonVariants } from "@/components/ui/button";
import { getLocale } from "@/lib/i18n-server";
import { cn } from "@/lib/utils";
import { getClassroom } from "@/server/student";
import { requireSignedIn } from "@/server/workspace";

export const metadata: Metadata = { title: "Lesson", robots: { index: false } };
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ courseSlug: string; lessonSlug: string }> };

const copy = {
  en: {
    title: (course: string) => `You're not enrolled in ${course}`,
    body: "Enroll on the course page to open its lessons and ERA Tutor.",
    action: "Go to the course page"
  },
  uz: {
    title: (course: string) => `Siz ${course} kursiga yozilmagansiz`,
    body: "Darslar va ERA Tutorni ochish uchun kurs sahifasida yoziling.",
    action: "Kurs sahifasiga o'tish"
  }
};

export default async function ClassroomPage({ params }: PageProps) {
  const { courseSlug, lessonSlug } = await params;
  const user = await requireSignedIn(`/learn/courses/${courseSlug}/lessons/${lessonSlug}`);
  // Access is decided on the server: enrollment for students, ownership for teachers, role for admins.
  const [locale, { access, classroom }] = await Promise.all([getLocale(), getClassroom(user, courseSlug, lessonSlug)]);

  if (access.status === "not-found") {
    notFound();
  }

  if (access.status === "not-enrolled" || !classroom) {
    const t = copy[locale];
    return (
      <WorkspaceShell workspace="student">
        <WorkspacePage width="narrow">
          <AccessDenied
            title={t.title(access.status === "not-enrolled" ? access.courseTitle : "")}
            description={t.body}
            action={
              <Link href={`/courses/${courseSlug}`} className={cn(buttonVariants({ variant: "outline" }))}>
                {t.action}
              </Link>
            }
          />
        </WorkspacePage>
      </WorkspaceShell>
    );
  }

  return <Classroom data={classroom} locale={locale} />;
}
