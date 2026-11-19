import { AlertTriangle, History } from "lucide-react";

import { EnrollmentStatusBadge, PaymentStatusBadge, TransactionStatusBadge } from "@/components/management/badges";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/feedback";
import { SectionHeader } from "@/components/workspace/workspace-ui";
import { formatMoney } from "@/server/management/money";
import { getMyEnrollments } from "@/server/management/student-view";
import { formatCalendarDate } from "@/server/management/time";
import { getT } from "@/lib/i18n-server";

/*
 * The student's own enrollments, payments and access (Student Management, "Student view"). Read-only.
 * No internal notes, approvers or other students. Pay Later shows clearly that studying is allowed.
 */

type Views = Awaited<ReturnType<typeof getMyEnrollments>>;
type View = Views["current"][number];

async function Row({ view }: { view: View }) {
  const T = await getT();
  const showMoney = view.money.status !== "NO_FEE";
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h3 className="card-title">{view.course.title}</h3>
          <p className="text-xs text-muted-foreground">
            {view.teacher ? `${view.teacher} · ` : ""}
            {formatCalendarDate(view.startDate)} – {formatCalendarDate(view.endDate)}
          </p>
        </div>
        <span className="flex flex-wrap gap-1.5">
          {view.status !== "ACTIVE" ? <EnrollmentStatusBadge status={view.status} /> : null}
          {view.access.allowed ? <Badge variant="primary">{T("You can study")}</Badge> : <Badge variant="warning">{T("Access paused")}</Badge>}
          {view.payLater ? <Badge variant="outline">{T("Pay Later")}</Badge> : null}
          {showMoney ? <PaymentStatusBadge status={view.money.status} overdue={view.money.overdue} /> : null}
        </span>
      </div>

      {!view.access.allowed ? (
        <Alert variant="warning" title={T("Course access is paused")}>
          {view.access.message}
        </Alert>
      ) : null}

      {showMoney ? (
        <dl className="grid gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">{T("Course price")}</dt>
            <dd className="tabular-nums">{formatMoney(view.money.price, view.currency)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{T("Paid (confirmed)")}</dt>
            <dd className="tabular-nums">{formatMoney(view.money.approved, view.currency)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{T("Remaining")}</dt>
            <dd className="font-semibold tabular-nums">{formatMoney(view.money.remaining, view.currency)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{T("Payment due")}</dt>
            <dd className="flex items-center gap-1">
              {view.money.overdue ? <AlertTriangle className="size-3.5 text-error" aria-hidden="true" /> : null}
              {formatCalendarDate(view.paymentDueDate)}
            </dd>
          </div>
        </dl>
      ) : null}

      {view.money.pending ? (
        <p className="text-xs text-muted-foreground">
          {T("{amount} received and waiting for confirmation by your teacher or ERA.", { amount: formatMoney(view.money.pending, view.currency) })}
        </p>
      ) : null}

      {showMoney && view.payments.length ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">{T("My payments ({count})", { count: view.payments.length })}</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {view.payments.map((payment) => (
              <li key={payment.id} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="tabular-nums">{formatCalendarDate(payment.date)}</span>
                <span className="tabular-nums font-medium">
                  {payment.kind === "REFUND" ? "−" : ""}
                  {formatMoney(payment.amount, payment.currency)}
                </span>
                <TransactionStatusBadge status={payment.status} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </li>
  );
}

export async function MyEnrollmentsSection({ userId }: { userId: string }) {
  const T = await getT();
  const { current, history } = await getMyEnrollments(userId);
  if (!current.length && !history.length) return null;
  return (
    <section className="flex flex-col gap-4" aria-label={T("Enrollments and payments")}>
      <SectionHeader
        title={T("Enrollments & payments")}
        description={T("Your course dates, access and payments. Questions about a payment? Contact your teacher or ERA support.")}
      />
      {current.length ? (
        <ul className="grid gap-4 lg:grid-cols-2">
          {current.map((view) => (
            <Row key={view.id} view={view} />
          ))}
        </ul>
      ) : null}
      {history.length ? (
        <div className="flex flex-col gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <History className="size-4" aria-hidden="true" />
            {T("Course history")}
          </h3>
          <ul className="grid gap-4 lg:grid-cols-2">
            {history.map((view) => (
              <Row key={view.id} view={view} />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
