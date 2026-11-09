import { Prisma, type ManagementSource, type PaymentMethod } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { RequestError } from "@/lib/validation";
import { authErrors } from "@/server/authz";
import { assertCan, enrollmentScope, type ManagementActor } from "@/server/management/actor";
import { writeAudit } from "@/server/management/audit";
import { conflict, type ChangeOptions } from "@/server/management/enrollments";
import type { PaymentDecisionInput, RecordPaymentInput } from "@/server/management/inputs";
import { summarizePayments } from "@/server/management/money";
import { fromDbDate, toDbDate } from "@/server/management/time";

/*
 * Payments: manual verification only (docs/ERA_STUDENT_MANAGEMENT.md, "Payments").
 * ERA never takes money. Students pay a teacher or the academy outside ERA; ERA records and verifies it:
 *
 *   record   → PENDING      (teachers with "record payments", admins)
 *   approve  → APPROVED     (admins; teachers only with "approve payments")  — only APPROVED counts
 *   reject   → REJECTED     (with a reason)
 *   reverse  → REVERSED     (an APPROVED payment taken back, with a reason)
 *   correct  → the original is reversed (if approved) or rejected (if pending), and a NEW pending
 *              transaction with the right amount is recorded and linked to it.
 * Nothing is ever deleted or edited in place. Every step writes an audit row in the same transaction.
 * Retries are safe: a repeated idempotency key returns the first transaction instead of creating a second.
 */

type Db = Prisma.TransactionClient | typeof prisma;

const TRANSACTION_SELECT = {
  id: true,
  enrollmentId: true,
  kind: true,
  amount: true,
  currency: true,
  method: true,
  transactionDate: true,
  status: true,
  reference: true,
  description: true,
  source: true,
  recordedById: true,
  reviewedById: true,
  reviewedAt: true,
  rejectionReason: true,
  reversedById: true,
  reversedAt: true,
  reversalReason: true,
  correctionOfId: true,
  createdAt: true
} as const;

type TransactionRow = Prisma.PaymentTransactionGetPayload<{ select: typeof TRANSACTION_SELECT }>;

function snapshot(row: TransactionRow) {
  return { ...row, transactionDate: fromDbDate(row.transactionDate) };
}

async function enrollmentForPayment(db: Db, actor: ManagementActor, enrollmentId: string) {
  const enrollment = await db.enrollment.findFirst({
    where: { id: enrollmentId, ...enrollmentScope(actor) },
    select: {
      id: true,
      currency: true,
      priceAmount: true,
      paymentArrangement: true,
      user: { select: { id: true, name: true } },
      course: { select: { title: true } },
      payments: { select: { kind: true, amount: true, status: true } }
    }
  });
  if (!enrollment) throw authErrors.notFound("Enrollment not found.");
  return enrollment;
}

// ------------------------------------------------------------------------------------------------
// Record
// ------------------------------------------------------------------------------------------------

export async function checkRecordPayment(db: Db, actor: ManagementActor, input: RecordPaymentInput) {
  assertCan(actor, "recordPayments");
  const enrollment = await enrollmentForPayment(db, actor, input.enrollmentId);
  if (input.currency && input.currency !== enrollment.currency) {
    throw new RequestError(400, "currency-mismatch", `This enrollment is in ${enrollment.currency}. Record the payment in ${enrollment.currency}.`);
  }
  const summary = summarizePayments(enrollment, enrollment.payments);
  return { enrollment, summary };
}

