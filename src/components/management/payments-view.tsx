import Link from "next/link";
import { ChevronLeft, ChevronRight, Wallet } from "lucide-react";

import { METHOD_LABEL, TransactionStatusBadge } from "@/components/management/badges";
import type { SearchParams } from "@/components/management/dashboard-view";
import type { Workspace } from "@/components/management/enrollment-forms";
import { PaymentReviewActions } from "@/components/management/payment-forms";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/ui/table";
import { StatStrip } from "@/components/workspace/workspace-ui";
import { cn } from "@/lib/utils";
import { can, type ManagementActor } from "@/server/management/actor";
import { formatMoney } from "@/server/management/money";
import { getManagementSummary, listPayments } from "@/server/management/queries";
import { formatCalendarDate, isDateString } from "@/server/management/time";

/*
 * Payments: the verification queue (PENDING first) and every transaction with its full review trail.
 * Money is recorded outside ERA; nothing here moves money.
 */

const TABS = [
  { value: "PENDING", label: "Awaiting approval" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "REVERSED", label: "Reversed" },
  { value: "all", label: "All" }
] as const;

function one(params: SearchParams, key: string) {
  const value = params[key];
  return typeof value === "string" ? value : undefined;
}

export async function PaymentsView({
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
  const tab = TABS.find((item) => item.value === one(params, "status"))?.value ?? "PENDING";
  const from = one(params, "from");
  const to = one(params, "to");
  const page = Math.max(1, Number(one(params, "page")) || 1);
  const [list, summary] = await Promise.all([
    listPayments(actor, {
      status: tab === "all" ? undefined : tab,
      from: from && isDateString(from) ? from : undefined,
      to: to && isDateString(to) ? to : undefined,
      q: one(params, "q")?.slice(0, 100),
      page
    }),
    getManagementSummary(actor, { from: from && isDateString(from) ? from : undefined, to: to && isDateString(to) ? to : undefined })
  ]);
  if (!list || !summary.money) {
    return <EmptyState title="Payments aren't available to you" description="Ask an administrator for permission to see payments." />;
  }

  const href = (overrides: Record<string, string | undefined>) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...Object.fromEntries(Object.entries(params).filter(([, v]) => typeof v === "string")), ...overrides })) {
      if (value) query.set(key, value as string);
    }
    return `${basePath}?${query.toString()}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <StatStrip
        metrics={[
          { label: "Awaiting approval", value: summary.money.pendingCount, hint: formatMoney(summary.money.pendingAmount, "KRW") },
          { label: "Collected (approved)", value: formatMoney(summary.money.collected, "KRW"), hint: `${formatCalendarDate(summary.money.from)} – ${formatCalendarDate(summary.money.to)}` },
          { label: "Outstanding now", value: formatMoney(summary.money.outstanding, "KRW") },
          { label: "Overdue enrollments", value: summary.money.overdue }
        ]}
      />

      <nav aria-label="Payment status" className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <Link
            key={item.value}
            href={href({ status: item.value, page: undefined })}
            aria-current={item.value === tab ? "page" : undefined}
            className={cn(buttonVariants({ variant: item.value === tab ? "default" : "outline", size: "sm" }))}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <form action={basePath} method="get" role="search" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="status" value={tab} />
        <label className="flex min-w-[14rem] flex-1 flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Student</span>
          <Input type="search" name="q" defaultValue={one(params, "q")} placeholder="Name or email" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Payment date from</span>
          <Input type="date" name="from" defaultValue={from} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">to</span>
          <Input type="date" name="to" defaultValue={to} />
        </label>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      <DataTable
        caption="Payment transactions"
        rows={list.rows}
        getRowKey={(row) => row.id}
        emptyState={
          <EmptyState
            icon={<Wallet />}
            title={tab === "PENDING" ? "Nothing to verify" : "No payments here"}
            description={tab === "PENDING" ? "New payments appear here when they're recorded." : "Try another status or date range."}
          />
        }
        columns={[
          {
            key: "student",
            header: "Student",
            mobile: "title",
            cell: (row) => (
              <span className="flex flex-col">
                <Link href={`${profilePath}/${row.student.id}`} className="font-medium hover:underline">
                  {row.student.name}
                </Link>
                <span className="text-xs text-muted-foreground">{row.course}</span>
              </span>
            )
          },
          {
            key: "amount",
            header: "Amount",
            align: "right",
            cell: (row) => (
              <span className="flex flex-col items-end">
                <span className="tabular-nums font-medium">
                  {row.kind === "REFUND" ? "−" : ""}
                  {formatMoney(row.amount, row.currency)}
                </span>
                {row.kind === "REFUND" ? <Badge variant="outline">Refund</Badge> : null}
              </span>
            )
          },
          { key: "date", header: "Payment date", cell: (row) => formatCalendarDate(row.transactionDate) },
          { key: "method", header: "Method", mobile: "hidden", cell: (row) => `${METHOD_LABEL[row.method] ?? row.method}${row.reference ? ` · ${row.reference}` : ""}` },
          {
            key: "status",
            header: "Status",
            cell: (row) => (
              <span className="flex flex-col gap-1">
                <TransactionStatusBadge status={row.status} />
                {row.reviewedBy ? <span className="text-xs text-muted-foreground">by {row.reviewedBy}</span> : null}
                {row.rejectionReason ? <span className="text-xs text-muted-foreground">{row.rejectionReason}</span> : null}
                {row.reversalReason ? <span className="text-xs text-muted-foreground">{row.reversalReason}</span> : null}
              </span>
            )
          },
          {
            key: "recorded",
            header: "Recorded by",
            mobile: "hidden",
            cell: (row) => (
              <span className="flex flex-col text-xs">
                <span>{row.recordedBy ?? "—"}</span>
                {row.source === "AI" ? <span className="text-muted-foreground">via ERA Assistant</span> : null}
                {row.correctionOfId ? <span className="text-muted-foreground">correction</span> : null}
              </span>
            )
          }
        ]}
        rowActions={(row) => (
          <PaymentReviewActions
            transactionId={row.id}
            workspace={workspace}
            status={row.status}
            amount={row.amount}
            canApprove={can(actor, "approvePayments")}
            canCorrect={can(actor, "recordPayments") && (row.status === "PENDING" ? row.recordedById === actor.user.id || can(actor, "approvePayments") : can(actor, "approvePayments"))}
          />
        )}
      />

      <nav className="flex items-center justify-between text-sm" aria-label="Pages">
        <span className="text-muted-foreground">
          {list.total} transaction{list.total === 1 ? "" : "s"} · page {list.page} of {list.pages}
        </span>
        <span className="flex gap-2">
          {list.page > 1 ? (
            <Link href={href({ page: String(list.page - 1) })} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              <ChevronLeft /> Previous
            </Link>
          ) : null}
          {list.page < list.pages ? (
            <Link href={href({ page: String(list.page + 1) })} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Next <ChevronRight />
            </Link>
          ) : null}
        </span>
      </nav>
    </div>
  );
}
