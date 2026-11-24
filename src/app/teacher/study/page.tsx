import type { Metadata } from "next";
import Link from "next/link";
import { BookOpenText, ChevronRight } from "lucide-react";

import { WorkspacePage } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/feedback";
import { prisma } from "@/lib/prisma";
import { getManagementActor } from "@/server/management/actor";
import { listTeachingCourses } from "@/server/management/teaching";
import { requireTeacher } from "@/server/workspace";

export const metadata: Metadata = { title: "Study guides", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Every lesson of the teacher's courses with the state of its AI study guide (docs/ERA_STUDY_ROOM.md). */
export default async function TeacherStudyListPage() {
  const user = await requireTeacher("/teacher/study");
  const actor = await getManagementActor(user, "teacher");
  const courses = actor ? await listTeachingCourses(actor) : [];
  const lessonIds = courses.flatMap((course) => course.lessons.map((lesson) => lesson.id));
  const [guides, materials] = await Promise.all([
    prisma.lessonStudyGuide.findMany({ where: { lessonId: { in: lessonIds } }, select: { lessonId: true, status: true } }),
    prisma.lessonStudyMaterial.groupBy({ by: ["lessonId"], where: { lessonId: { in: lessonIds } }, _count: { _all: true } })
  ]);
  const status = new Map(guides.map((guide) => [guide.lessonId, guide.status]));
  const files = new Map(materials.map((entry) => [entry.lessonId, entry._count._all]));

  return (
    <WorkspaceShell workspace="teacher">
      <WorkspacePage className="flex flex-col gap-6">
        <PageHeader
          title="O'quv xonasi (darsliklar)"
          description="Har bir dars uchun material yuklang, AI darslik va savollar yozsin, siz ko'rib chiqib nashr qiling. Kursning barcha o'quvchilari bir xil darslikni ko'radi."
        />
        {!actor ? (
          <Alert variant="warning" title="Akkauntingiz hali o'qituvchi profiliga ulanmagan">
            Administratordan ulab berishni so&apos;rang.
          </Alert>
        ) : courses.length ? (
          <div className="flex flex-col gap-5">
            {courses.map((course) => (
              <section key={course.id} className="flex flex-col gap-2" aria-label={course.title}>
                <h2 className="flex items-center gap-2 font-semibold">
                  <BookOpenText className="size-4 text-primary" aria-hidden="true" />
                  {course.title}
                  <span className="text-xs font-normal text-muted-foreground">· {course.activeStudents} o&apos;quvchi</span>
                </h2>
                {course.lessons.length ? (
                  <ol className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                    {course.lessons.map((lesson) => {
                      const state = status.get(lesson.id);
                      return (
                        <li key={lesson.id}>
                          <Link href={`/teacher/study/${lesson.id}`} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/50">
                            <span className="min-w-0 flex-1">
                              {lesson.position}. {lesson.title}
                            </span>
                            <span className="text-xs text-muted-foreground">{files.get(lesson.id) ?? 0} fayl</span>
                            <Badge variant={state === "PUBLISHED" ? "success" : state === "DRAFT" ? "warning" : "neutral"}>
                              {state === "PUBLISHED" ? "Nashr qilingan" : state === "DRAFT" ? "Qoralama" : "Yo'q"}
                            </Badge>
                            <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                          </Link>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className="text-sm text-muted-foreground">Bu kursda hali dars yo&apos;q.</p>
                )}
              </section>
            ))}
          </div>
        ) : (
          <EmptyState icon={<BookOpenText />} title="Hali kurs yo'q" description="Avval Kurslar va darslar sahifasida kurs yarating." actionLabel="Kurslar va darslar" actionHref="/teacher/my-students/courses" />
        )}
      </WorkspacePage>
    </WorkspaceShell>
  );
}
