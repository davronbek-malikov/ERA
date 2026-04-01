import { ActivityFeed } from "@/components/admin/activity-feed";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminShell } from "@/components/admin/admin-shell";
import { StatsGrid } from "@/components/admin/stats-grid";
import { getCurrentUser } from "@/lib/auth";
import { getAdminDashboardData } from "@/server/admin";

export const dynamic = "force-dynamic";

type AdminDashboardPageProps = {
  searchParams: Promise<{
    signedIn?: string;
  }>;
};

export default async function AdminDashboardPage({ searchParams }: AdminDashboardPageProps) {
  const params = await searchParams;
  const [dashboard, currentUser] = await Promise.all([getAdminDashboardData(), getCurrentUser()]);

  return (
    <AdminShell currentPath="/admin">
      <AdminPageHeader
        eyebrow={currentUser?.role === "INSTRUCTOR" ? "Instructor Studio" : "Admin Dashboard"}
        title={
          currentUser?.role === "INSTRUCTOR"
            ? "Manage your teaching content from one place."
            : "Control the ERA platform from one place."
        }
        description={
          currentUser?.role === "INSTRUCTOR"
            ? "Monitor your courses, lesson publishing, materials, and learner progress without admin-only clutter."
            : "Track platform growth, monitor content operations, and manage the catalog structure from a dedicated admin workspace."
        }
      />

      {params.signedIn === "1" ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Signed in successfully. Your studio is ready.
        </div>
      ) : null}

      <StatsGrid
        stats={[
          {
            label: currentUser?.role === "INSTRUCTOR" ? "Managed Students" : "Total Users",
            value: dashboard.totalUsers,
            detail:
              currentUser?.role === "INSTRUCTOR"
                ? "Learners enrolled in your assigned courses."
                : "Students and admins currently in the system."
          },
          {
            label: "Total Courses",
            value: dashboard.totalCourses,
            detail: "Published and draft course records across all subjects."
          },
          {
            label: "Total Enrollments",
            value: dashboard.totalEnrollments,
            detail: "Course enrollments recorded across the learner base."
          }
        ]}
      />

      <ActivityFeed activity={dashboard.recentActivity} />
    </AdminShell>
  );
}
