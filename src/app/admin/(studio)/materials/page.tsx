import Link from "next/link";

import {
  createMaterialAction,
  deleteMaterialAction,
  updateMaterialAction
} from "@/app/admin/actions";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminShell } from "@/components/admin/admin-shell";
import { FormShell } from "@/components/admin/form-shell";
import { MediaUploadField } from "@/components/admin/media-upload-field";
import { RowDeleteAction, RowEditLink } from "@/components/admin/row-actions";
import { ResourceTable } from "@/components/admin/resource-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getAdminCourses, getAdminLessons, getAdminMaterials } from "@/server/admin";

export const dynamic = "force-dynamic";

type AdminMaterialsPageProps = {
  searchParams: Promise<{
    created?: string;
    saved?: string;
    deleted?: string;
    error?: string;
    edit?: string;
  }>;
};

export default async function AdminMaterialsPage({ searchParams }: AdminMaterialsPageProps) {
  const params = await searchParams;
  const [materials, courses, lessons] = await Promise.all([
    getAdminMaterials(),
    getAdminCourses(),
    getAdminLessons()
  ]);
  const editingMaterial = params.edit
    ? materials.find((material) => material.id === params.edit) ?? null
    : null;

  return (
    <AdminShell currentPath="/admin/materials">
      <AdminPageHeader
        eyebrow="Materials"
        title="Manage downloadable lesson resources."
        description="Attach worksheets, PDFs, slides, and reference files to a course or a specific lesson."
      />

      <div className="grid gap-8 xl:grid-cols-[1.15fr,0.85fr]">
        {params.created === "material" ? (
          <div className="rounded-2xl border border-success/20 bg-success/5 px-4 py-3 text-sm text-success xl:col-span-2">
            Material created successfully.
          </div>
        ) : null}
        {params.saved === "material" ? (
          <div className="rounded-2xl border border-success/20 bg-success/5 px-4 py-3 text-sm text-success xl:col-span-2">
            Material updated successfully.
          </div>
        ) : null}
        {params.deleted === "material" ? (
          <div className="rounded-2xl border border-success/20 bg-success/5 px-4 py-3 text-sm text-success xl:col-span-2">
            Material deleted successfully.
          </div>
        ) : null}
        {params.error === "invalid-url" ? (
          <div className="rounded-2xl border border-error/20 bg-error/5 px-4 py-3 text-sm text-error xl:col-span-2">
            Use a full http(s) link for the file.
          </div>
        ) : null}
        {params.error === "missing-material-fields" ? (
          <div className="rounded-2xl border border-error/20 bg-error/5 px-4 py-3 text-sm text-error xl:col-span-2">
            Please select a course, add a title, and upload or paste a file URL before saving.
          </div>
        ) : null}
        {params.error === "invalid-lesson" ? (
          <div className="rounded-2xl border border-error/20 bg-error/5 px-4 py-3 text-sm text-error xl:col-span-2">
            The selected lesson does not belong to the chosen course.
          </div>
        ) : null}
        {params.error === "forbidden" ? (
          <div className="rounded-2xl border border-error/20 bg-error/5 px-4 py-3 text-sm text-error xl:col-span-2">
            You do not have permission to manage materials for that course.
          </div>
        ) : null}
        {params.error === "database-offline" ? (
          <div className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning-foreground xl:col-span-2">
            The database is offline, so material changes cannot be saved right now.
          </div>
        ) : null}
        {params.error === "validation-failed" || params.error === "action-failed" ? (
          <div className="rounded-2xl border border-error/20 bg-error/5 px-4 py-3 text-sm text-error xl:col-span-2">
            We could not save that material. Review the selected file and form values.
          </div>
        ) : null}
        {params.error === "invalid-reference" ? (
          <div className="rounded-2xl border border-error/20 bg-error/5 px-4 py-3 text-sm text-error xl:col-span-2">
            The linked course or lesson could not be found.
          </div>
        ) : null}
        {params.error === "delete-failed" ? (
          <div className="rounded-2xl border border-error/20 bg-error/5 px-4 py-3 text-sm text-error xl:col-span-2">
            We could not delete that material.
          </div>
        ) : null}

        <ResourceTable
          title="Material Records"
          columns={["Title", "Course", "Lesson", "Uploaded By", "Updated", "Actions"]}
          rows={materials.map((material) => [
            material.title,
            material.course.title,
            material.lesson?.title ?? "Course-level",
            material.createdBy?.name ?? "Unknown",
            material.updatedAt.toLocaleDateString("en-US"),
            <div key={`actions-${material.id}`} className="flex gap-2">
              <RowEditLink href={`/admin/materials?edit=${material.id}`} />
              <RowDeleteAction action={deleteMaterialAction} id={material.id} />
            </div>
          ])}
        />

        {editingMaterial ? (
          <FormShell
            title={`Edit Material: ${editingMaterial.title}`}
            description="Replace the file, move the resource between lessons, or update the download details."
          >
            <form action={updateMaterialAction} className="space-y-4">
              <input type="hidden" name="id" value={editingMaterial.id} />
              <Input name="title" placeholder="Material title" required defaultValue={editingMaterial.title} />
              <Textarea
                name="description"
                placeholder="Optional description"
                defaultValue={editingMaterial.description ?? ""}
              />
              <select
                name="courseId"
                required
                defaultValue={editingMaterial.courseId}
                className="h-12 w-full rounded-2xl border border-border bg-card/80 px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select course</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
              <select
                name="lessonId"
                defaultValue={editingMaterial.lessonId ?? ""}
                className="h-12 w-full rounded-2xl border border-border bg-card/80 px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Course-level material</option>
                {lessons.map((lesson) => (
                  <option key={lesson.id} value={lesson.id}>
                    {lesson.course.title} / Lesson {lesson.position}: {lesson.title}
                  </option>
                ))}
              </select>
              <MediaUploadField
                name="fileUrl"
                label="Downloadable file"
                placeholder="File URL"
                uploadFolder="course-materials"
                mediaType="file"
                initialValue={editingMaterial.fileUrl}
                initialStoragePath={editingMaterial.storagePath ?? undefined}
                initialMimeType={editingMaterial.mimeType ?? undefined}
                storagePathName="storagePath"
                mimeTypeName="mimeType"
              />
              <Input
                name="position"
                type="number"
                min="1"
                placeholder="Display order"
                defaultValue={String(editingMaterial.position)}
              />
              <div className="flex gap-3">
                <Button type="submit">Save Changes</Button>
                <Link
                  href="/admin/materials"
                  className={cn(
                    "inline-flex h-11 items-center justify-center rounded-full border border-border px-5 text-sm font-medium transition hover:bg-card/80"
                  )}
                >
                  Cancel
                </Link>
              </div>
            </form>
          </FormShell>
        ) : null}

        <FormShell
          title="Add Material"
          description="Upload a file once and attach it to the full course or to a specific lesson."
        >
          <form action={createMaterialAction} className="space-y-4">
            <Input name="title" placeholder="Material title" required />
            <Textarea name="description" placeholder="Optional description" />
            <select
              name="courseId"
              required
              className="h-12 w-full rounded-2xl border border-border bg-card/80 px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Select course</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
            <select
              name="lessonId"
              className="h-12 w-full rounded-2xl border border-border bg-card/80 px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Course-level material</option>
              {lessons.map((lesson) => (
                <option key={lesson.id} value={lesson.id}>
                  {lesson.course.title} / Lesson {lesson.position}: {lesson.title}
                </option>
              ))}
            </select>
            <MediaUploadField
              name="fileUrl"
              label="Downloadable file"
              placeholder="File URL"
              uploadFolder="course-materials"
              mediaType="file"
              storagePathName="storagePath"
              mimeTypeName="mimeType"
            />
            <Input name="position" type="number" min="1" placeholder="Display order" />
            <div className="rounded-2xl bg-secondary/45 px-4 py-3 text-sm text-muted-foreground">
              Students will see course-level files near the curriculum header and lesson-level files under the matching lesson.
            </div>
            <Button type="submit">Save Material</Button>
          </form>
        </FormShell>
      </div>
    </AdminShell>
  );
}
