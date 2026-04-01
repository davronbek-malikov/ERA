import Link from "next/link";
import { createLessonAction, deleteLessonAction, updateLessonAction } from "@/app/admin/actions";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { MediaUploadField } from "@/components/admin/media-upload-field";
import { AdminShell } from "@/components/admin/admin-shell";
import { FormShell } from "@/components/admin/form-shell";
import { RowDeleteAction, RowEditLink } from "@/components/admin/row-actions";
import { ResourceTable } from "@/components/admin/resource-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getAdminCourses, getAdminLessons } from "@/server/admin";

export const dynamic = "force-dynamic";

type AdminLessonsPageProps = {
  searchParams: Promise<{
    created?: string;
    saved?: string;
    deleted?: string;
    error?: string;
    edit?: string;
  }>;
};

export default async function AdminLessonsPage({ searchParams }: AdminLessonsPageProps) {
  const params = await searchParams;
  const [lessons, courses] = await Promise.all([getAdminLessons(), getAdminCourses()]);
  const editingLesson = params.edit ? lessons.find((lesson) => lesson.id === params.edit) ?? null : null;

  return (
    <AdminShell currentPath="/admin/lessons">
      <AdminPageHeader
        eyebrow="Lessons"
        title="Manage lesson sequencing and video delivery."
        description="Control lesson order, video URLs, and course curriculum records from the same admin workspace."
      />

      <div className="grid gap-8 xl:grid-cols-[1.1fr,0.9fr]">
        {params.created === "lesson" ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 xl:col-span-2">
            Lesson created successfully. It now appears inside the selected course curriculum.
          </div>
        ) : null}
        {params.saved === "lesson" ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 xl:col-span-2">
            Lesson updated successfully.
          </div>
        ) : null}
        {params.deleted === "lesson" ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 xl:col-span-2">
            Lesson deleted successfully.
          </div>
        ) : null}
        {params.error === "missing-lesson-fields" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 xl:col-span-2">
            Please select a course and add a lesson title before saving.
          </div>
        ) : null}
        {params.error === "database-offline" ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 xl:col-span-2">
            PostgreSQL is currently offline, so the admin is showing demo content only. Lesson
            saving will work again once the database is back.
          </div>
        ) : null}
        {params.error === "forbidden" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 xl:col-span-2">
            You can only manage lessons inside courses assigned to your instructor profile.
          </div>
        ) : null}

        {params.error === "delete-failed" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 xl:col-span-2">
            We could not delete that lesson.
          </div>
        ) : null}

        <ResourceTable
          title="Lesson Records"
          columns={["Lesson", "Course", "Order", "Duration", "Status", "Actions"]}
          rows={lessons.map((lesson) => [
            lesson.title,
            lesson.course.title,
            String(lesson.position),
            lesson.duration ?? "Video",
            lesson.status,
            <div key={`actions-${lesson.id}`} className="flex gap-2">
              <RowEditLink href={`/admin/lessons?edit=${lesson.id}`} />
              <RowDeleteAction action={deleteLessonAction} id={lesson.id} />
            </div>
          ])}
        />

        {editingLesson ? (
          <FormShell
            title={`Edit Lesson: ${editingLesson.title}`}
            description="Replace lesson media, move curriculum order, and save changes directly to the selected course."
          >
            <form action={updateLessonAction} className="space-y-4">
              <input type="hidden" name="id" value={editingLesson.id} />
              <select
                name="courseId"
                required
                defaultValue={editingLesson.courseId}
                className="h-12 w-full rounded-2xl border border-border bg-white/80 px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select course</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
              <Input name="title" placeholder="Title" required defaultValue={editingLesson.title} />
              <Textarea name="description" placeholder="Description" defaultValue={editingLesson.description ?? ""} />
              <MediaUploadField
                name="videoUrl"
                label="Lesson video"
                placeholder="Video URL"
                uploadFolder="lesson-videos"
                mediaType="video"
                helperText="Preview, replace, or remove the current lesson video."
                initialValue={editingLesson.videoUrl ?? ""}
              />
              <Input name="duration" placeholder="Duration" defaultValue={editingLesson.duration ?? ""} />
              <Input
                name="position"
                placeholder="Order index"
                type="number"
                min="1"
                defaultValue={String(editingLesson.position)}
              />
              <div className="flex gap-3">
                <Button type="submit">Save Changes</Button>
                <Link
                  href="/admin/lessons"
                  className={cn("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-border bg-transparent px-5 text-sm font-medium transition-all duration-300 hover:bg-card/80 h-11")}
                >
                  Cancel
                </Link>
              </div>
            </form>
          </FormShell>
        ) : null}

        <FormShell
          title="Create Lesson"
          description="Add lesson videos, control curriculum order, and publish lessons directly into a live course."
        >
          <form action={createLessonAction} className="space-y-4">
            <select
              name="courseId"
              required
              className="h-12 w-full rounded-2xl border border-border bg-white/80 px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Select course</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
            <Input name="title" placeholder="Title" required />
            <Textarea name="description" placeholder="Description" />
            <MediaUploadField
              name="videoUrl"
              label="Lesson video"
              placeholder="Video URL"
              uploadFolder="lesson-videos"
              mediaType="video"
            />
            <Input name="duration" placeholder="Duration" />
            <Input name="position" placeholder="Order index" type="number" min="1" />
            <div className="rounded-2xl bg-secondary/45 px-4 py-3 text-sm text-muted-foreground">
              Use the upload button to send a local lesson video to Supabase Storage, or paste an
              existing hosted video URL.
            </div>
            <Button type="submit">Save Lesson</Button>
          </form>
        </FormShell>
      </div>
    </AdminShell>
  );
}
