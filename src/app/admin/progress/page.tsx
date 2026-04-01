import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminShell } from "@/components/admin/admin-shell";
import { ResourceTable } from "@/components/admin/resource-table";
import { getAdminProgressData } from "@/server/admin";

export const dynamic = "force-dynamic";

export default async function AdminProgressPage() {
  const enrollments = await getAdminProgressData();

  return (
    <AdminShell currentPath="/admin/progress">
      <AdminPageHeader
        eyebrow="Progress"
        title="Monitor learner momentum across your courses."
        description="Track who is progressing, where they are in the curriculum, and which courses need follow-up."
      />

      <ResourceTable
        title="Student Progress"
        columns={["Student", "Course", "Instructor", "Completed", "Progress", "Updated"]}
        rows={enrollments.map((enrollment) => {
          const completedLessons = enrollment.course.lessons.filter((lesson) =>
            lesson.completions.some((completion) => completion.userId === enrollment.userId)
          ).length;
          const progressPercent =
            enrollment.course.lessons.length > 0
              ? Math.round((completedLessons / enrollment.course.lessons.length) * 100)
              : 0;

          return [
            enrollment.user.name,
            enrollment.course.title,
            enrollment.course.instructor.name,
            `${completedLessons} / ${enrollment.course.lessons.length} lessons`,
            `${progressPercent}%`,
            enrollment.updatedAt.toLocaleDateString("en-US")
          ];
        })}
      />
    </AdminShell>
  );
}