export async function recordPayment(actor: ManagementActor, input: RecordPaymentInput, options: ChangeOptions) {
  if (input.idempotencyKey) {
    const existing = await prisma.paymentTransaction.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: TRANSACTION_SELECT });
    if (existing) {
      if (existing.enrollmentId !== input.enrollmentId || existing.amount !== input.amount) {
        throw conflict("idempotency-key-reused", "This request was already used for a different payment.");
      }
      return { transaction: snapshot(existing), created: false };
    }
  }
  try {
    return await prisma.$transaction(async (tx) => {
      const { enrollment } = await checkRecordPayment(tx, actor, input);
      const transaction = await tx.paymentTransaction.create({
        data: {
          enrollmentId: enrollment.id,
          kind: input.kind,
          amount: input.amount,
          currency: enrollment.currency,
          method: input.method,
          transactionDate: toDbDate(input.transactionDate),
          status: "PENDING",
          reference: input.reference,
          description: input.description,
          source: options.source,
          recordedById: actor.user.id,
          idempotencyKey: input.idempotencyKey ?? null
        },
        select: TRANSACTION_SELECT
      });
      await writeAudit(tx, {
        actorId: actor.user.id,
        action: input.kind === "REFUND" ? "payment.record_refund" : "payment.record",
        entityType: "payment",
        entityId: transaction.id,
        after: snapshot(transaction),
        source: options.source
      });
      return { transaction: snapshot(transaction), created: true };
    });
  } catch (error) {
    // Two identical requests raced: the unique key let exactly one through. Return that one.
    if (input.idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.paymentTransaction.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: TRANSACTION_SELECT });
      if (existing) return { transaction: snapshot(existing), created: false };
    }
    throw error;
  }
}

// ------------------------------------------------------------------------------------------------
// Approve / reject / reverse / correct
// ------------------------------------------------------------------------------------------------

export async function checkPaymentDecision(db: Db, actor: ManagementActor, transactionId: string, input: PaymentDecisionInput) {
  const transaction = await db.paymentTransaction.findFirst({
    where: { id: transactionId, enrollment: enrollmentScope(actor) },
    select: {
      ...TRANSACTION_SELECT,
      enrollment: {
        select: {
          id: true,
          userId: true,
          currency: true,
          priceAmount: true,
          paymentArrangement: true,
          user: { select: { name: true } },
          course: { select: { title: true } },
          payments: { select: { id: true, kind: true, amount: true, status: true } }
        }
      }
    }
  });
  if (!transaction) throw authErrors.notFound("Payment not found.");

  switch (input.decision) {
    case "approve":
    case "reject":
      assertCan(actor, "approvePayments");
      if (transaction.status !== "PENDING") {
        throw conflict("payment-not-pending", `This payment is already ${transaction.status.toLowerCase()}.`);
      }
      // A student account can never be an actor, so no one approves their own payment; this also stops a
      // linked teacher-student account from approving a payment for an enrollment of their own.
      if (transaction.enrollment.userId === actor.user.id) throw authErrors.forbidden("You can't review a payment for your own enrollment.");
      if (input.decision === "approve" && transaction.kind === "REFUND") {
        const others = transaction.enrollment.payments.filter((payment) => payment.id !== transaction.id);
        const approvedSoFar = summarizePayments(transaction.enrollment, others).approved;
        if (transaction.amount > approvedSoFar) {
          throw conflict("refund-too-large", "A refund can't be larger than the approved payments for this enrollment.");
        }
      }
      break;
    case "reverse":
      assertCan(actor, "approvePayments");
      if (transaction.status !== "APPROVED") throw conflict("payment-not-approved", "Only approved payments can be reversed.");
      break;
    case "correct":
      assertCan(actor, "recordPayments");
      if (transaction.status === "APPROVED") assertCan(actor, "approvePayments");
      else if (transaction.status === "PENDING" && transaction.recordedById !== actor.user.id) assertCan(actor, "approvePayments");
      else if (transaction.status !== "PENDING") {
        throw conflict("payment-not-correctable", `A ${transaction.status.toLowerCase()} payment doesn't count; record a new payment instead.`);
      }
      if (input.amount === transaction.amount && !input.transactionDate && !input.method) {
        throw conflict("no-change", "The corrected payment is the same as the original.");
      }
      break;
  }

  const before = summarizePayments(transaction.enrollment, transaction.enrollment.payments);
  return { transaction, before };
}

