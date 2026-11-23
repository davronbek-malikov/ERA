import type { Metadata } from "next";

import { WorkspacePage } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/feedback";
import { BarChart } from "@/components/workspace/bar-chart";
import { SectionHeader } from "@/components/workspace/workspace-ui";
import { getAdminAnalytics } from "@/server/admin-workspace";
import { AskEraZone } from "@/components/ai/ask-era-zone";
import { requireAdmin } from "@/server/workspace";

export const metadata: Metadata = { title: "Analytics", robots: { index: false } };
export const dynamic = "force-dynamic";

const dayLabel = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export default async function AdminAnalyticsPage() {
  await requireAdmin("/admin/analytics");
  const data = await getAdminAnalytics();

  const weekly = data.enrollmentsByWeek.map((point) => ({
    key: point.date.toISOString(),
    label: dayLabel.format(point.date),
    detail: `Week of ${dayLabel.format(point.date)}`,
    value: point.value
  }));
  const daily = (series: typeof data.activityByDay) =>
    series.map((point) => ({ key: point.date.toISOString(), label: dayLabel.format(point.date), value: point.value }));

  return (
    <WorkspaceShell workspace="admin">
      <WorkspacePage className="flex flex-col gap-8">
        <PageHeader
          breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Analytics" }]}
          title="Analytics"
          description="Live platform data. Aggregates only: no individual conversations or private learning data."
        />
        {/* Ask ERA AI on this report: answers use aggregate platform data only (docs/ERA_CONTEXTUAL_AI.md). */}
        <AskEraZone workspace="admin" source={{ type: "report", id: "analytics" }} className="flex flex-col gap-8">

        <section className="flex flex-col gap-4">
          <SectionHeader title="Learning" />
          <div className="grid gap-4 lg:grid-cols-2">
            <BarChart
              title="New enrollments per week"
              description="Last 12 weeks."
              data={weekly}
              valueLabel="Enrollments"
              emptyMessage="No enrollments in the last 12 weeks."
            />
            <BarChart
              title="Average progress by course"
              description="Published courses, by number of enrolled students."
              layout="rows"
              max={100}
              valueSuffix="%"
              valueLabel="Average progress"
              emptyMessage="No published courses with students yet."
              data={data.completionByCourse.map((course) => ({
                key: course.title,
                label: course.title,
                value: course.average,
                detail: `${course.completed} of ${course.total} students completed`
              }))}
            />
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <SectionHeader title="Activity" />
          <div className="grid gap-4 lg:grid-cols-2">
            <BarChart
              title="Platform activity per day"
              description="Logged events (study sessions, completions, content changes), last 30 days."
              data={daily(data.activityByDay)}
              valueLabel="Events"
              emptyMessage="No activity in the last 30 days."
            />
            <BarChart
              title="ERA Tutor questions per day"
              description="Questions students asked the tutor, last 30 days. Counted only; content isn't read."
              data={daily(data.tutorQuestionsByDay)}
              valueLabel="Questions"
              emptyMessage="No tutor questions in the last 30 days."
            />
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <SectionHeader title="AI usage and cost" />
            <Badge variant="warning">Placeholder</Badge>
          </div>
          <Alert variant="info" title="Token usage, cost and quotas aren't tracked yet">
            ERA doesn&apos;t record AI tokens or cost yet; that needs the usage tracking planned in the information
            architecture (S-USAGE). The tutor question count above is real; nothing in this section is.
          </Alert>
        </section>
        </AskEraZone>
      </WorkspacePage>
    </WorkspaceShell>
  );
}
