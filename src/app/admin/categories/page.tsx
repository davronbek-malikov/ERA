import { createCategoryAction } from "@/app/admin/actions";
import { deleteCategoryAction } from "@/app/admin/actions";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { RowDeleteAction } from "@/components/admin/row-actions";
import { AdminShell } from "@/components/admin/admin-shell";
import { FormShell } from "@/components/admin/form-shell";
import { ResourceTable } from "@/components/admin/resource-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getAdminCategories, getAdminFormOptions } from "@/server/admin";

export const dynamic = "force-dynamic";

type AdminCategoriesPageProps = {
  searchParams: Promise<{
    created?: string;
    deleted?: string;
    error?: string;
  }>;
};

export default async function AdminCategoriesPage({ searchParams }: AdminCategoriesPageProps) {
  const params = await searchParams;
  const [categories, options] = await Promise.all([getAdminCategories(), getAdminFormOptions()]);

  return (
    <AdminShell currentPath="/admin/categories">
      <AdminPageHeader
        eyebrow="Categories"
        title="Manage category groupings within each subject."
        description="Categories shape how students browse each subject and how courses stay organized as the catalog grows."
      />

      <div className="grid gap-8 xl:grid-cols-[1.1fr,0.9fr]">
        {params.created === "category" ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 xl:col-span-2">
            Category created successfully.
          </div>
        ) : null}
        {params.deleted === "category" ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 xl:col-span-2">
            Category deleted successfully.
          </div>
        ) : null}
        {params.error === "missing-category-fields" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 xl:col-span-2">
            Please select a subject and add a category name before saving.
          </div>
        ) : null}
        {params.error === "database-offline" ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 xl:col-span-2">
            Database connection is unavailable, so this category could not be saved.
          </div>
        ) : null}
        {params.error === "forbidden" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 xl:col-span-2">
            Only administrators can manage subject categories.
          </div>
        ) : null}

        {params.error === "delete-failed" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 xl:col-span-2">
            We could not delete that category.
          </div>
        ) : null}

        <ResourceTable
          title="Category Records"
          columns={["Category", "Subject", "Status", "Courses", "Updated", "Actions"]}
          rows={categories.map((category) => [
            category.name,
            category.subject.name,
            category.status,
            String(category._count.courses),
            category.updatedAt.toLocaleDateString("en-US"),
            <RowDeleteAction key={`delete-${category.id}`} action={deleteCategoryAction} id={category.id} />
          ])}
        />

        <FormShell
          title="Create Category"
          description="Create a new category and attach it to a parent subject."
        >
          <form action={createCategoryAction} className="space-y-4">
            <Input name="name" placeholder="Category name" required />
            <Input name="slug" placeholder="Slug (optional)" />
            <select
              name="subjectId"
              required
              className="h-12 w-full rounded-2xl border border-border bg-white/80 px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Select subject</option>
              {options.subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
            <Textarea name="description" placeholder="Description" />
            <Input name="position" placeholder="Display order" type="number" min="1" />
            <select
              name="status"
              className="h-12 w-full rounded-2xl border border-border bg-white/80 px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              defaultValue="PUBLISHED"
            >
              <option value="DRAFT">DRAFT</option>
              <option value="PUBLISHED">PUBLISHED</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>
            <Button type="submit">Save Category</Button>
          </form>
        </FormShell>
      </div>
    </AdminShell>
  );
}