export async function decidePayment(actor: ManagementActor, transactionId: string, input: PaymentDecisionInput, options: ChangeOptions) {
  if (input.decision === "correct" && input.idempotencyKey) {
    const existing = await prisma.paymentTransaction.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: TRANSACTION_SELECT });
    if (existing && existing.correctionOfId === transactionId) return { original: null, correction: snapshot(existing), created: false };
  }

  return prisma.$transaction(async (tx) => {
    const { transaction } = await checkPaymentDecision(tx, actor, transactionId, input);
    const now = new Date();
    const { enrollment: _enrollment, ...beforeRow } = transaction;

    // Conditional update on the status we checked: a concurrent decision can't apply twice.
    const expectStatus = transaction.status;
    let data: Prisma.PaymentTransactionUncheckedUpdateManyInput;
    let action: string;
    if (input.decision === "approve") {
      data = { status: "APPROVED", reviewedById: actor.user.id, reviewedAt: now, ...(input.note ? { description: [transaction.description, `Approval note: ${input.note}`].filter(Boolean).join(" · ") } : {}) };
      action = "payment.approve";
    } else if (input.decision === "reject") {
      data = { status: "REJECTED", reviewedById: actor.user.id, reviewedAt: now, rejectionReason: input.reason };
      action = "payment.reject";
    } else if (input.decision === "reverse") {
      data = { status: "REVERSED", reversedById: actor.user.id, reversedAt: now, reversalReason: input.reason };
      action = "payment.reverse";
    } else if (transaction.status === "APPROVED") {
      data = { status: "REVERSED", reversedById: actor.user.id, reversedAt: now, reversalReason: `Corrected: ${input.reason}` };
      action = "payment.correct";
    } else {
      data = { status: "REJECTED", reviewedById: actor.user.id, reviewedAt: now, rejectionReason: `Corrected: ${input.reason}` };
      action = "payment.correct";
    }

    const changed = await tx.paymentTransaction.updateMany({ where: { id: transaction.id, status: expectStatus }, data });
    if (changed.count !== 1) throw conflict("payment-changed", "This payment was changed by someone else. Reload and try again.");
    const original = await tx.paymentTransaction.findUniqueOrThrow({ where: { id: transaction.id }, select: TRANSACTION_SELECT });

    let correction: TransactionRow | null = null;
    if (input.decision === "correct") {
      correction = await tx.paymentTransaction.create({
        data: {
          enrollmentId: transaction.enrollmentId,
          kind: transaction.kind,
          amount: input.amount,
          currency: transaction.currency,
          method: (input.method ?? transaction.method) as PaymentMethod,
          transactionDate: input.transactionDate ? toDbDate(input.transactionDate) : transaction.transactionDate,
          status: "PENDING",
          reference: transaction.reference,
          description: `Correction of a ${transaction.amount.toLocaleString("en-US")} ${transaction.currency} payment: ${input.reason}`,
          source: options.source,
          recordedById: actor.user.id,
          correctionOfId: transaction.id,
          idempotencyKey: input.idempotencyKey ?? null
        },
        select: TRANSACTION_SELECT
      });
    }

    await writeAudit(tx, {
      actorId: actor.user.id,
      action,
      entityType: "payment",
      entityId: transaction.id,
      before: snapshot(beforeRow),
      after: { ...snapshot(original), ...(correction ? { correctionId: correction.id, correctionAmount: correction.amount } : {}) },
      source: options.source
    });
    if (correction) {
      await writeAudit(tx, {
        actorId: actor.user.id,
        action: "payment.record_correction",
        entityType: "payment",
        entityId: correction.id,
        after: snapshot(correction),
        source: options.source
      });
    }
    return { original: snapshot(original), correction: correction ? snapshot(correction) : null, created: true };
  });
}
