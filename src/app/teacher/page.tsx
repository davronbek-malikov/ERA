import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, CheckCircle2, ClipboardCheck, FilePlus2, Plus, Sparkles, Users, XCircle } from "lucide-react";

import { CourseStatusBadge } from "@/components/education/course-status";
import { WorkspacePage } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { ListPanel, ListRow, SectionHeader, StatStrip } from "@/components/workspace/workspace-ui";
import { formatRelativeDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getTeacherDashboard } from "@/server/teacher";
import { getTeacherInstructorId, requireTeacher } from "@/server/workspace";

export const metadata: Metadata = { title: "Teacher dashboard", robots: { index: false } };
export const dynamic = "force-dynamic";

const activityCopy = {
  "lesson-completed": { label: "completed", icon: <CheckCircle2 className="size-4 text-success" aria-hidden="true" /> },
  "practice-passed": { label: "passed practice", icon: <CheckCircle2 className="size-4 text-success" aria-hidden="true" /> },
  "practice-failed": { label: "tried practice", icon: <XCircle className="size-4 text-muted-foreground" aria-hidden="true" /> }
};

export default async function TeacherDashboardPage() {
  const user = await requireTeacher("/teacher");
  const instructorId = await getTeacherInstructorId(user);
  const firstName = user.name.split(" ")[0];

  const quickActions = [
    { href: "/admin/courses", label: "Create course", icon: <Plus /> },
    { href: "/admin/lessons", label: "Create lesson", icon: <FilePlus2 /> },
    { href: "/teacher/assignments", label: "Create assignment", icon: <ClipboardCheck /> },
    { href: "/teacher/students", label: "View students", icon: <Users /> },
    { href: "/teacher/assistant", label: "Open ERA Assistant", icon: <Sparkles /> }
  ];

  if (!instructorId) {
    return (
      <WorkspaceShell workspace="teacher">
        <WorkspacePage className="flex flex-col gap-6">
          <PageHeader title={`Welcome, ${firstName}`} description="Your teaching workspace." />
          <Alert variant="warning" title="Your account isn't linked to a teacher profile yet">
            Courses, lessons and students appear here once an administrator links your account to a teacher profile. Until
            then you won&apos;t see any course data.
          </Alert>
        </WorkspacePage>
      </WorkspaceShell>
    );
  }

  const data = await getTeacherDashboard(instructorId);

  return (
    <WorkspaceShell workspace="teacher">
      <WorkspacePage className="flex flex-col gap-8">
        <PageHeader
          eyebrow="Teacher workspace"
          title={`Welcome back, ${firstName}`}
          description="Here's what's happening across your courses."
        />

        <nav aria-label="Quick actions" className="flex flex-wrap gap-2">
          {quickActions.map((action, index) => (
            <Link key={action.href} href={action.href} className={cn(buttonVariants({ variant: index === 0 ? "primary" : "outline" }))}>
              {action.icon}
              {action.label}
            </Link>
          ))}
        </nav>

        <StatStrip
          metrics={[
            { label: "Active courses", value: data.activeCourseCount, hint: `${data.courses.length} in total` },
            { label: "Enrolled students", value: data.studentCount },
            { label: "Practice exercises", value: data.exerciseCount, hint: "Checked automatically" },
            { label: "Pending assignments", value: "—", hint: "Homework isn't available yet" }
          ]}
        />

        <div className="grid gap-8 lg:grid-cols-2">
          <section className="flex flex-col gap-3" aria-labelledby="courses-heading">
            <SectionHeader
              title="Active courses"
              action={
                <Link href="/teacher/courses" className="text-sm font-medium text-primary hover:underline">
                  All courses
                </Link>
              }
            />
            {data.courses.length === 0 ? (
              <EmptyState
                icon={<BookOpen />}
                title="No courses yet"
                description="Create your first course to start teaching on ERA."
                actionLabel="Create course"
                actionHref="/admin/courses"
              />
            ) : (
              <ListPanel label="Your courses">
                {data.courses.slice(0, 5).map((course) => (
                  <ListRow key={course.id}>
                    <Link href={`/teacher/lessons?course=${course.id}`} className="min-w-0 flex-1 truncate font-medium hover:text-primary">
                      {course.title}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {course._count.enrollments} students · {course._count.lessons} lessons
                    </span>
                    <CourseStatusBadge status={course.status} />
                  </ListRow>
                ))}
              </ListPanel>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <SectionHeader title="Recent student activity" description="Lessons completed and practice attempts in your courses." />
            {data.activity.length === 0 ? (
              <EmptyState title="No activity yet" description="Student activity in your courses will appear here." />
            ) : (
              <ListPanel label="Recent student activity">
                {data.activity.map((item) => (
                  <ListRow key={item.id} className="flex-nowrap items-start">
                    <span className="mt-0.5">{activityCopy[item.kind].icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-medium">{item.studentName}</span> {activityCopy[item.kind].label}{" "}
                        <span className="font-medium">{item.title}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.courseTitle} · {formatRelativeDate(item.at)}
                      </p>
                    </div>
                  </ListRow>
                ))}
              </ListPanel>
            )}
          </section>
        </div>

        <section className="flex flex-col gap-3">
          <SectionHeader
            title="Recently created lessons"
            action={
              <Link href="/teacher/lessons" className="text-sm font-medium text-primary hover:underline">
                All lessons
              </Link>
            }
          />
          {data.recentLessons.length === 0 ? (
            <EmptyState title="No lessons yet" description="Lessons you create will appear here." actionLabel="Create lesson" actionHref="/admin/lessons" />
          ) : (
            <ListPanel label="Recently created lessons">
              {data.recentLessons.map((lesson) => (
                <ListRow key={lesson.id}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{lesson.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {lesson.course.title} · created {formatRelativeDate(lesson.createdAt)}
                    </p>
                  </div>
                  <CourseStatusBadge status={lesson.status} />
                  <Link href={`/admin/lessons?edit=${lesson.id}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
                    Edit
                  </Link>
                </ListRow>
              ))}
            </ListPanel>
          )}
        </section>
      </WorkspacePage>
    </WorkspaceShell>
  );
}
