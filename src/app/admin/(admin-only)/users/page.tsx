import type { Metadata } from "next";
import Link from "next/link";
import { Trash2, Users } from "lucide-react";

import { createUserAction, deleteUserAction } from "@/app/admin/actions";
import { WorkspacePage } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Alert } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DataTable } from "@/components/ui/table";
import { FilterBar, SectionHeader } from "@/components/workspace/workspace-ui";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getAdminFormOptions } from "@/server/admin";
import { getAdminUserList } from "@/server/admin-workspace";
import { requireAdmin } from "@/server/workspace";

export const metadata: Metadata = { title: "Users", robots: { index: false } };
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ q?: string; role?: string; status?: string; created?: string; deleted?: string; error?: string }>;
};

const roleLabels: Record<string, string> = { STUDENT: "Student", INSTRUCTOR: "Teacher", ADMIN: "Administrator" };
const statusVariant: Record<string, "success" | "warning" | "error" | "neutral"> = {
  ACTIVE: "success",
  INVITED: "warning",
  SUSPENDED: "error"
};

const feedback: Record<string, { variant: "success" | "error" | "warning"; text: string }> = {
  "created:user": { variant: "success", text: "User created." },
  "deleted:user": { variant: "success", text: "User deleted." },
  "error:missing-user-fields": { variant: "error", text: "Add a name, email and password before saving." },
  "error:duplicate-email": { variant: "error", text: "An account with that email or phone already exists." },
  "error:database-offline": { variant: "warning", text: "The database is unavailable, so the change wasn't saved." },
  "error:forbidden": { variant: "error", text: "Only administrators can manage user accounts." },
  "error:delete-failed": { variant: "error", text: "That user couldn't be deleted." },
  "error:cannot-delete-self": { variant: "error", text: "You can't delete your own account." },
  "error:last-admin": { variant: "error", text: "The last administrator account can't be deleted." },
  "error:invalid-url": { variant: "error", text: "Use a full http(s) link for the image." }
};

