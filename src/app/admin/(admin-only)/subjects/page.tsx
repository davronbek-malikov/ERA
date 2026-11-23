import { createSubjectAction } from "@/app/admin/actions";
import { deleteSubjectAction } from "@/app/admin/actions";
import { RowDeleteAction } from "@/components/admin/row-actions";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminShell } from "@/components/admin/admin-shell";
import { FormShell } from "@/components/admin/form-shell";
import { MediaUploadField } from "@/components/admin/media-upload-field";
import { ResourceTable } from "@/components/admin/resource-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requireAdmin } from "@/server/workspace";
import { getAdminSubjects } from "@/server/admin";

export const dynamic = "force-dynamic";

type AdminSubjectsPageProps = {
  searchParams: Promise<{
    created?: string;
    deleted?: string;
    error?: string;
  }>;
};

export default async function AdminSubjectsPage({ searchParams }: AdminSubjectsPageProps) {
  // Admin only: instructors are sent to the Teacher Workspace (IA D5).
  await requireAdmin("/admin/subjects");
  const params = await searchParams;
  const subjects = await getAdminSubjects();

  return (
    <AdminShell currentPath="/admin/subjects">
      <AdminPageHeader
        eyebrow="Subjects"
        title="Manage top-level subject architecture."
        description="Create and organize the subject layer that anchors the rest of the learning platform."
      />

      <div className="grid gap-8 xl:grid-cols-[1.1fr,0.9fr]">
        {params.created === "subject" ? (
          <div className="rounded-2xl border border-success/20 bg-success/5 px-4 py-3 text-sm text-success xl:col-span-2">
            Subject created successfully.
          </div>
        ) : null}
        {params.deleted === "subject" ? (
          <div className="rounded-2xl border border-success/20 bg-success/5 px-4 py-3 text-sm text-success xl:col-span-2">
            Subject deleted successfully.
          </div>
        ) : null}
        {params.error === "missing-subject-fields" ? (
          <div className="rounded-2xl border border-error/20 bg-error/5 px-4 py-3 text-sm text-error xl:col-span-2">
            Please add at least a subject name before saving.
          </div>
        ) : null}
        {params.error === "database-offline" ? (
          <div className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning-foreground xl:col-span-2">
            Database connection is unavailable, so this subject could not be saved.
          </div>
        ) : null}
        {params.error === "forbidden" ? (
          <div className="rounded-2xl border border-error/20 bg-error/5 px-4 py-3 text-sm text-error xl:col-span-2">
            Only administrators can manage subjects.
          </div>
        ) : null}

        {params.error === "delete-failed" ? (
          <div className="rounded-2xl border border-error/20 bg-error/5 px-4 py-3 text-sm text-error xl:col-span-2">
            We could not delete that subject.
          </div>
        ) : null}

        <ResourceTable
          title="Subject Records"
          columns={["Name", "Slug", "Status", "Categories", "Updated", "Actions"]}
          rows={subjects.map((subject) => [
            subject.name,
            subject.slug,
            subject.status,
            String(subject._count.categories),
            subject.updatedAt.toLocaleDateString("en-US"),
            <RowDeleteAction key={`delete-${subject.id}`} action={deleteSubjectAction} id={subject.id} />
          ])}
        />

        <FormShell
          title="Create Subject"
          description="Add a new subject area and define how it appears in the catalog."
        >
          <form action={createSubjectAction} className="space-y-4">
            <Input name="name" placeholder="Subject name" required />
            <Input name="slug" placeholder="Slug (optional)" />
            <Textarea name="description" placeholder="Description" />
            <MediaUploadField
              name="thumbnailUrl"
              label="Subject thumbnail"
              placeholder="Thumbnail URL"
              uploadFolder="subject-thumbnails"
              mediaType="image"
              helperText="Paste an existing image URL or upload a local subject thumbnail."
            />
            <Input name="position" placeholder="Display order" type="number" min="1" />
            <select
              name="status"
              className="h-12 w-full rounded-2xl border border-border bg-card/80 px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              defaultValue="PUBLISHED"
            >
              <option value="DRAFT">DRAFT</option>
              <option value="PUBLISHED">PUBLISHED</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>
            <Button type="submit">Save Subject</Button>
          </form>
        </FormShell>
      </div>
    </AdminShell>
  );
}
