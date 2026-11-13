import { CalendarDays, ChevronRight, ExternalLink, History, ShieldCheck, StickyNote } from "lucide-react";

import {
  AccessBadge,
  ARRANGEMENT_LABEL,
  EnrollmentStatusBadge,
  METHOD_LABEL,
  PaymentStatusBadge,
  TransactionStatusBadge
} from "@/components/management/badges";
import { AccessButton, CreateEnrollmentButton, EditEnrollmentButton, type Workspace } from "@/components/management/enrollment-forms";
import { AddNoteButton } from "@/components/management/misc-forms";
import { PaymentReviewActions, RecordPaymentButton, MarkPaidButton } from "@/components/management/payment-forms";
import { CourseMembershipButton, HomeworkReviewButton, StudentContactButton } from "@/components/management/teaching-forms";
import { telegramUrl } from "@/lib/student-contact";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { SectionHeader } from "@/components/workspace/workspace-ui";
import { can, type ManagementActor } from "@/server/management/actor";
import { formatMoney } from "@/server/management/money";
import { getStudentProfile, listInstructorsForActor, listScopedCourses } from "@/server/management/queries";
import { formatCalendarDate, todayInPlatform } from "@/server/management/time";
import { getT } from "@/lib/i18n-server";

/*
 * Student profile (Student Management): account, current enrollments, full course history, every payment
 * transaction with its verification status, the access log, exams and staff notes. Teachers see only the
 * enrollments assigned to them; money only with the "see payments" permission.
 */

type Profile = Awaited<ReturnType<typeof getStudentProfile>>;
type EnrollmentView = Profile["current"][number];

async function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  const T = await getT();
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

