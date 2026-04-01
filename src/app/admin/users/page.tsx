import { createUserAction } from "@/app/admin/actions";
import { deleteUserAction } from "@/app/admin/actions";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminShell } from "@/components/admin/admin-shell";
import { FormShell } from "@/components/admin/form-shell";
import { RowDeleteAction } from "@/components/admin/row-actions";
import { ResourceTable } from "@/components/admin/resource-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAdminFormOptions, getAdminUsers } from "@/server/admin";

export const dynamic = "force-dynamic";

type AdminUsersPageProps = {
  searchParams: Promise<{
    created?: string;
    deleted?: string;
    error?: string;
  }>;
};

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const params = await searchParams;
  const [users, options] = await Promise.all([getAdminUsers(), getAdminFormOptions()]);

  return (
    <AdminShell currentPath="/admin/users">
      <AdminPageHeader
        eyebrow="Users"
        title="Manage platform access and learner accounts."
        description="Review user roles, learner activity, and the accounts that support admin operations."
      />

      <div className="grid gap-8 xl:grid-cols-[1.1fr,0.9fr]">
        {params.created === "user" ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 xl:col-span-2">
            User created successfully.
          </div>
        ) : null}
        {params.deleted === "user" ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 xl:col-span-2">
            User deleted successfully.
          </div>
        ) : null}
        {params.error === "missing-user-fields" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 xl:col-span-2">
            Please add a name, email, and password before saving.
          </div>
        ) : null}
        {params.error === "database-offline" ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 xl:col-span-2">
            Database connection is unavailable, so this user could not be saved.
          </div>
        ) : null}
        {params.error === "forbidden" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 xl:col-span-2">
            Only administrators can manage platform user accounts.
          </div>
        ) : null}
        {params.error === "duplicate-email" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 xl:col-span-2">
            That email address is already assigned to another account.
          </div>
        ) : null}
        {params.error === "duplicate-phone" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 xl:col-span-2">
            That phone number is already assigned to another account.
          </div>
        ) : null}
        {params.error === "duplicate-record" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 xl:col-span-2">
            A user with those details already exists.
          </div>
        ) : null}
        {params.error === "invalid-reference" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 xl:col-span-2">
            The selected linked record could not be found.
          </div>
        ) : null}
        {params.error === "validation-failed" || params.error === "action-failed" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 xl:col-span-2">
            We could not save that user. Please review the form values and try again.
          </div>
        ) : null}

        {params.error === "delete-failed" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 xl:col-span-2">
            We could not delete that user.
          </div>
        ) : null}

        <ResourceTable
          title="User Records"
          columns={["Name", "Email", "Phone", "Role", "Status", "Enrollments", "Actions"]}
          rows={users.map((user) => [
            user.name,
            user.email,
            user.phone ?? "No phone",
            user.role,
            user.status,
            String(user._count.enrollments),
            <RowDeleteAction key={`delete-${user.id}`} action={deleteUserAction} id={user.id} />
          ])}
        />

        <FormShell
          title="Create User"
          description="Add a student, instructor, or admin account to the platform."
        >
          <form action={createUserAction} className="space-y-4">
            <Input name="name" placeholder="Full name" required />
            <Input name="email" placeholder="Email" type="email" required />
            <Input name="phone" placeholder="Phone number" />
            <Input name="password" placeholder="Password" type="password" required />
            <Input name="image" placeholder="Profile image URL" />
            <select
              name="role"
              className="h-12 w-full rounded-2xl border border-border bg-white/80 px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Select role</option>
              {options.roles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
                ))}
              </select>
            <select
              name="instructorId"
              className="h-12 w-full rounded-2xl border border-border bg-white/80 px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Link to instructor profile (optional)</option>
              {options.instructors.map((instructor) => (
                <option key={instructor.id} value={instructor.id}>
                  {instructor.name}
                </option>
              ))}
            </select>
            <select
              name="status"
              className="h-12 w-full rounded-2xl border border-border bg-white/80 px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              defaultValue="ACTIVE"
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="INVITED">INVITED</option>
              <option value="SUSPENDED">SUSPENDED</option>
            </select>
            <Button type="submit">Save User</Button>
          </form>
        </FormShell>
      </div>
    </AdminShell>
  );
}
