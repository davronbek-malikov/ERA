import type { PaymentArrangement, PaymentKind, PaymentTransactionStatus } from "@prisma/client";

/*
 * Payment arithmetic (docs/ERA_STUDENT_MANAGEMENT.md, "Payment calculations"). Pure functions, integers only.
 *
 *   approved total   = Σ APPROVED payments − Σ APPROVED refunds
 *   remaining        = course price − approved total            (never below 0; an overpayment is a credit)
 *   PENDING, REJECTED and REVERSED transactions never count.
 *
 * Payment status is derived, never stored, so it can't disagree with the transactions:
 *   WAIVED          arrangement is WAIVED (fee waived by an authorized user)
 *   NO_FEE          no price recorded (legacy self-enrollments) or a price of 0
 *   FULLY_PAID      approved total ≥ price
 *   PARTIALLY_PAID  0 < approved total < price
 *   UNPAID          approved total ≤ 0
 * Pay Later is an ACCESS arrangement and does not change the payment status.
 */

export type PaymentStatus = "FULLY_PAID" | "PARTIALLY_PAID" | "UNPAID" | "WAIVED" | "NO_FEE";

export const PAYMENT_STATUSES: PaymentStatus[] = ["FULLY_PAID", "PARTIALLY_PAID", "UNPAID", "WAIVED", "NO_FEE"];

export type CountableTransaction = { kind: PaymentKind; amount: number; status: PaymentTransactionStatus };

/** Largest single amount accepted (₩2 billion). Amounts are stored in 32-bit integer columns. */
export const MAX_AMOUNT = 2_000_000_000;

export function approvedTotal(transactions: CountableTransaction[]): number {
  let total = 0;
  for (const transaction of transactions) {
    if (transaction.status !== "APPROVED") continue;
    total += transaction.kind === "REFUND" ? -transaction.amount : transaction.amount;
  }
  return total;
}

export function pendingTotal(transactions: CountableTransaction[]): number {
  let total = 0;
  for (const transaction of transactions) {
    if (transaction.status !== "PENDING") continue;
    total += transaction.kind === "REFUND" ? -transaction.amount : transaction.amount;
  }
  return total;
}

export type PaymentSummary = {
  price: number | null;
  approved: number;
  pending: number;
  /** What is still owed (0 when waived, without a fee, or fully paid). */
  remaining: number;
  /** Paid beyond the price (a refund may be due). */
  credit: number;
  status: PaymentStatus;
};

export function summarizePayments(
  enrollment: { priceAmount: number | null; paymentArrangement: PaymentArrangement | null },
  transactions: CountableTransaction[]
): PaymentSummary {
  const approved = approvedTotal(transactions);
  const pending = pendingTotal(transactions);
  const price = enrollment.priceAmount;

  if (enrollment.paymentArrangement === "WAIVED") {
    return { price, approved, pending, remaining: 0, credit: Math.max(0, approved), status: "WAIVED" };
  }
  if (price === null || price <= 0) {
    return { price, approved, pending, remaining: 0, credit: Math.max(0, approved), status: "NO_FEE" };
  }
  const remaining = Math.max(0, price - approved);
  const credit = Math.max(0, approved - price);
  const status: PaymentStatus = approved >= price ? "FULLY_PAID" : approved > 0 ? "PARTIALLY_PAID" : "UNPAID";
  return { price, approved, pending, remaining, credit, status };
}

/** A balance is overdue when something is still owed after the due date (calendar dates, platform timezone). */
export function isOverdue(summary: PaymentSummary, dueDate: string | null, today: string): boolean {
  return Boolean(dueDate && summary.remaining > 0 && dueDate < today);
}

const CURRENCY_DIGITS: Record<string, number> = { KRW: 0, JPY: 0, USD: 2, EUR: 2, UZS: 0 };

export const SUPPORTED_CURRENCIES = Object.keys(CURRENCY_DIGITS);

/**
 * Amounts are integers in the currency's smallest unit. For KRW that is the won itself (no decimals).
 * The module records KRW by default; other currencies are stored as given and never converted.
 */
export function formatMoney(amount: number | null | undefined, currency = "KRW"): string {
  if (amount === null || amount === undefined) return "—";
  const digits = CURRENCY_DIGITS[currency] ?? 0;
  const value = digits ? amount / 10 ** digits : amount;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  } catch {
    return `${value.toLocaleString("en-US")} ${currency}`;
  }
}

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  FULLY_PAID: "Fully paid",
  PARTIALLY_PAID: "Partially paid",
  UNPAID: "Unpaid",
  WAIVED: "Waived",
  NO_FEE: "No fee"
};