export default async function AdminUsersPage({ searchParams }: PageProps) {
  await requireAdmin("/admin/users");
  const params = await searchParams;
  const [{ users, counts }, options] = await Promise.all([getAdminUserList(params), getAdminFormOptions()]);
  const message =
    feedback[`created:${params.created}`] ?? feedback[`deleted:${params.deleted}`] ?? feedback[`error:${params.error}`] ?? null;

  const tabs = [
    { role: "", label: "All", count: counts.all },
    { role: "STUDENT", label: "Students", count: counts.STUDENT },
    { role: "INSTRUCTOR", label: "Teachers", count: counts.INSTRUCTOR },
    { role: "ADMIN", label: "Administrators", count: counts.ADMIN }
  ];
  const tabHref = (role: string) => {
    const query = new URLSearchParams({ ...(role ? { role } : {}), ...(params.q ? { q: params.q } : {}), ...(params.status ? { status: params.status } : {}) });
    const text = query.toString();
    return text ? `/admin/users?${text}` : "/admin/users";
  };

  return (
    <WorkspaceShell workspace="admin">
      <WorkspacePage className="flex flex-col gap-6">
        <PageHeader
          breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Users" }]}
          title="Users"
          description="Student, teacher and administrator accounts. Admins see account details only, never private learning data."
          actions={
            <a href="#create-user" className={cn("inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90")}>
              Create user
            </a>
          }
        />

        {message ? (
          <Alert variant={message.variant}>{message.text}</Alert>
        ) : null}

        <nav aria-label="User types" className="flex gap-1 overflow-x-auto border-b border-border">
          {tabs.map((tab) => {
            const current = (params.role ?? "") === tab.role;
            return (
              <Link
                key={tab.label}
                href={tabHref(tab.role)}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium",
                  current ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
                <span className="rounded-full bg-secondary px-1.5 text-xs tabular-nums text-secondary-foreground">{tab.count}</span>
              </Link>
            );
          })}
        </nav>

        <FilterBar
          action="/admin/users"
          query={params.q}
          searchLabel="Search"
          searchPlaceholder="Name, email or phone"
          applyLabel="Apply"
          clearLabel="Clear"
          selects={[
            ...(params.role ? [{ name: "role", label: "Role", value: params.role, options: [{ value: params.role, label: roleLabels[params.role] ?? params.role }, { value: "", label: "All roles" }] }] : []),
            {
              name: "status",
              label: "Status",
              value: params.status,
              options: [
                { value: "", label: "All statuses" },
                { value: "ACTIVE", label: "Active" },
                { value: "INVITED", label: "Invited" },
                { value: "SUSPENDED", label: "Suspended" }
              ]
            }
          ]}
        />

        <DataTable
          caption="User accounts"
          rows={users}
          getRowKey={(user) => user.id}
          emptyState={<EmptyState icon={<Users />} title="No users match" description="Try a different search, role or status." actionLabel="Clear filters" actionHref="/admin/users" />}
          columns={[
            {
              key: "name",
              header: "Name",
              mobile: "title",
              cell: (user) => (
                <div className="min-w-0">
                  <p className="truncate font-medium">{user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                </div>
              )
            },
            { key: "phone", header: "Phone", mobile: "hidden", cell: (user) => user.phone ?? <span className="text-muted-foreground">—</span> },
            { key: "role", header: "Role", cell: (user) => roleLabels[user.role] ?? user.role },
            { key: "status", header: "Status", cell: (user) => <Badge variant={statusVariant[user.status] ?? "neutral"}>{user.status.toLowerCase()}</Badge> },
            { key: "enrollments", header: "Enrollments", align: "right", mobile: "hidden", cell: (user) => user._count.enrollments },
            { key: "created", header: "Joined", mobile: "hidden", cell: (user) => formatShortDate(user.createdAt) }
          ]}
          rowActions={(user) => (
            <ConfirmDialog
              trigger={
                <Button variant="ghost" size="icon-sm" aria-label={`Delete ${user.name}`}>
                  <Trash2 />
                </Button>
              }
              title={`Delete ${user.name}?`}
              description={
                <span>
                  This permanently deletes the account and everything linked to it: enrollments, progress, practice submissions and
                  ERA conversations. If they&apos;re a teacher, materials they uploaded are deleted too.
                </span>
              }
              impact={[{ label: "Enrollments", count: user._count.enrollments }]}
              confirmPhrase={user.email}
              confirmLabel="Delete user"
              destructive
              formAction={deleteUserAction}
              fields={{ id: user.id }}
            />
          )}
        />
        {users.length === 200 ? <p className="text-xs text-muted-foreground">Showing the 200 most recent accounts. Use search to narrow the list.</p> : null}

        <section id="create-user" className="flex scroll-mt-24 flex-col gap-4 border-t border-border pt-8">
          <SectionHeader title="Create user" description="Add a student, teacher or administrator account." />
          <form action={createUserAction} className="grid max-w-narrow gap-4 sm:grid-cols-2">
            <Field id="new-name" label="Full name" required>
              <Input id="new-name" name="name" required autoComplete="off" />
            </Field>
            <Field id="new-email" label="Email" required>
              <Input id="new-email" name="email" type="email" required autoComplete="off" />
            </Field>
            <Field id="new-phone" label="Phone">
              <Input id="new-phone" name="phone" autoComplete="off" />
            </Field>
            <Field id="new-password" label="Password" required>
              <Input id="new-password" name="password" type="password" required autoComplete="new-password" />
            </Field>
            <Field id="new-role" label="Role" required>
              <Select id="new-role" name="role" defaultValue="STUDENT">
                {options.roles.map((role) => (
                  <option key={role} value={role}>
                    {roleLabels[role] ?? role}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="new-status" label="Status">
              <Select id="new-status" name="status" defaultValue="ACTIVE">
                <option value="ACTIVE">Active</option>
                <option value="INVITED">Invited</option>
                <option value="SUSPENDED">Suspended</option>
              </Select>
            </Field>
            <Field id="new-instructor" label="Teacher profile" hint="Only for teachers: links the account to a public teacher profile." className="sm:col-span-2">
              <Select id="new-instructor" name="instructorId" defaultValue="">
                <option value="">No teacher profile</option>
                {options.instructors.map((instructor) => (
                  <option key={instructor.id} value={instructor.id}>
                    {instructor.name}
                  </option>
                ))}
              </Select>
            </Field>
            <input type="hidden" name="image" value="" />
            <div className="sm:col-span-2">
              <Button type="submit">Create user</Button>
            </div>
          </form>
        </section>
      </WorkspacePage>
    </WorkspaceShell>
  );
}
