import { Badge } from "@/components/ui/badge";

/*
 * Status badges for Student Management (ERA Design System: color carries meaning, text always says it too).
 * Payment status and access status are separate badges on purpose: Pay Later = "Unpaid" + "Can study".
 */

type Variant = "neutral" | "primary" | "success" | "warning" | "error" | "outline" | "accent";

const PAYMENT: Record<string, { label: string; variant: Variant }> = {
  FULLY_PAID: { label: "Fully paid", variant: "success" },
  PARTIALLY_PAID: { label: "Partially paid", variant: "warning" },
  UNPAID: { label: "Unpaid", variant: "error" },
  WAIVED: { label: "Waived", variant: "neutral" },
  NO_FEE: { label: "No fee", variant: "neutral" }
};

export function PaymentStatusBadge({ status, overdue }: { status: string; overdue?: boolean }) {
  const meta = PAYMENT[status] ?? { label: status, variant: "neutral" as Variant };
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge variant={meta.variant}>{meta.label}</Badge>
      {overdue ? <Badge variant="error">Overdue</Badge> : null}
    </span>
  );
}

const ACCESS: Record<string, { label: string; variant: Variant }> = {
  ACTIVE: { label: "Can study", variant: "primary" },
  RESTRICTED: { label: "Restricted", variant: "warning" },
  REVOKED: { label: "Revoked", variant: "error" }
};

export function AccessBadge({ status, allowed, payLater }: { status: string; allowed?: boolean; payLater?: boolean }) {
  const meta = ACCESS[status] ?? { label: status, variant: "neutral" as Variant };
  const blockedAnyway = status === "ACTIVE" && allowed === false;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge variant={blockedAnyway ? "warning" : meta.variant}>{blockedAnyway ? "Paused" : meta.label}</Badge>
      {payLater ? <Badge variant="outline">Pay Later</Badge> : null}
    </span>
  );
}

const ENROLLMENT: Record<string, { label: string; variant: Variant }> = {
  ACTIVE: { label: "Active", variant: "primary" },
  COMPLETED: { label: "Completed", variant: "success" },
  CANCELLED: { label: "Cancelled", variant: "neutral" },
  EXPIRED: { label: "Expired", variant: "neutral" },
  TRANSFERRED: { label: "Transferred", variant: "neutral" }
};

export function EnrollmentStatusBadge({ status }: { status: string }) {
  const meta = ENROLLMENT[status] ?? { label: status, variant: "neutral" as Variant };
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

const TRANSACTION: Record<string, { label: string; variant: Variant }> = {
  PENDING: { label: "Pending verification", variant: "warning" },
  APPROVED: { label: "Approved", variant: "success" },
  REJECTED: { label: "Rejected", variant: "error" },
  REVERSED: { label: "Reversed", variant: "neutral" }
};

export function TransactionStatusBadge({ status }: { status: string }) {
  const meta = TRANSACTION[status] ?? { label: status, variant: "neutral" as Variant };
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

export const ARRANGEMENT_LABEL: Record<string, string> = {
  PAY_IN_FULL: "Pay in full",
  PARTIAL: "Partial payments",
  PAY_LATER: "Pay Later",
  WAIVED: "Free / waived"
};

export const METHOD_LABEL: Record<string, string> = { BANK_TRANSFER: "Bank transfer", CASH: "Cash", ONLINE: "Online", OTHER: "Other" };
