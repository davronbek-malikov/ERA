import type { EnrollmentAccessStatus, EnrollmentStatus, PaymentArrangement } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { retryOnDatabaseFailure } from "@/lib/server-data";
import { summarizePayments } from "@/server/management/money";
import { fromDbDate, todayInPlatform } from "@/server/management/time";

/*
 * Course access for one enrollment (docs/ERA_STUDENT_MANAGEMENT.md, "Access").
 * Access is decided by the enrollment's ACCESS fields, never by the payment status alone:
 *   - enrollment status must be ACTIVE or COMPLETED (completed students keep reviewing);
 *   - access status must be ACTIVE (RESTRICTED / REVOKED are explicit decisions, always logged);
 *   - access must not have expired (accessExpiresAt is the last day, inclusive);
 *   - only when `restrictWhenOverdue` is on: a balance left after the payment due date stops access.
 * Pay Later = access ACTIVE while the payment status is still UNPAID; nothing here looks at "paid".
 */

export const ENROLLMENT_ACCESS_SELECT = {
  id: true,
  status: true,
  accessStatus: true,
  accessExpiresAt: true,
  restrictWhenOverdue: true,
  paymentDueDate: true,
  priceAmount: true,
  paymentArrangement: true
} as const;

export type EnrollmentAccessFields = {
  id: string;
  status: EnrollmentStatus;
  accessStatus: EnrollmentAccessStatus;
  accessExpiresAt: Date | null;
  restrictWhenOverdue: boolean;
  paymentDueDate: Date | null;
  priceAmount: number | null;
  paymentArrangement: PaymentArrangement | null;
};

export type AccessBlockReason = "restricted" | "revoked" | "expired" | "ended" | "overdue";

export type EnrollmentAccessDecision = { allowed: true } | { allowed: false; reason: AccessBlockReason; message: string };

export const ACCESS_BLOCK_MESSAGE: Record<AccessBlockReason, string> = {
  restricted: "Your access to this course is paused. Please contact your teacher or ERA support.",
  revoked: "Your access to this course has ended. Please contact your teacher or ERA support if you think this is a mistake.",
  expired: "Your access period for this course has ended. Please contact your teacher or ERA support to extend it.",
  ended: "This enrollment is no longer active. Please contact your teacher or ERA support.",
  overdue: "Your course payment is overdue, so access is paused. Please contact your teacher or ERA support."
};

function blocked(reason: AccessBlockReason): EnrollmentAccessDecision {
  return { allowed: false, reason, message: ACCESS_BLOCK_MESSAGE[reason] };
}

export async function evaluateEnrollmentAccess(enrollment: EnrollmentAccessFields, today = todayInPlatform()): Promise<EnrollmentAccessDecision> {
  if (enrollment.status !== "ACTIVE" && enrollment.status !== "COMPLETED") return blocked("ended");
  if (enrollment.accessStatus === "REVOKED") return blocked("revoked");
  if (enrollment.accessStatus === "RESTRICTED") return blocked("restricted");
  const expires = fromDbDate(enrollment.accessExpiresAt);
  if (expires && expires < today) return blocked("expired");

  const due = fromDbDate(enrollment.paymentDueDate);
  if (enrollment.restrictWhenOverdue && due && due < today) {
    const transactions = await retryOnDatabaseFailure(() =>
      prisma.paymentTransaction.findMany({ where: { enrollmentId: enrollment.id, status: "APPROVED" }, select: { kind: true, amount: true, status: true } })
    );
    if (summarizePayments(enrollment, transactions).remaining > 0) return blocked("overdue");
  }
  return { allowed: true };
}
