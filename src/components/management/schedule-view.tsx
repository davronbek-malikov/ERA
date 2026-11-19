import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Flag, GraduationCap, Wallet } from "lucide-react";

import type { SearchParams } from "@/components/management/dashboard-view";
import type { Workspace } from "@/components/management/enrollment-forms";
import { DeleteExamButton, ExamFormButton } from "@/components/management/misc-forms";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { can, type ManagementActor } from "@/server/management/actor";
import { listCalendarEvents, listInstructorsForActor, listScopedCourses, type CalendarEvent } from "@/server/management/queries";
import { addDays, formatCalendarDate, isDateString, monthRange, platformTimezone, todayInPlatform, weekRange } from "@/server/management/time";

/*
 * Exams & schedule: month, week and upcoming-list views of exams, course starts/ends and (with permission)
 * payment due dates. Navigation and filters are URL parameters, so every view is a link.
 */

const KIND: Record<CalendarEvent["kind"], { label: string; icon: React.ReactNode; variant: "accent" | "primary" | "neutral" | "warning" }> = {
  exam: { label: "Exam", icon: <GraduationCap className="size-3" aria-hidden="true" />, variant: "accent" },
  "course-start": { label: "Course start", icon: <Flag className="size-3" aria-hidden="true" />, variant: "primary" },
  "course-end": { label: "Course end", icon: <Flag className="size-3" aria-hidden="true" />, variant: "neutral" },
  "payment-due": { label: "Payment due", icon: <Wallet className="size-3" aria-hidden="true" />, variant: "warning" }
};

function one(params: SearchParams, key: string) {
  const value = params[key];
  return typeof value === "string" ? value : undefined;
}

