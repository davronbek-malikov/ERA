import Link from "next/link";
import { BookOpen, CalendarDays, ChevronLeft, ChevronRight, Users } from "lucide-react";

import { AccessBadge, EnrollmentStatusBadge, PaymentStatusBadge } from "@/components/management/badges";
import { CreateEnrollmentButton, type Workspace } from "@/components/management/enrollment-forms";
import { RecordPaymentButton } from "@/components/management/payment-forms";
import { AddStudentButton } from "@/components/management/teaching-forms";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DataTable } from "@/components/ui/table";
import { SectionHeader, StatStrip } from "@/components/workspace/workspace-ui";
import { cn } from "@/lib/utils";
import { can, type ManagementActor } from "@/server/management/actor";
import { formatMoney, PAYMENT_STATUSES, type PaymentStatus } from "@/server/management/money";
import {
  getManagementSummary,
  listEnrollmentRows,
  listInstructorsForActor,
  listScopedCourses,
  type EnrollmentFilters,
  type EnrollmentRow
} from "@/server/management/queries";
import { formatCalendarDate, isDateString, todayInPlatform } from "@/server/management/time";

/*
 * Student Management dashboard (Admin "Student management" and Teacher "My students").
 * Server-rendered from the database; filters, sorting and pages live in the URL (GET form).
 */

export type SearchParams = Record<string, string | string[] | undefined>;

function one(params: SearchParams, key: string) {
  const value = params[key];
  return typeof value === "string" ? value : undefined;
}

const SORTS = ["student", "course", "start", "end", "price", "paid", "balance", "status"] as const;
const STATUSES = ["current", "all", "ACTIVE", "COMPLETED", "CANCELLED", "EXPIRED", "TRANSFERRED"] as const;

export function parseEnrollmentFilters(params: SearchParams): EnrollmentFilters {
  const date = (key: string) => {
    const value = one(params, key);
    return value && isDateString(value) ? value : undefined;
  };
  const sort = one(params, "sort");
  const status = one(params, "status");
  const payment = one(params, "payment");
  return {
    q: one(params, "q")?.slice(0, 100),
    courseId: one(params, "course") || undefined,
    instructorId: one(params, "teacher") || undefined,
    paymentStatus: PAYMENT_STATUSES.includes(payment as PaymentStatus) ? (payment as PaymentStatus) : undefined,
    enrollmentStatus: STATUSES.includes(status as (typeof STATUSES)[number]) ? (status as EnrollmentFilters["enrollmentStatus"]) : "current",
    dateField: one(params, "dateField") === "end" ? "end" : "start",
    from: date("from"),
    to: date("to"),
    upcomingExams: one(params, "exams") === "1",
    overdue: one(params, "overdue") === "1",
    pendingPayments: one(params, "pending") === "1",
    sort: SORTS.includes(sort as (typeof SORTS)[number]) ? (sort as EnrollmentFilters["sort"]) : undefined,
    dir: one(params, "dir") === "desc" ? "desc" : "asc",
    page: Math.max(1, Number(one(params, "page")) || 1)
  };
}

function money(row: EnrollmentRow, key: "price" | "approved" | "remaining") {
  if (!row.money) return <span className="text-muted-foreground">—</span>;
  const value = row.money[key];
  return <span className="tabular-nums">{formatMoney(value, row.currency)}</span>;
}

