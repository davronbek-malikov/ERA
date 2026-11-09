import type { EnrollmentStatus, ExamStatus, PaymentArrangement, PaymentKind, PaymentMethod } from "@prisma/client";

import { invalid, optionalId, requireId, requireString } from "@/lib/validation";
import { MAX_AMOUNT, SUPPORTED_CURRENCIES } from "@/server/management/money";
import { optionalDateString, requireDateString, requireTimeString } from "@/server/management/time";

/*
 * Input parsing for Student Management (docs/ERA_STUDENT_MANAGEMENT.md). The API routes, the server pages and the
 * AI tools all turn untrusted objects into these typed inputs here, so every entry point validates identically.
 * Identities (who is acting) never come from these objects.
 */

export const PAYMENT_ARRANGEMENTS: PaymentArrangement[] = ["PAY_IN_FULL", "PARTIAL", "PAY_LATER", "WAIVED"];
export const PAYMENT_METHODS: PaymentMethod[] = ["BANK_TRANSFER", "CASH", "ONLINE", "OTHER"];
export const ENROLLMENT_STATUSES: EnrollmentStatus[] = ["ACTIVE", "COMPLETED", "CANCELLED", "EXPIRED", "TRANSFERRED"];
export const EXAM_STATUSES: ExamStatus[] = ["SCHEDULED", "COMPLETED", "CANCELLED"];
export const ACCESS_ACTIONS = ["grant_pay_later", "restrict", "revoke", "restore", "extend", "set_overdue_rule"] as const;
export type AccessAction = (typeof ACCESS_ACTIONS)[number];

type Raw = Record<string, unknown>;

function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T;
  throw invalid(`invalid-${field}`, `${field} must be one of: ${allowed.join(", ")}.`);
}

function optionalOneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return oneOf(value, allowed, field);
}

export function requireAmount(value: unknown, field: string, options: { allowZero?: boolean } = {}): number {
  const parsed = typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value.trim()) : value;
  const min = options.allowZero ? 0 : 1;
  if (typeof parsed !== "number" || !Number.isSafeInteger(parsed) || parsed < min || parsed > MAX_AMOUNT) {
    throw invalid(`invalid-${field}`, `${field} must be a whole number of won between ${min} and ${MAX_AMOUNT.toLocaleString("en-US")}.`);
  }
  return parsed;
}

function optionalText(value: unknown, field: string, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || (typeof value === "string" && !value.trim())) return null;
  return requireString(value, field, { max });
}

function optionalFlag(value: unknown, field: string): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "on") return true;
  if (value === "false") return false;
  throw invalid(`invalid-${field}`, `${field} must be true or false.`);
}

export function parseCurrency(value: unknown): string {
  if (value === undefined || value === null || value === "") return "KRW";
  return oneOf(String(value).toUpperCase(), SUPPORTED_CURRENCIES, "currency");
}

/** Idempotency keys: client-generated UUIDs or server keys such as "ai-action:<id>". */
export function optionalIdempotencyKey(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !/^[A-Za-z0-9:_-]{8,100}$/.test(value)) throw invalid("invalid-idempotency-key", "Invalid idempotency key.");
  return value;
}

// --- Enrollments ---------------------------------------------------------------------------------

export type InitialPaymentInput = { amount: number; method: PaymentMethod; transactionDate: string; reference: string | null; description: string | null };

export type CreateEnrollmentInput = {
  studentId: string;
  courseId: string;
  instructorId?: string;
  startDate: string;
  endDate: string | null;
  priceAmount: number | null;
  currency: string;
  paymentArrangement: PaymentArrangement;
  paymentDueDate: string | null;
  grantAccess: boolean;
  restrictWhenOverdue: boolean;
  accessNote: string | null;
  internalNote: string | null;
  initialPayment: InitialPaymentInput | null;
  idempotencyKey?: string;
};

export function parseInitialPayment(raw: unknown, fallbackDate: string): InitialPaymentInput | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "object" || Array.isArray(raw)) throw invalid("invalid-initial-payment", "initialPayment must be an object.");
  const value = raw as Raw;
  if (value.amount === undefined || value.amount === null || value.amount === "" || value.amount === 0) return null;
  return {
    amount: requireAmount(value.amount, "initial payment amount"),
    method: oneOf(value.method ?? "BANK_TRANSFER", PAYMENT_METHODS, "method"),
    transactionDate: value.transactionDate ? requireDateString(value.transactionDate, "payment date") : fallbackDate,
    reference: optionalText(value.reference, "reference", 120) ?? null,
    description: optionalText(value.description, "note", 500) ?? null
  };
}

