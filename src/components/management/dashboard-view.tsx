import Link from "next/link";
import { BookOpen, CalendarDays, ChevronLeft, ChevronRight, GraduationCap, Search, TriangleAlert, Users } from "lucide-react";

import { AccessBadge, EnrollmentStatusBadge, HomeworkPaceBadge, PaymentStatusBadge } from "@/components/management/badges";
import { CreateEnrollmentButton, type Workspace } from "@/components/management/enrollment-forms";
import { RecordPaymentButton } from "@/components/management/payment-forms";
import { AddStudentButton, CourseMembershipButton, HomeworkRuleButton, TeacherStudentSearch } from "@/components/management/teaching-forms";
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
import { getHomeworkRule } from "@/server/management/teaching";
import { formatCalendarDate, isDateString, todayInPlatform } from "@/server/management/time";
import { getT } from "@/lib/i18n-server";

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
  const T = await getT();
  const filters = parseEnrollmentFilters(params);
  const rangeFrom = one(params, "rfrom");
  const rangeTo = one(params, "rto");
  const today = todayInPlatform();
  const [summary, list, courses, instructors, homeworkRule] = await Promise.all([
    getManagementSummary(actor, { from: rangeFrom && isDateString(rangeFrom) ? rangeFrom : undefined, to: rangeTo && isDateString(rangeTo) ? rangeTo : undefined }),
    listEnrollmentRows(actor, filters),
    listScopedCourses(actor),
    listInstructorsForActor(actor),
    getHomeworkRule(actor)
  ]);
  const behindRows = list.rows.filter((row) => row.pace.state === "behind");
  const examReadyRows = list.rows.filter((row) => row.pace.state === "exam-ready" && row.status === "ACTIVE");
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
          {actor.kind === "admin" ? T("Every student and enrollment in ERA.") : T("Students assigned to you. Other teachers' students never appear here.")}
        </p>
        <span className="flex flex-wrap items-center gap-2">
        <Link href={`${basePath}/courses`} className={cn(buttonVariants({ variant: "outline" }))}>
          <BookOpen />
          {T("Courses & lessons")}
        </Link>
        {homeworkRule.editable ? <HomeworkRuleButton workspace={workspace} enabled={homeworkRule.enabled} perWeek={homeworkRule.perWeek} /> : null}
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

      <section className="flex flex-col gap-3" aria-label={T("Summary")}>
        <StatStrip
          metrics={[
            { label: actor.kind === "admin" ? T("Registered students") : T("My students"), value: summary.students },
            { label: T("Active enrollments"), value: summary.activeEnrollments },
            { label: T("Completed enrollments"), value: summary.completedEnrollments },
            { label: T("Ending in 30 days"), value: summary.endingSoon },
            { label: T("Exams in 14 days"), value: summary.upcomingExams }
          ]}
        />
        {summary.money ? (
          <>
            <StatStrip
              metrics={[
                { label: T("Collected"), value: formatMoney(summary.money.collected, "KRW"), hint: `${formatCalendarDate(summary.money.from)} – ${formatCalendarDate(summary.money.to)}` },
                { label: T("Outstanding"), value: formatMoney(summary.money.outstanding, "KRW"), hint: T("{count} overdue", { count: summary.money.overdue }) },
                { label: T("Fully paid"), value: summary.money.fullyPaid },
                { label: T("Partially paid"), value: summary.money.partiallyPaid },
                { label: T("Unpaid"), value: summary.money.unpaid },
                {
                  label: T("Pending verification"),
                  value: summary.money.pendingCount,
                  hint: summary.money.pendingCount ? formatMoney(summary.money.pendingAmount, "KRW") : undefined
                }
              ]}
            />
            <form action={basePath} method="get" className="flex flex-wrap items-end gap-2 text-sm" aria-label={T("Reporting period")}>
              {Object.entries(params).map(([key, value]) =>
                typeof value === "string" && key !== "rfrom" && key !== "rto" ? <input key={key} type="hidden" name={key} value={value} /> : null
              )}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">{T("Collected from")}</span>
                <Input type="date" name="rfrom" defaultValue={summary.money.from} className="h-9" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">{T("to")}</span>
                <Input type="date" name="rto" defaultValue={summary.money.to} className="h-9" />
              </label>
              <Button type="submit" variant="outline" size="sm">
                {T("Update totals")}
              </Button>
              <span className="text-xs text-muted-foreground">{T("Totals count approved payments only (minus approved refunds).")}</span>
            </form>
          </>
        ) : null}
      </section>

      <section className="flex flex-col gap-4" aria-label={T("Enrollments")}>
        <SectionHeader title={T("Students and enrollments")} description={T("One row per student per course. Open a student for full history and payments.")} />
        {actor.kind !== "admin" ? (
          // Teachers get one search box. It also finds students removed from a course, so they can be returned from their profile.
          <TeacherStudentSearch basePath={basePath} q={filters.q ?? ""} payment={filters.paymentStatus ?? ""} showPayment={showMoney} />
        ) : (
        <form action={basePath} method="get" role="search" className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-4">
          <label className="flex flex-col gap-1.5 md:col-span-2">
            <span className="text-xs font-medium text-muted-foreground">{T("Student name or email")}</span>
            <Input type="search" name="q" defaultValue={filters.q} placeholder={T("Search students")} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{T("Course")}</span>
            <Select name="course" defaultValue={filters.courseId ?? ""}>
              <option value="">{T("All courses")}</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </Select>
          </label>
          {actor.kind === "admin" ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">{T("Teacher")}</span>
              <Select name="teacher" defaultValue={filters.instructorId ?? ""}>
                <option value="">{T("All teachers")}</option>
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
              <span className="text-xs font-medium text-muted-foreground">{T("Payment status")}</span>
              <Select name="payment" defaultValue={filters.paymentStatus ?? ""}>
                <option value="">{T("Any")}</option>
                <option value="FULLY_PAID">{T("Fully paid")}</option>
                <option value="PARTIALLY_PAID">{T("Partially paid")}</option>
                <option value="UNPAID">{T("Unpaid")}</option>
                <option value="WAIVED">{T("Waived")}</option>
                <option value="NO_FEE">{T("No fee")}</option>
              </Select>
            </label>
          ) : null}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{T("Enrollment status")}</span>
            <Select name="status" defaultValue={filters.enrollmentStatus === "current" ? "" : filters.enrollmentStatus}>
              <option value="">{T("Active")}</option>
              <option value="all">{T("All (incl. history)")}</option>
              <option value="COMPLETED">{T("Completed")}</option>
              <option value="CANCELLED">{T("Cancelled")}</option>
              <option value="EXPIRED">{T("Expired")}</option>
              <option value="TRANSFERRED">{T("Transferred")}</option>
            </Select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{T("Dates")}</span>
            <Select name="dateField" defaultValue={filters.dateField}>
              <option value="start">{T("Course start between")}</option>
              <option value="end">{T("Course end between")}</option>
            </Select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">{T("From")}</span>
              <Input type="date" name="from" defaultValue={filters.from} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">{T("To")}</span>
              <Input type="date" name="to" defaultValue={filters.to} />
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{T("Sort by")}</span>
            <span className="flex gap-2">
              <Select name="sort" defaultValue={filters.sort ?? ""}>
                <option value="">{T("Newest start")}</option>
                <option value="student">{T("Student")}</option>
                <option value="course">{T("Course")}</option>
                <option value="start">{T("Start date")}</option>
                <option value="end">{T("End date")}</option>
                {showMoney ? (
                  <>
                    <option value="price">{T("Price")}</option>
                    <option value="paid">{T("Paid")}</option>
                    <option value="balance">{T("Remaining")}</option>
                    <option value="status">{T("Payment status")}</option>
                  </>
                ) : null}
              </Select>
              <Select name="dir" defaultValue={filters.dir} aria-label={T("Sort direction")} className="w-24">
                <option value="asc">↑</option>
                <option value="desc">↓</option>
              </Select>
            </span>
          </label>
          <fieldset className="flex flex-wrap items-center gap-4 text-sm md:col-span-3">
            <legend className="sr-only">{T("Quick filters")}</legend>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="exams" value="1" defaultChecked={filters.upcomingExams} />
              {T("Upcoming exams")}
            </label>
            {showMoney ? (
              <>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="overdue" value="1" defaultChecked={filters.overdue} />
                  {T("Overdue payments")}
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="pending" value="1" defaultChecked={filters.pendingPayments} />
                  {T("Payments awaiting approval")}
                </label>
              </>
            ) : null}
          </fieldset>
          <div className="flex items-end gap-2">
            <Button type="submit" variant="outline">
              {T("Apply")}
            </Button>
            {filtered ? (
              <Link href={basePath} className={cn(buttonVariants({ variant: "ghost" }))}>
                {T("Clear")}
              </Link>
            ) : null}
          </div>
        </form>
        )}

        {behindRows.length ? (
          <div role="alert" className="flex gap-3 rounded-xl border border-error/30 bg-error/10 p-4 text-sm">
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-error" aria-hidden="true" />
            <div className="flex min-w-0 flex-col gap-1.5">
              <p className="font-semibold text-error">
                {T("{count} students are behind the weekly homework rule", { count: behindRows.length })}
              </p>
              <p className="text-muted-foreground">{T("Last week they handed in fewer than {count} homeworks.", { count: behindRows[0].pace.perWeek })}</p>
              <ul className="flex flex-wrap gap-1.5">
                {behindRows.map((row) => (
                  <li key={row.id}>
                    <Link href={`${profilePath}/${row.student.id}`} className="inline-flex items-center gap-1 rounded-full border border-error/30 bg-card px-2.5 py-1 text-xs font-medium hover:bg-error/10">
                      {row.student.name}
                      <span className="text-muted-foreground">· {row.pace.lastWeek ? `${row.pace.lastWeek.count}/${row.pace.lastWeek.required}` : ""}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
        {examReadyRows.length ? (
          <div role="status" className="flex gap-3 rounded-xl border border-success/30 bg-success/10 p-4 text-sm">
            <GraduationCap className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
            <div className="flex min-w-0 flex-col gap-1.5">
              <p className="font-semibold text-success">{T("Exam ready! These students finished every homework")}</p>
              <ul className="flex flex-wrap gap-1.5">
                {examReadyRows.map((row) => (
                  <li key={row.id}>
                    <Link href={`${profilePath}/${row.student.id}`} className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-card px-2.5 py-1 text-xs font-medium hover:bg-success/10">
                      🎓 {row.student.name}
                      <span className="text-muted-foreground">· {row.course.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        <DataTable
          caption={T("Students and enrollments")}
          actionsLabel={T("Actions")}
          rows={list.rows}
          getRowKey={(row) => row.id}
          emptyState={
            filtered ? (
              <EmptyState title={T("No enrollments match these filters")} description={T("Try other filters, or include history.")} actionLabel={T("Clear filters")} actionHref={basePath} />
            ) : (
              <EmptyState
                icon={<Users />}
                title={T("No active enrollments yet")}
                description={can(actor, "manageEnrollments") ? T("Use New enrollment to add a student to a course.") : T("Students appear here when they're enrolled with you.")}
              />
            )
          }
          columns={[
            {
              key: "student",
              header: T("Student"),
              mobile: "title",
              cell: (row) => (
                <span className="flex min-w-0 flex-col">
                  <Link href={`${profilePath}/${row.student.id}`} className="font-medium hover:underline">
                    {row.student.name}
                  </Link>
                  {row.student.telegram || row.student.email ? (
                    <span className="truncate text-xs text-muted-foreground">{row.student.telegram ?? row.student.email}</span>
                  ) : null}
                </span>
              )
            },
            ...(actor.kind === "admin"
              ? [{ key: "teacher", header: T("Teacher"), mobile: "hidden" as const, cell: (row: EnrollmentRow) => row.teacher?.name ?? <span className="text-muted-foreground">—</span> }]
              : []),
            {
              key: "course",
              header: T("Course"),
              cell: (row) => (
                <span className="flex flex-col gap-1">
                  <span>{row.course.title}</span>
                  {row.status !== "ACTIVE" ? <EnrollmentStatusBadge status={row.status} /> : null}
                  {row.hasUpcomingExam ? (
                    <Badge variant="accent" className="w-fit">
                      <CalendarDays className="size-3" aria-hidden="true" /> {T("Exam soon")}
                    </Badge>
                  ) : null}
                </span>
              )
            },
            {
              key: "homework",
              header: T("Homework"),
              cell: (row) =>
                row.homework.total ? (
                  <span className="flex flex-col gap-1">
                    <span className="tabular-nums">{T("{done}/{total} done", { done: row.homework.done, total: row.homework.total })}</span>
                    {row.homework.toCheck ? <Badge variant="warning" className="w-fit">{T("{count} to check", { count: row.homework.toCheck })}</Badge> : null}
                    {row.homework.needsWork ? <Badge variant="error" className="w-fit">{T("{count} needs work", { count: row.homework.needsWork })}</Badge> : null}
                    <HomeworkPaceBadge pace={row.pace} />
                  </span>
                ) : (
                  <span className="text-muted-foreground">{T("No lessons")}</span>
                )
            },
            { key: "start", header: T("Start"), mobile: "hidden", cell: (row) => formatCalendarDate(row.startDate) },
            { key: "end", header: T("End"), cell: (row) => formatCalendarDate(row.endDate) },
            ...(showMoney
              ? [
                  { key: "price", header: T("Price"), align: "right" as const, mobile: "hidden" as const, cell: (row: EnrollmentRow) => money(row, "price") },
                  { key: "paid", header: T("Paid"), align: "right" as const, mobile: "hidden" as const, cell: (row: EnrollmentRow) => money(row, "approved") },
                  { key: "remaining", header: T("Remaining"), align: "right" as const, cell: (row: EnrollmentRow) => money(row, "remaining") },
                  {
                    key: "payment",
                    header: T("Payment"),
                    cell: (row: EnrollmentRow) =>
                      row.money ? (
                        <span className="flex flex-col gap-1">
                          <PaymentStatusBadge status={row.money.status} overdue={row.money.overdue} />
                          {row.money.pending ? <span className="text-xs text-muted-foreground">{T("{amount} pending", { amount: formatMoney(row.money.pending, row.currency) })}</span> : null}
                        </span>
                      ) : null
                  }
                ]
              : []),
            {
              key: "access",
              header: T("Access"),
              cell: (row) => <AccessBadge status={row.accessStatus} allowed={row.accessAllowed} payLater={row.arrangement === "PAY_LATER"} />
            }
          ]}
          rowActions={(row) => (
            <span className="flex flex-wrap justify-end gap-2">
              <Link href={`${profilePath}/${row.student.id}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
                {T("Profile")}
              </Link>
              {can(actor, "recordPayments") && row.status === "ACTIVE" && row.arrangement !== "WAIVED" ? (
                <RecordPaymentButton enrollmentId={row.id} workspace={workspace} today={today} label={T("Payment")} currency={row.currency} />
              ) : null}
              {(can(actor, "manageEnrollments") || can(actor, "manageAccess")) && row.status === "ACTIVE" ? (
                <CourseMembershipButton workspace={workspace} enrollmentId={row.id} studentName={row.student.name} courseTitle={row.course.title} action="remove" compact />
              ) : null}
            </span>
          )}
        />

        <nav className="flex items-center justify-between gap-3 text-sm" aria-label={T("Pages")}>
          <span className="text-muted-foreground">
            {T("{total} enrollments · page {page} of {pages}", { total: list.total, page: list.page, pages: list.pages })}
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
