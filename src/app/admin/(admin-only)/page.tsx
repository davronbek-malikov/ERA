import type { Metadata } from "next";
import Link from "next/link";
import { Activity } from "lucide-react";

import { WorkspacePage } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { ListPanel, ListRow, SectionHeader, StatStrip } from "@/components/workspace/workspace-ui";
import { formatRelativeDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getAdminOverview } from "@/server/admin-workspace";
import { requireAdmin } from "@/server/workspace";

export const metadata: Metadata = { title: "Admin overview", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  // Admins only. Instructors are sent to the Teacher Workspace.
  const user = await requireAdmin("/admin");
  const data = await getAdminOverview();

  return (
    <WorkspaceShell workspace="admin">
      <WorkspacePage className="flex flex-col gap-8">
        <PageHeader
          eyebrow="Admin workspace"
          title={`Welcome back, ${user.name.split(" ")[0]}`}
          description="Platform health at a glance. Counts are live; nothing here shows private learning data."
          actions={
            <>
              <Link href="/admin/analytics" className={cn(buttonVariants({ variant: "outline" }))}>
                View analytics
              </Link>
              <Link href="/admin/users" className={cn(buttonVariants())}>
                Manage users
              </Link>
            </>
          }
        />

        <StatStrip
          metrics={[
            { label: "Students", value: data.students },
            { label: "Teachers", value: data.teachers, hint: `${data.admins} administrators` },
            { label: "Active courses", value: data.publishedCourses, hint: `${data.totalCourses} in total` },
            { label: "Organizations", value: "1", hint: "Single organization (not set up yet)" },
            { label: "Enrollments", value: data.enrollments },
            {
              label: "Course completion",
              value: data.completionRate === null ? "—" : `${data.completionRate}%`,
              hint: "Enrollments at 100%"
            }
          ]}
        />

        <section className="flex flex-col gap-3">
          <SectionHeader title="Recent platform activity" description="Account, content and learning events across ERA." />
          {data.activity.length === 0 ? (
            <EmptyState icon={<Activity />} title="No activity yet" description="Platform events will appear here." />
          ) : (
            <ListPanel label="Recent platform activity">
              {data.activity.map((event) => (
                <ListRow key={event.id}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{event.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {event.user?.name ?? "System"} · {formatRelativeDate(event.createdAt)}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">{event.type.replaceAll("_", " ").toLowerCase()}</span>
                </ListRow>
              ))}
            </ListPanel>
          )}
        </section>
      </WorkspacePage>
    </WorkspaceShell>
  );
}