export function parseCreateEnrollment(raw: Raw, today: string): CreateEnrollmentInput {
  const startDate = requireDateString(raw.startDate, "startDate");
  const endDate = optionalDateString(raw.endDate, "endDate") ?? null;
  if (endDate && endDate < startDate) throw invalid("invalid-endDate", "The end date can't be before the start date.");
  const paymentArrangement = oneOf(raw.paymentArrangement ?? "PAY_IN_FULL", PAYMENT_ARRANGEMENTS, "paymentArrangement");
  const priceAmount =
    raw.priceAmount === undefined || raw.priceAmount === null || raw.priceAmount === ""
      ? null
      : requireAmount(raw.priceAmount, "price", { allowZero: true });
  if (priceAmount === null && paymentArrangement !== "WAIVED") {
    throw invalid("invalid-price", "Enter the course price (use 0 or Free/Waived for a free course).");
  }
  const paymentDueDate = optionalDateString(raw.paymentDueDate, "paymentDueDate") ?? null;
  if (paymentArrangement === "PAY_LATER" && !paymentDueDate) {
    throw invalid("invalid-paymentDueDate", "Pay Later needs a payment due date.");
  }
  return {
    studentId: requireId(raw.studentId, "studentId"),
    courseId: requireId(raw.courseId, "courseId"),
    instructorId: optionalId(raw.instructorId, "instructorId"),
    startDate,
    endDate,
    priceAmount,
    currency: parseCurrency(raw.currency),
    paymentArrangement,
    paymentDueDate,
    grantAccess: optionalFlag(raw.grantAccess, "grantAccess") ?? true,
    restrictWhenOverdue: optionalFlag(raw.restrictWhenOverdue, "restrictWhenOverdue") ?? false,
    accessNote: optionalText(raw.accessNote, "approval note", 500) ?? null,
    internalNote: optionalText(raw.internalNote, "internal note", 2000) ?? null,
    initialPayment: parseInitialPayment(raw.initialPayment, today),
    idempotencyKey: optionalIdempotencyKey(raw.idempotencyKey)
  };
}

export type UpdateEnrollmentInput = {
  startDate?: string;
  endDate?: string | null;
  paymentDueDate?: string | null;
  priceAmount?: number;
  status?: EnrollmentStatus;
  instructorId?: string;
  internalNote?: string | null;
  reason: string | null;
};

export function parseUpdateEnrollment(raw: Raw): UpdateEnrollmentInput {
  const input: UpdateEnrollmentInput = {
    startDate: raw.startDate === undefined ? undefined : requireDateString(raw.startDate, "startDate"),
    endDate: optionalDateString(raw.endDate, "endDate"),
    paymentDueDate: optionalDateString(raw.paymentDueDate, "paymentDueDate"),
    priceAmount: raw.priceAmount === undefined ? undefined : requireAmount(raw.priceAmount, "price", { allowZero: true }),
    status: optionalOneOf(raw.status, ENROLLMENT_STATUSES, "status"),
    instructorId: optionalId(raw.instructorId, "instructorId"),
    internalNote: optionalText(raw.internalNote, "internal note", 2000),
    reason: optionalText(raw.reason, "reason", 500) ?? null
  };
  const changed = Object.entries(input).some(([key, value]) => key !== "reason" && value !== undefined);
  if (!changed) throw invalid("nothing-to-change", "Nothing to change.");
  return input;
}

export type AccessChangeInput = {
  action: AccessAction;
  reason: string;
  accessExpiresAt?: string | null;
  paymentDueDate?: string;
  restrictWhenOverdue?: boolean;
};

export function parseAccessChange(raw: Raw): AccessChangeInput {
  const action = oneOf(raw.action, ACCESS_ACTIONS, "action");
  const input: AccessChangeInput = {
    action,
    reason: requireString(raw.reason, "reason", { max: 500 }),
    accessExpiresAt: optionalDateString(raw.accessExpiresAt, "accessExpiresAt"),
    paymentDueDate: raw.paymentDueDate ? requireDateString(raw.paymentDueDate, "paymentDueDate") : undefined,
    restrictWhenOverdue: optionalFlag(raw.restrictWhenOverdue, "restrictWhenOverdue")
  };
  if (action === "grant_pay_later" && !input.paymentDueDate) throw invalid("invalid-paymentDueDate", "Pay Later needs a payment due date.");
  if (action === "extend" && !input.accessExpiresAt) throw invalid("invalid-accessExpiresAt", "Choose the new last day of access.");
  if (action === "set_overdue_rule" && input.restrictWhenOverdue === undefined) {
    throw invalid("invalid-restrictWhenOverdue", "Choose whether access should stop when the payment is overdue.");
  }
  return input;
}