export async function ScheduleView({
  actor,
  params,
  basePath,
  profilePath,
  workspace
}: {
  actor: ManagementActor;
  params: SearchParams;
  basePath: string;
  profilePath: string;
  workspace: Workspace;
}) {
  const today = todayInPlatform();
  const view = one(params, "view") === "week" ? "week" : one(params, "view") === "list" ? "list" : "month";
  const anchorParam = one(params, "date");
  const anchor = anchorParam && isDateString(anchorParam) ? anchorParam : today;
  const [from, to] = view === "week" ? weekRange(anchor) : view === "list" ? [today, addDays(today, 60)] : monthRange(anchor);
  const courseId = one(params, "course") || undefined;
  const instructorId = one(params, "teacher") || undefined;
  const studentId = one(params, "student") || undefined;

  const [events, courses, instructors] = await Promise.all([
    listCalendarEvents(actor, { from, to, courseId, instructorId, studentId }),
    listScopedCourses(actor),
    listInstructorsForActor(actor)
  ]);

  const href = (overrides: Record<string, string | undefined>) => {
    const query = new URLSearchParams();
    const base: Record<string, string | undefined> = { view, date: anchor, course: courseId, teacher: instructorId, student: studentId };
    for (const [key, value] of Object.entries({ ...base, ...overrides })) if (value) query.set(key, value);
    return `${basePath}?${query.toString()}`;
  };
  const previous = view === "week" ? addDays(from, -7) : addDays(from, -1);
  const next = view === "week" ? addDays(from, 7) : addDays(to, 1);
  const byDate = new Map<string, CalendarEvent[]>();
  for (const event of events) byDate.set(event.date, [...(byDate.get(event.date) ?? []), event]);

  function EventChip({ event, compact }: { event: CalendarEvent; compact?: boolean }) {
    const meta = KIND[event.kind];
    return (
      <span className={cn("flex min-w-0 flex-col rounded-md border border-border bg-surface px-2 py-1", compact && "text-xs")}>
        <span className="flex items-center gap-1">
          <Badge variant={meta.variant} className="shrink-0">
            {meta.icon}
            {compact ? null : meta.label}
          </Badge>
          {event.startTime ? <span className="tabular-nums text-muted-foreground">{event.startTime}</span> : null}
        </span>
        {event.studentId ? (
          <Link href={`${profilePath}/${event.studentId}`} className="truncate font-medium hover:underline">
            {event.title}
          </Link>
        ) : (
          <span className="truncate font-medium">{event.title}</span>
        )}
        <span className="truncate text-muted-foreground">{event.detail}</span>
      </span>
    );
  }

  const days: string[] = [];
  if (view !== "list") {
    const [gridStart] = weekRange(from);
    const gridEnd = weekRange(to)[1];
    for (let day = gridStart; day <= gridEnd; day = addDays(day, 1)) days.push(day);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Calendar view" className="flex flex-wrap gap-2">
          {(["month", "week", "list"] as const).map((item) => (
            <Link key={item} href={href({ view: item })} aria-current={item === view ? "page" : undefined} className={cn(buttonVariants({ variant: item === view ? "default" : "outline", size: "sm" }))}>
              {item === "month" ? "Month" : item === "week" ? "Week" : "Upcoming"}
            </Link>
          ))}
        </nav>
        {can(actor, "exams") && courses.length ? (
          <ExamFormButton workspace={workspace} courses={courses.map((course) => ({ id: course.id, title: course.title }))} today={today} timezone={platformTimezone()} />
        ) : null}
      </div>

      <form action={basePath} method="get" className="flex flex-wrap items-end gap-3" aria-label="Calendar filters">
        <input type="hidden" name="view" value={view} />
        <input type="hidden" name="date" value={anchor} />
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Course</span>
          <Select name="course" defaultValue={courseId ?? ""} className="w-56">
            <option value="">All courses</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </Select>
        </label>
        {actor.kind === "admin" ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Teacher</span>
            <Select name="teacher" defaultValue={instructorId ?? ""} className="w-48">
              <option value="">All teachers</option>
              {instructors.map((instructor) => (
                <option key={instructor.id} value={instructor.id}>
                  {instructor.name}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
        {studentId ? <input type="hidden" name="student" value={studentId} /> : null}
        <Button type="submit" variant="outline">
          Apply
        </Button>
        {studentId ? (
          <Link href={href({ student: undefined })} className={cn(buttonVariants({ variant: "ghost" }))}>
            Show all students
          </Link>
        ) : null}
      </form>

      {view !== "list" ? (
        <div className="flex items-center justify-between gap-2">
          <Link href={href({ date: previous })} className={cn(buttonVariants({ variant: "outline", size: "sm" }))} aria-label="Previous">
            <ChevronLeft />
          </Link>
          <h2 className="section-title">
            {view === "week" ? `${formatCalendarDate(from)} – ${formatCalendarDate(to)}` : new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${from}T00:00:00Z`))}
          </h2>
          <span className="flex gap-2">
            <Link href={href({ date: today })} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
              Today
            </Link>
            <Link href={href({ date: next })} className={cn(buttonVariants({ variant: "outline", size: "sm" }))} aria-label="Next">
              <ChevronRight />
            </Link>
          </span>
        </div>
      ) : null}

      {view === "list" ? (
        events.length ? (
          <ol className="flex flex-col gap-3">
            {[...byDate.entries()].map(([date, items]) => (
              <li key={date} className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">
                  {formatCalendarDate(date, { weekday: true })}
                  {date === today ? " · Today" : ""}
                </h3>
                <ul className="flex flex-col gap-2">
                  {items.map((event) => (
                    <li key={event.id} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
                      <span className="flex flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <Badge variant={KIND[event.kind].variant}>
                            {KIND[event.kind].icon}
                            {KIND[event.kind].label}
                          </Badge>
                          <span className="font-medium">{event.title}</span>
                          {event.status && event.kind === "exam" && event.status !== "SCHEDULED" ? <Badge variant="neutral">{event.status.toLowerCase()}</Badge> : null}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {event.detail}
                          {event.startTime ? ` · ${event.startTime}${event.endTime ? `–${event.endTime}` : ""}` : ""}
                          {event.teacher ? ` · ${event.teacher}` : ""}
                          {event.students?.length ? ` · ${event.students.map((student) => student.name).join(", ")}` : ""}
                        </span>
                      </span>
                      {event.kind === "exam" && event.examId ? (
                        <span className="flex gap-2">
                          <ExamFormButton
                            workspace={workspace}
                            courses={courses.map((course) => ({ id: course.id, title: course.title }))}
                            today={today}
                            timezone={platformTimezone()}
                            initial={{
                              id: event.examId,
                              courseId: event.courseId,
                              title: event.title,
                              description: null,
                              examDate: event.date,
                              startTime: event.startTime ?? "10:00",
                              endTime: event.endTime,
                              status: event.status ?? "SCHEDULED",
                              enrollmentIds: []
                            }}
                          />
                          <DeleteExamButton examId={event.examId} workspace={workspace} title={event.title} />
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState icon={<CalendarDays />} title="Nothing in the next 60 days" description="Exams, course dates and payment due dates appear here." />
        )
      ) : (
        <div className="overflow-x-auto">
          <div className="grid min-w-[42rem] grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
              <div key={day} className="bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                {day}
              </div>
            ))}
            {days.map((day) => {
              const items = byDate.get(day) ?? [];
              const outside = day < from || day > to;
              return (
                <div key={day} className={cn("flex min-h-28 flex-col gap-1 bg-card p-1.5", outside && "bg-muted/40 text-muted-foreground", view === "week" && "min-h-64")}>
                  <span className={cn("self-end rounded-full px-1.5 text-xs tabular-nums", day === today && "bg-primary text-primary-foreground")} aria-label={formatCalendarDate(day)}>
                    {Number(day.slice(8))}
                  </span>
                  {items.slice(0, view === "week" ? 20 : 3).map((event) => (
                    <EventChip key={event.id} event={event} compact={view === "month"} />
                  ))}
                  {view === "month" && items.length > 3 ? (
                    <Link href={href({ view: "week", date: day })} className="text-xs text-primary hover:underline">
                      +{items.length - 3} more
                    </Link>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">All dates and times are in {platformTimezone()}.</p>
    </div>
  );
}
