import { createInstructorAction } from "@/app/admin/actions";
import { deleteInstructorAction } from "@/app/admin/actions";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminShell } from "@/components/admin/admin-shell";
import { FormShell } from "@/components/admin/form-shell";
import { RowDeleteAction } from "@/components/admin/row-actions";
import { ResourceTable } from "@/components/admin/resource-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getAdminInstructors } from "@/server/admin";

export const dynamic = "force-dynamic";

type AdminInstructorsPageProps = {
  searchParams: Promise<{
    created?: string;
    deleted?: string;
    error?: string;
  }>;
};

export default async function AdminInstructorsPage({ searchParams }: AdminInstructorsPageProps) {
  const params = await searchParams;
  const instructors = await getAdminInstructors();

  return (
    <AdminShell currentPath="/admin/instructors">
      <AdminPageHeader
        eyebrow="Instructors"
        title="Manage your teaching roster."
        description="Create instructor profiles and connect them to the courses they lead in the catalog."
      />

      <div className="grid gap-8 xl:grid-cols-[1.1fr,0.9fr]">
        {params.created === "instructor" ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 xl:col-span-2">
            Instructor created successfully.
          </div>
        ) : null}
        {params.deleted === "instructor" ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 xl:col-span-2">
            Instructor deleted successfully.
          </div>
        ) : null}
        {params.error === "missing-instructor-fields" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 xl:col-span-2">
            Please add the instructor name before saving.
          </div>
        ) : null}
        {params.error === "database-offline" ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 xl:col-span-2">
            Database connection is unavailable, so this instructor could not be saved.
          </div>
        ) : null}
        {params.error === "forbidden" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 xl:col-span-2">
            Only administrators can manage instructor profiles.
          </div>
        ) : null}
        {params.error === "instructor-in-use" ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 xl:col-span-2">
            This instructor is attached to existing courses, so delete those course assignments first.
          </div>
        ) : null}
        {params.error === "delete-failed" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 xl:col-span-2">
            We could not delete that instructor.
          </div>
        ) : null}

        <ResourceTable
          title="Instructor Records"
          columns={["Name", "Title", "Email", "Courses", "Updated", "Actions"]}
          rows={instructors.map((instructor) => [
            instructor.name,
            instructor.title ?? "Instructor",
            instructor.email ?? "No email",
            String(instructor._count.courses),
            instructor.updatedAt.toLocaleDateString("en-US"),
            <RowDeleteAction
              key={`delete-${instructor.id}`}
              action={deleteInstructorAction}
              id={instructor.id}
            />
          ])}
        />

        <FormShell
          title="Create Instructor"
          description="Add an instructor profile for course assignment and display."
        >
          <form action={createInstructorAction} className="space-y-4">
            <Input name="name" placeholder="Full name" required />
            <Input name="slug" placeholder="Slug (optional)" />
            <Input name="title" placeholder="Professional title" />
            <Input name="email" placeholder="Email" type="email" />
            <Input name="imageUrl" placeholder="Profile image URL" />
            <Textarea name="bio" placeholder="Biography" />
            <Button type="submit">Save Instructor</Button>
          </form>
        </FormShell>
      </div>
    </AdminShell>
  );
}