export async function StudentManagementDashboard({
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
  const filters = parseEnrollmentFilters(params);
  const rangeFrom = one(params, "rfrom");
  const rangeTo = one(params, "rto");
  const today = todayInPlatform();
  const [summary, list, courses, instructors] = await Promise.all([
    getManagementSummary(actor, { from: rangeFrom && isDateString(rangeFrom) ? rangeFrom : undefined, to: rangeTo && isDateString(rangeTo) ? rangeTo : undefined }),
    listEnrollmentRows(actor, filters),
    listScopedCourses(actor),
    listInstructorsForActor(actor)
  ]);
  const showMoney = can(actor, "viewPayments");
  const filtered = Object.entries(params).some(([key, value]) => key !== "page" && key !== "rfrom" && key !== "rto" && value);

  const pageHref = (page: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (typeof value === "string" && value && key !== "page") query.set(key, value);
    query.set("page", String(page));
    return `${basePath}?${query.toString()}`;
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {actor.kind === "admin" ? "Every student and enrollment in ERA." : "Students assigned to you. Other teachers' students never appear here."}
        </p>
        <span className="flex flex-wrap items-center gap-2">
        <Link href={`${basePath}/courses`} className={cn(buttonVariants({ variant: "outline" }))}>
          <BookOpen />
          Courses &amp; lessons
        </Link>
        {can(actor, "manageEnrollments") ? (
          <AddStudentButton
            workspace={workspace}
            today={today}
            courses={courses.map((course) => ({ id: course.id, title: course.title }))}
            canSetPrice={can(actor, "viewPayments")}
          />
        ) : null}
        {can(actor, "manageEnrollments") && courses.length ? (
          <CreateEnrollmentButton
            workspace={workspace}
            today={today}
            courses={courses.map((course) => ({ id: course.id, title: course.title, instructorId: course.instructorId, instructorName: course.instructor.name }))}
            instructors={instructors}
            permissions={actor.permissions}
          />
        ) : null}
        </span>
      </div>

      <section className="flex flex-col gap-3" aria-label="Summary">
        <StatStrip
          metrics={[
            { label: actor.kind === "admin" ? "Registered students" : "My students", value: summary.students },
            { label: "Active enrollments", value: summary.activeEnrollments },
            { label: "Completed enrollments", value: summary.completedEnrollments },
            { label: "Ending in 30 days", value: summary.endingSoon },
            { label: "Exams in 14 days", value: summary.upcomingExams }
          ]}
        />
        {summary.money ? (
          <>
            <StatStrip
              metrics={[
                { label: "Collected", value: formatMoney(summary.money.collected, "KRW"), hint: `${formatCalendarDate(summary.money.from)} – ${formatCalendarDate(summary.money.to)}` },
                { label: "Outstanding", value: formatMoney(summary.money.outstanding, "KRW"), hint: `${summary.money.overdue} overdue` },
                { label: "Fully paid", value: summary.money.fullyPaid },
                { label: "Partially paid", value: summary.money.partiallyPaid },
                { label: "Unpaid", value: summary.money.unpaid },
                {
                  label: "Pending verification",
                  value: summary.money.pendingCount,
                  hint: summary.money.pendingCount ? formatMoney(summary.money.pendingAmount, "KRW") : undefined
                }
              ]}
            />
            <form action={basePath} method="get" className="flex flex-wrap items-end gap-2 text-sm" aria-label="Reporting period">
              {Object.entries(params).map(([key, value]) =>
                typeof value === "string" && key !== "rfrom" && key !== "rto" ? <input key={key} type="hidden" name={key} value={value} /> : null
              )}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Collected from</span>
                <Input type="date" name="rfrom" defaultValue={summary.money.from} className="h-9" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">to</span>
                <Input type="date" name="rto" defaultValue={summary.money.to} className="h-9" />
              </label>
              <Button type="submit" variant="outline" size="sm">
                Update totals
              </Button>
              <span className="text-xs text-muted-foreground">Totals count approved payments only (minus approved refunds).</span>
            </form>
          </>
        ) : null}
      </section>

      <section className="flex flex-col gap-4" aria-label="Enrollments">
        <SectionHeader title="Students and enrollments" description="One row per student per course. Open a student for full history and payments." />
        <form action={basePath} method="get" role="search" className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-4">
          <label className="flex flex-col gap-1.5 md:col-span-2">
            <span className="text-xs font-medium text-muted-foreground">Student name or email</span>
            <Input type="search" name="q" defaultValue={filters.q} placeholder="Search students" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Course</span>
            <Select name="course" defaultValue={filters.courseId ?? ""}>
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
              <Select name="teacher" defaultValue={filters.instructorId ?? ""}>
                <option value="">All teachers</option>
                {instructors.map((instructor) => (
                  <option key={instructor.id} value={instructor.id}>
                    {instructor.name}
                  </option>
                ))}
              </Select>
            </label>
          ) : (
            <span className="hidden md:block" />
          )}
          {showMoney ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Payment status</span>
              <Select name="payment" defaultValue={filters.paymentStatus ?? ""}>
                <option value="">Any</option>
                <option value="FULLY_PAID">Fully paid</option>
                <option value="PARTIALLY_PAID">Partially paid</option>
                <option value="UNPAID">Unpaid</option>
                <option value="WAIVED">Waived</option>
                <option value="NO_FEE">No fee</option>
              </Select>
            </label>
          ) : null}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Enrollment status</span>
            <Select name="status" defaultValue={filters.enrollmentStatus === "current" ? "" : filters.enrollmentStatus}>
              <option value="">Active</option>
              <option value="all">All (incl. history)</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="EXPIRED">Expired</option>
              <option value="TRANSFERRED">Transferred</option>
            </Select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Dates</span>
            <Select name="dateField" defaultValue={filters.dateField}>
              <option value="start">Course start between</option>
              <option value="end">Course end between</option>
            </Select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">From</span>
              <Input type="date" name="from" defaultValue={filters.from} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">To</span>
              <Input type="date" name="to" defaultValue={filters.to} />
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Sort by</span>
            <span className="flex gap-2">
              <Select name="sort" defaultValue={filters.sort ?? ""}>
                <option value="">Newest start</option>
                <option value="student">Student</option>
                <option value="course">Course</option>
                <option value="start">Start date</option>
                <option value="end">End date</option>
                {showMoney ? (
                  <>
                    <option value="price">Price</option>
                    <option value="paid">Paid</option>
                    <option value="balance">Remaining</option>
                    <option value="status">Payment status</option>
                  </>
                ) : null}
              </Select>
              <Select name="dir" defaultValue={filters.dir} aria-label="Sort direction" className="w-24">
                <option value="asc">↑</option>
                <option value="desc">↓</option>
              </Select>
            </span>
          </label>
          <fieldset className="flex flex-wrap items-center gap-4 text-sm md:col-span-3">
            <legend className="sr-only">Quick filters</legend>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="exams" value="1" defaultChecked={filters.upcomingExams} />
              Upcoming exams
            </label>
            {showMoney ? (
              <>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="overdue" value="1" defaultChecked={filters.overdue} />
                  Overdue payments
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="pending" value="1" defaultChecked={filters.pendingPayments} />
                  Payments awaiting approval
                </label>
              </>
            ) : null}
          </fieldset>
          <div className="flex items-end gap-2">
            <Button type="submit" variant="outline">
              Apply
            </Button>
            {filtered ? (
              <Link href={basePath} className={cn(buttonVariants({ variant: "ghost" }))}>
                Clear
              </Link>
            ) : null}
          </div>
        </form>

        <DataTable
          caption="Students and enrollments"
          rows={list.rows}
          getRowKey={(row) => row.id}
          emptyState={
            filtered ? (
              <EmptyState title="No enrollments match these filters" description="Try other filters, or include history." actionLabel="Clear filters" actionHref={basePath} />
            ) : (
              <EmptyState
                icon={<Users />}
                title="No active enrollments yet"
                description={can(actor, "manageEnrollments") ? "Use New enrollment to add a student to a course." : "Students appear here when they're enrolled with you."}
              />
            )
          }
          columns={[
            {
              key: "student",
              header: "Student",
              mobile: "title",
              cell: (row) => (
                <span className="flex min-w-0 flex-col">
                  <Link href={`${profilePath}/${row.student.id}`} className="font-medium hover:underline">
                    {row.student.name}
                  </Link>
                  <span className="truncate text-xs text-muted-foreground">{row.student.email}</span>
                </span>
              )
            },
            ...(actor.kind === "admin"
              ? [{ key: "teacher", header: "Teacher", mobile: "hidden" as const, cell: (row: EnrollmentRow) => row.teacher?.name ?? <span className="text-muted-foreground">—</span> }]
              : []),
            {
              key: "course",
              header: "Course",
              cell: (row) => (
                <span className="flex flex-col gap-1">
                  <span>{row.course.title}</span>
                  {row.status !== "ACTIVE" ? <EnrollmentStatusBadge status={row.status} /> : null}
                  {row.hasUpcomingExam ? (
                    <Badge variant="accent" className="w-fit">
                      <CalendarDays className="size-3" aria-hidden="true" /> Exam soon
                    </Badge>
                  ) : null}
                </span>
              )
            },
            {
              key: "homework",
              header: "Homework",
              cell: (row) =>
                row.homework.total ? (
                  <span className="flex flex-col gap-1">
                    <span className="tabular-nums">{`${row.homework.done}/${row.homework.total} done`}</span>
                    {row.homework.toCheck ? <Badge variant="warning" className="w-fit">{row.homework.toCheck} to check</Badge> : null}
                    {row.homework.needsWork ? <Badge variant="error" className="w-fit">{row.homework.needsWork} needs work</Badge> : null}
                  </span>
                ) : (
                  <span className="text-muted-foreground">No lessons</span>
                )
            },
            { key: "start", header: "Start", mobile: "hidden", cell: (row) => formatCalendarDate(row.startDate) },
            { key: "end", header: "End", cell: (row) => formatCalendarDate(row.endDate) },
            ...(showMoney
              ? [
                  { key: "price", header: "Price", align: "right" as const, mobile: "hidden" as const, cell: (row: EnrollmentRow) => money(row, "price") },
                  { key: "paid", header: "Paid", align: "right" as const, mobile: "hidden" as const, cell: (row: EnrollmentRow) => money(row, "approved") },
                  { key: "remaining", header: "Remaining", align: "right" as const, cell: (row: EnrollmentRow) => money(row, "remaining") },
                  {
                    key: "payment",
                    header: "Payment",
                    cell: (row: EnrollmentRow) =>
                      row.money ? (
                        <span className="flex flex-col gap-1">
                          <PaymentStatusBadge status={row.money.status} overdue={row.money.overdue} />
                          {row.money.pending ? <span className="text-xs text-muted-foreground">{formatMoney(row.money.pending, row.currency)} pending</span> : null}
                        </span>
                      ) : null
                  }
                ]
              : []),
            {
              key: "access",
              header: "Access",
              cell: (row) => <AccessBadge status={row.accessStatus} allowed={row.accessAllowed} payLater={row.arrangement === "PAY_LATER"} />
            }
          ]}
          rowActions={(row) => (
            <span className="flex flex-wrap justify-end gap-2">
              <Link href={`${profilePath}/${row.student.id}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
                Profile
              </Link>
              {can(actor, "recordPayments") && row.status === "ACTIVE" && row.arrangement !== "WAIVED" ? (
                <RecordPaymentButton enrollmentId={row.id} workspace={workspace} today={today} label="Payment" currency={row.currency} />
              ) : null}
            </span>
          )}
        />

        <nav className="flex items-center justify-between gap-3 text-sm" aria-label="Pages">
          <span className="text-muted-foreground">
            {list.total} enrollment{list.total === 1 ? "" : "s"} · page {list.page} of {list.pages}
          </span>
          <span className="flex gap-2">
            {list.page > 1 ? (
              <Link href={pageHref(list.page - 1)} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                <ChevronLeft /> Previous
              </Link>
            ) : null}
            {list.page < list.pages ? (
              <Link href={pageHref(list.page + 1)} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                Next <ChevronRight />
              </Link>
            ) : null}
          </span>
        </nav>
      </section>
    </div>
  );
}