// --- Payments ------------------------------------------------------------------------------------

export type RecordPaymentInput = {
  enrollmentId: string;
  kind: PaymentKind;
  amount: number;
  currency?: string;
  method: PaymentMethod;
  transactionDate: string;
  reference: string | null;
  description: string | null;
  idempotencyKey?: string;
};

export function parseRecordPayment(raw: Raw, today: string): RecordPaymentInput {
  return {
    enrollmentId: requireId(raw.enrollmentId, "enrollmentId"),
    kind: oneOf(raw.kind ?? "PAYMENT", ["PAYMENT", "REFUND"] as const, "kind"),
    amount: requireAmount(raw.amount, "amount"),
    currency: raw.currency === undefined || raw.currency === "" ? undefined : parseCurrency(raw.currency),
    method: oneOf(raw.method ?? "BANK_TRANSFER", PAYMENT_METHODS, "method"),
    transactionDate: raw.transactionDate ? requireDateString(raw.transactionDate, "transactionDate") : today,
    reference: optionalText(raw.reference, "reference", 120) ?? null,
    description: optionalText(raw.description, "note", 500) ?? null,
    idempotencyKey: optionalIdempotencyKey(raw.idempotencyKey)
  };
}

export const PAYMENT_DECISIONS = ["approve", "reject", "reverse", "correct"] as const;
export type PaymentDecision = (typeof PAYMENT_DECISIONS)[number];

export type PaymentDecisionInput =
  | { decision: "approve"; note: string | null }
  | { decision: "reject" | "reverse"; reason: string }
  | { decision: "correct"; reason: string; amount: number; transactionDate?: string; method?: PaymentMethod; idempotencyKey?: string };

export function parsePaymentDecision(raw: Raw): PaymentDecisionInput {
  const decision = oneOf(raw.decision, PAYMENT_DECISIONS, "decision");
  if (decision === "approve") return { decision, note: optionalText(raw.note, "note", 500) ?? null };
  const reason = requireString(raw.reason, "reason", { max: 500 });
  if (decision === "correct") {
    return {
      decision,
      reason,
      amount: requireAmount(raw.amount, "corrected amount"),
      transactionDate: raw.transactionDate ? requireDateString(raw.transactionDate, "transactionDate") : undefined,
      method: optionalOneOf(raw.method, PAYMENT_METHODS, "method"),
      idempotencyKey: optionalIdempotencyKey(raw.idempotencyKey)
    };
  }
  return { decision, reason };
}

// --- Exams and notes -----------------------------------------------------------------------------

export type ExamInput = {
  courseId: string;
  instructorId?: string;
  title: string;
  description: string | null;
  examDate: string;
  startTime: string;
  endTime: string | null;
  status: ExamStatus;
  enrollmentIds: string[];
};

export function parseExam(raw: Raw): ExamInput {
  const startTime = requireTimeString(raw.startTime, "startTime");
  const endTime = raw.endTime ? requireTimeString(raw.endTime, "endTime") : null;
  if (endTime && endTime <= startTime) throw invalid("invalid-endTime", "The end time must be after the start time.");
  const ids = Array.isArray(raw.enrollmentIds) ? raw.enrollmentIds : [];
  if (ids.length > 500) throw invalid("too-many-students", "Too many students for one exam.");
  return {
    courseId: requireId(raw.courseId, "courseId"),
    instructorId: optionalId(raw.instructorId, "instructorId"),
    title: requireString(raw.title, "title", { max: 160 }),
    description: optionalText(raw.description, "description", 2000) ?? null,
    examDate: requireDateString(raw.examDate, "examDate"),
    startTime,
    endTime,
    status: optionalOneOf(raw.status, EXAM_STATUSES, "status") ?? "SCHEDULED",
    enrollmentIds: [...new Set(ids.map((id) => requireId(id, "enrollmentId")))]
  };
}

export type NoteInput = { studentId: string; enrollmentId: string | null; note: string };

export function parseNote(raw: Raw): NoteInput {
  return {
    studentId: requireId(raw.studentId, "studentId"),
    enrollmentId: optionalId(raw.enrollmentId, "enrollmentId") ?? null,
    note: requireString(raw.note, "note", { max: 4000 })
  };
}