async function EnrollmentCard({
  view,
  actor,
  workspace,
  instructors,
  today,
  studentName
}: {
  studentName: string;
  view: EnrollmentView;
  actor: ManagementActor;
  workspace: Workspace;
  instructors: Array<{ id: string; name: string }>;
  today: string;
}) {
  const T = await getT();
  const canEdit = can(actor, "manageEnrollments") || can(actor, "manageAccess");
  return (
    <article className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5" aria-label={view.course.title}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="card-title">{view.course.title}</h3>
          <p className="text-xs text-muted-foreground">
            {view.teacher ? T("Teacher: {name}", { name: view.teacher.name }) : T("No teacher assigned")} · {T("Progress {value}%", { value: view.progress })}
          </p>
        </div>
        <span className="flex flex-wrap items-center gap-1.5">
          <EnrollmentStatusBadge status={view.status} />
          <AccessBadge status={view.accessStatus} allowed={view.accessAllowed} payLater={view.arrangement === "PAY_LATER"} />
          {view.money ? <PaymentStatusBadge status={view.money.status} overdue={view.money.overdue} /> : null}
          {view.money && view.money.remaining > 0 && view.status === "ACTIVE" && view.arrangement !== "WAIVED" && can(actor, "recordPayments") ? (
            <MarkPaidButton
              enrollmentId={view.id}
              workspace={workspace}
              today={today}
              remaining={view.money.remaining}
              canApprove={can(actor, "approvePayments")}
              currency={view.currency}
            />
          ) : null}
        </span>
      </header>

      <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Detail label={T("Start")}>{formatCalendarDate(view.startDate)}</Detail>
        <Detail label={T("Expected end")}>{formatCalendarDate(view.endDate)}</Detail>
        {view.money ? (
          <>
            <Detail label={T("Price")}>{formatMoney(view.money.price, view.currency)}</Detail>
            <Detail label={T("Paid (approved)")}>{formatMoney(view.money.approved, view.currency)}</Detail>
            <Detail label={T("Remaining")}>
              <span className={view.money.remaining > 0 ? "font-semibold" : undefined}>{formatMoney(view.money.remaining, view.currency)}</span>
            </Detail>
            <Detail label={T("Payment due")}>{formatCalendarDate(view.paymentDueDate)}</Detail>
          </>
        ) : null}
        <Detail label={T("Arrangement")}>{view.arrangement ? T(ARRANGEMENT_LABEL[view.arrangement]) : "—"}</Detail>
        <Detail label={T("Last day of access")}>{formatCalendarDate(view.accessExpiresAt)}</Detail>
        {view.accessGrantedBy ? <Detail label={T("Access approved by")}>{view.accessGrantedBy}</Detail> : null}
        {view.accessNote ? <Detail label={T("Approval note")}>{view.accessNote}</Detail> : null}
      </dl>
      {view.money?.pending ? (
        <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
          {T("{amount} recorded and waiting for approval (not counted yet). Approve it in the payment history below.", { amount: formatMoney(view.money.pending, view.currency) })}
        </p>
      ) : null}
      {view.money?.credit ? <p className="text-xs text-muted-foreground">{T("Paid {amount} more than the price.", { amount: formatMoney(view.money.credit, view.currency) })}</p> : null}
      {view.internalNote ? <p className="rounded-lg bg-muted px-3 py-2 text-xs">{T("Internal note")}: {view.internalNote}</p> : null}

      <div className="flex flex-wrap gap-2">
        {canEdit ? (
          <EditEnrollmentButton
            enrollmentId={view.id}
            workspace={workspace}
            canManageEnrollments={can(actor, "manageEnrollments")}
            canChangePrice={can(actor, "approvePayments")}
            instructors={instructors}
            current={{
              startDate: view.startDate,
              endDate: view.endDate,
              paymentDueDate: view.paymentDueDate,
              status: view.status,
              priceAmount: view.money?.price ?? null,
              instructorId: view.teacher?.id ?? null
            }}
          />
        ) : null}
        {can(actor, "manageAccess") ? (
          <AccessButton
            enrollmentId={view.id}
            workspace={workspace}
            current={{ accessStatus: view.accessStatus, paymentDueDate: view.paymentDueDate, accessExpiresAt: view.accessExpiresAt, restrictWhenOverdue: view.restrictWhenOverdue }}
          />
        ) : null}
        {can(actor, "recordPayments") && view.arrangement !== "WAIVED" ? (
          <RecordPaymentButton enrollmentId={view.id} workspace={workspace} today={today} currency={view.currency} />
        ) : null}
        {can(actor, "manageEnrollments") || can(actor, "manageAccess") ? (
          <CourseMembershipButton
            workspace={workspace}
            enrollmentId={view.id}
            studentName={studentName}
            courseTitle={view.course.title}
            action={view.status === "ACTIVE" ? "remove" : "restore"}
          />
        ) : null}
      </div>

      {view.money ? (
        <section aria-label={T("Payment history")} className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold">{T("Payment history")}</h4>
          {view.payments.length ? (
            <ol className="flex flex-col gap-2">
              {view.payments.map((payment) => (
                <li key={payment.id} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium tabular-nums">
                        {payment.kind === "REFUND" ? "−" : ""}
                        {formatMoney(payment.amount, payment.currency)}
                      </span>
                      <TransactionStatusBadge status={payment.status} />
                      {payment.kind === "REFUND" ? <Badge variant="outline">{T("Refund")}</Badge> : null}
                      {payment.source === "AI" ? <Badge variant="outline">{T("via ERA Assistant")}</Badge> : null}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatCalendarDate(payment.transactionDate)} · {T(METHOD_LABEL[payment.method]) ?? payment.method}
                      {payment.reference ? ` · ${T("Ref")} ${payment.reference}` : ""} · {T("recorded by {name}", { name: payment.recordedBy ?? "—" })}
                    </span>
                    {payment.description ? <span className="text-xs">{payment.description}</span> : null}
                    {payment.reviewedBy ? (
                      <span className="text-xs text-muted-foreground">
                        {T(payment.status === "REJECTED" ? "Rejected by {name}" : "Reviewed by {name}", { name: payment.reviewedBy })}
                        {payment.reviewedAt ? ` on ${payment.reviewedAt.slice(0, 10)}` : ""}
                        {payment.rejectionReason ? ` — ${payment.rejectionReason}` : ""}
                      </span>
                    ) : null}
                    {payment.reversedBy ? (
                      <span className="text-xs text-muted-foreground">
                        {T("Reversed by {name}", { name: payment.reversedBy })}
                        {payment.reversedAt ? ` on ${payment.reversedAt.slice(0, 10)}` : ""} — {payment.reversalReason}
                      </span>
                    ) : null}
                  </div>
                  <PaymentReviewActions
                    transactionId={payment.id}
                    workspace={workspace}
                    status={payment.status}
                    amount={payment.amount}
                    canApprove={can(actor, "approvePayments")}
                    canCorrect={can(actor, "recordPayments") && (payment.status === "PENDING" ? payment.recordedById === actor.user.id || can(actor, "approvePayments") : can(actor, "approvePayments"))}
                  />
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">{T("No payments recorded yet.")}</p>
          )}
        </section>
      ) : null}

      <HomeworkSection view={view} workspace={workspace} />

      {view.accessLog.length ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">{T("Access history")} ({view.accessLog.length})</summary>
          <ol className="mt-2 flex flex-col gap-1">
            {view.accessLog.map((log) => (
              <li key={log.id} className="text-xs text-muted-foreground">
                {log.createdAt.slice(0, 10)} · {log.previousStatus ? `${log.previousStatus.toLowerCase()} → ` : ""}
                {log.newStatus.toLowerCase()}
                {log.newExpiresAt ? ` (until ${log.newExpiresAt})` : ""} · {log.changedBy ?? "system"}
                {log.source === "AI" ? " via ERA Assistant" : ""}
                {log.reason ? ` — ${log.reason}` : ""}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </article>
  );
}

const HOMEWORK_BADGE: Record<string, { label: string; variant: "success" | "warning" | "error" | "neutral" | "primary" }> = {
  DONE: { label: "Done correctly", variant: "success" },
  NEEDS_WORK: { label: "Needs work", variant: "error" },
  SUBMITTED: { label: "To check", variant: "warning" },
  NOT_SUBMITTED: { label: "Not submitted", variant: "neutral" }
};

/** One row per lesson: what was taught, the homework, the student's link and the check result. */
async function HomeworkSection({ view, workspace }: { view: EnrollmentView; workspace: Workspace }) {
  const T = await getT();
  if (!view.homework.length) {
    return <p className="text-sm text-muted-foreground">{T("This course has no lessons yet. Add them under Courses & lessons.")}</p>;
  }
  const done = view.homework.filter((lesson) => lesson.review?.status === "DONE").length;
  return (
    <section aria-label={`Homework for ${view.course.title}`} className="flex flex-col gap-2">
      <h4 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        {T("Homework")}
        <Badge variant={done === view.homework.length ? "success" : "neutral"}>
          {T("{done}/{total} done", { done, total: view.homework.length })}
        </Badge>
      </h4>
      <ol className="flex flex-col gap-2">
        {view.homework.map((lesson) => {
          const badge = HOMEWORK_BADGE[lesson.review?.status ?? "NOT_SUBMITTED"];
          return (
            <li key={lesson.id} className="rounded-lg border border-border">
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden="true" />
                  <span className="min-w-0 flex-1 font-medium">
                    {lesson.position}. {lesson.title}
                  </span>
                  <Badge variant={badge.variant} className="shrink-0">
                    {T(badge.label)}
                  </Badge>
                </summary>
                <div className="flex flex-col gap-2 border-t border-border p-3">
                  <div className="grid gap-2 text-sm md:grid-cols-2">
                    <div className="rounded-md bg-muted/60 p-2">
                      <p className="text-xs font-medium text-muted-foreground">{T("What I taught")}</p>
                      <p className="whitespace-pre-wrap">{lesson.taughtSummary || <span className="text-muted-foreground">{T("Not written yet")}</span>}</p>
                    </div>
                    <div className="rounded-md bg-muted/60 p-2">
                      <p className="text-xs font-medium text-muted-foreground">{T("Homework")}</p>
                      <p className="whitespace-pre-wrap">{lesson.homework || <span className="text-muted-foreground">{T("Not written yet")}</span>}</p>
                    </div>
                  </div>
                  {lesson.review?.githubUrl || lesson.review?.note || lesson.review?.checkedAt ? (
                    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                      {lesson.review?.githubUrl ? (
                        <a href={lesson.review.githubUrl} target="_blank" rel="noopener noreferrer" className="flex w-fit items-center gap-1 text-primary hover:underline">
                          <ExternalLink className="size-3.5" aria-hidden="true" />
                          {T("Student's work")}
                        </a>
                      ) : null}
                      {lesson.review?.note ? <span className="whitespace-pre-wrap text-foreground">{lesson.review.note}</span> : null}
                      {lesson.review?.checkedAt ? (
                        <span>
                          {T("Checked {date}", { date: lesson.review.checkedAt.slice(0, 10) })}
                          {lesson.review.checkedBy ? ` · ${lesson.review.checkedBy}` : ""}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  <div>
                    <HomeworkReviewButton
                      workspace={workspace}
                      enrollmentId={view.id}
                      lessonId={lesson.id}
                      lessonLabel={`${lesson.position}. ${lesson.title}`}
                      current={lesson.review ? { status: lesson.review.status, githubUrl: lesson.review.githubUrl, note: lesson.review.note } : null}
                    />
                  </div>
                </div>
              </details>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export async function StudentProfileView({ actor, studentId, workspace }: { actor: ManagementActor; studentId: string; workspace: Workspace }) {
  const T = await getT();
  const today = todayInPlatform();
  const [profile, courses, instructors] = await Promise.all([getStudentProfile(actor, studentId), listScopedCourses(actor), listInstructorsForActor(actor)]);
  const all = [...profile.current, ...profile.history];

  return (
    <div className="flex flex-col gap-8">
      <section className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-5" aria-label={T("Student information")}>
        <Detail label={T("Name")}>{profile.student.name}</Detail>
        <Detail label={T("Telegram")}>
          {profile.student.telegram ? (
            telegramUrl(profile.student.telegram) ? (
              <a href={telegramUrl(profile.student.telegram)!} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                {profile.student.telegram}
              </a>
            ) : (
              profile.student.telegram
            )
          ) : (
            <span className="text-muted-foreground">{T("Not set")}</span>
          )}
        </Detail>
        {profile.student.email ? <Detail label={T("Email")}>{profile.student.email}</Detail> : null}
        <Detail label={T("Account")}>
          <Badge variant={profile.student.status === "ACTIVE" ? "success" : "warning"}>{profile.student.status === "ACTIVE" ? T("Active") : T("Suspended")}</Badge>
        </Detail>
        <Detail label={T("Assigned teacher")}>{profile.teachers.length ? profile.teachers.map((teacher) => teacher.name).join(", ") : "—"}</Detail>
        <Detail label={T("Registered")}>{formatCalendarDate(profile.student.createdAt.slice(0, 10))}</Detail>
        <div className="flex flex-col gap-0.5 sm:col-span-2 lg:col-span-5">
          <dt className="text-xs text-muted-foreground">{T("GitHub")}</dt>
          <dd className="flex flex-wrap items-center gap-2 text-sm">
            {profile.student.githubUrl ? (
              <a href={profile.student.githubUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                <ExternalLink className="size-3.5" aria-hidden="true" />
                {profile.student.githubUrl.replace(/^https?:\/\//, "")}
              </a>
            ) : (
              <span className="text-muted-foreground">{T("Not added")}</span>
            )}
            <StudentContactButton workspace={workspace} studentId={profile.student.id} github={profile.student.githubUrl} telegram={profile.student.telegram} />
          </dd>
        </div>
      </section>

      <section className="flex flex-col gap-4" aria-label={T("Current enrollments")}>
        <SectionHeader
          title={T("Current enrollments")}
          action={
            can(actor, "manageEnrollments") && courses.length ? (
              <CreateEnrollmentButton
                workspace={workspace}
                today={today}
                preset={{ id: profile.student.id, name: profile.student.name }}
                courses={courses.map((course) => ({ id: course.id, title: course.title, instructorId: course.instructorId, instructorName: course.instructor.name }))}
                instructors={instructors}
                permissions={actor.permissions}
              />
            ) : undefined
          }
        />
        {profile.current.length ? (
          profile.current.map((view) => <EnrollmentCard key={view.id} view={view} actor={actor} workspace={workspace} instructors={instructors} today={today} studentName={profile.student.name} />)
        ) : (
          <EmptyState title={T("No active enrollments")} description={T("Completed and earlier enrollments are listed under Course history.")} />
        )}
      </section>

      <section className="flex flex-col gap-4" aria-label={T("Course history")}>
        <SectionHeader title={T("Course history")} description={T("Completed, cancelled, expired and transferred enrollments. Each one keeps its own dates and payments.")} />
        {profile.history.length ? (
          <>
            <ol className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4">
              {all
                .slice()
                .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""))
                .map((view) => (
                  <li key={view.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <History className="size-4 text-muted-foreground" aria-hidden="true" />
                    <span className="font-medium">{view.course.title}</span>
                    <span className="text-muted-foreground">
                      {formatCalendarDate(view.startDate)} – {formatCalendarDate(view.endDate)}
                    </span>
                    <EnrollmentStatusBadge status={view.status} />
                  </li>
                ))}
            </ol>
            {profile.history.map((view) => (
              <EnrollmentCard key={view.id} view={view} actor={actor} workspace={workspace} instructors={instructors} today={today} studentName={profile.student.name} />
            ))}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{T("No earlier enrollments.")}</p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-3" aria-label={T("Exams")}>
          <SectionHeader title={T("Exams")} />
          {profile.exams.length ? (
            <ul className="flex flex-col gap-2">
              {profile.exams.map((exam) => (
                <li key={exam.id} className="flex items-start gap-3 rounded-lg border border-border bg-card p-3 text-sm">
                  <CalendarDays className="mt-0.5 size-4 shrink-0 text-accent-strong" aria-hidden="true" />
                  <span className="flex flex-col">
                    <span className="font-medium">{exam.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {exam.course} · {formatCalendarDate(exam.examDate, { weekday: true })} · {exam.startTime}
                      {exam.endTime ? `–${exam.endTime}` : ""} · {exam.status.toLowerCase()}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{T("No exams scheduled.")}</p>
          )}
        </section>

        <section className="flex flex-col gap-3" aria-label={T("Staff notes")}>
          <SectionHeader
            title={T("Staff notes")}
            action={<AddNoteButton studentId={profile.student.id} workspace={workspace} enrollments={all.map((view) => ({ id: view.id, course: view.course.title }))} />}
          />
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            {T("Never shown to the student.")}
          </p>
          {profile.notes.length ? (
            <ul className="flex flex-col gap-2">
              {profile.notes.map((note) => (
                <li key={note.id} className="flex items-start gap-3 rounded-lg border border-border bg-card p-3 text-sm">
                  <StickyNote className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="whitespace-pre-wrap break-words">{note.note}</span>
                    <span className="text-xs text-muted-foreground">
                      {note.author ?? "—"} · {note.createdAt.slice(0, 10)}
                      {note.course ? ` · ${note.course}` : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{T("No notes yet.")}</p>
          )}
        </section>
      </div>
    </div>
  );
}
