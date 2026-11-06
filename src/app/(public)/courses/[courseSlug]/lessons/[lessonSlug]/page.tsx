import type { Metadata } from "next";
import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ courseSlug: string; lessonSlug: string }>;
};

/*
 * Legacy public lesson URL. Lessons are served only inside the authorized classroom
 * (/learn/courses/[courseSlug]/lessons/[lessonSlug]), which checks sign-in, enrollment, teacher
 * ownership or admin role on the server. next.config.ts redirects this path before rendering; this page
 * is the fallback and never loads or renders lesson data.
 */

export const metadata: Metadata = {
  title: "Lesson",
  robots: { index: false, follow: false }
};

export default async function LegacyLessonPage({ params }: Props) {
  const { courseSlug, lessonSlug } = await params;
  redirect(`/learn/courses/${encodeURIComponent(courseSlug)}/lessons/${encodeURIComponent(lessonSlug)}`);
}
