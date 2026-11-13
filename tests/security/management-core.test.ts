/**
 * Student Management core tests (docs/ERA_STUDENT_MANAGEMENT.md): payment arithmetic, date handling, permission
 * normalization, access decisions and Row Level Security — run directly against the code and the isolated local
 * test database (never a shared or production database).
 */
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";

import { normalizePhone } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { evaluateEnrollmentAccess } from "@/server/management/access";
import { normalizePermissions, NO_PERMISSIONS } from "@/server/management/actor";
import { parseCreateEnrollment, parseExam, parsePaymentDecision, parseRecordPayment, requireAmount } from "@/server/management/inputs";
import { approvedTotal, formatMoney, isOverdue, summarizePayments } from "@/server/management/money";
import { addDays, fromDbDate, isDateString, monthRange, toDbDate, todayInPlatform, weekRange } from "@/server/management/time";

after(() => prisma.$disconnect());

const tx = (amount: number, status: "PENDING" | "APPROVED" | "REJECTED" | "REVERSED", kind: "PAYMENT" | "REFUND" = "PAYMENT") => ({ amount, status, kind });

describe("Payment arithmetic (integers only, approved transactions only)", () => {
  const enrollment = { priceAmount: 500000, paymentArrangement: "PARTIAL" as const };

  test("₩100,000 + ₩150,000 + ₩250,000 approved = fully paid", () => {
    const steps = [[tx(100000, "APPROVED")], [tx(100000, "APPROVED"), tx(150000, "APPROVED")], [tx(100000, "APPROVED"), tx(150000, "APPROVED"), tx(250000, "APPROVED")]];
    assert.deepEqual(
      steps.map((transactions) => {
        const summary = summarizePayments(enrollment, transactions);
        return [summary.status, summary.remaining];
      }),
      [
        ["PARTIALLY_PAID", 400000],
        ["PARTIALLY_PAID", 250000],
        ["FULLY_PAID", 0]
      ]
    );
  });

  test("PENDING, REJECTED and REVERSED never count; pending is reported separately", () => {
    const summary = summarizePayments(enrollment, [tx(500000, "PENDING"), tx(500000, "REJECTED"), tx(500000, "REVERSED")]);
    assert.equal(summary.status, "UNPAID");
    assert.equal(summary.remaining, 500000);
    assert.equal(summary.approved, 0);
    assert.equal(summary.pending, 500000);
  });

  test("approved refunds reduce the approved total; overpayment becomes a credit, never a negative balance", () => {
    assert.equal(approvedTotal([tx(300000, "APPROVED"), tx(50000, "APPROVED", "REFUND")]), 250000);
    const over = summarizePayments(enrollment, [tx(600000, "APPROVED")]);
    assert.equal(over.remaining, 0);
    assert.equal(over.credit, 100000);
    assert.equal(over.status, "FULLY_PAID");
  });

  test("waived and no-fee enrollments owe nothing; Pay Later doesn't change the status", () => {
    assert.equal(summarizePayments({ priceAmount: 500000, paymentArrangement: "WAIVED" }, []).status, "WAIVED");
    assert.equal(summarizePayments({ priceAmount: null, paymentArrangement: null }, []).status, "NO_FEE");
    assert.equal(summarizePayments({ priceAmount: 0, paymentArrangement: "PAY_IN_FULL" }, []).remaining, 0);
    assert.equal(summarizePayments({ priceAmount: 500000, paymentArrangement: "PAY_LATER" }, []).status, "UNPAID");
  });

  test("overdue = something still owed after the due date", () => {
    const owed = summarizePayments(enrollment, []);
    assert.equal(isOverdue(owed, "2026-11-01", "2026-11-02"), true);
    assert.equal(isOverdue(owed, "2026-11-02", "2026-11-02"), false, "the due date itself is not overdue");
    assert.equal(isOverdue(summarizePayments(enrollment, [tx(500000, "APPROVED")]), "2026-11-01", "2026-11-09"), false);
  });

  test("amounts must be whole won within limits; formatting has no decimals for KRW", () => {
    assert.equal(requireAmount("500000", "amount"), 500000);
    for (const bad of [0, -1, 1.5, "1,000", "abc", Number.NaN, 3_000_000_000]) assert.throws(() => requireAmount(bad, "amount"));
    assert.equal(formatMoney(500000, "KRW"), "₩500,000");
  });
});

describe("Dates (calendar dates in the platform timezone)", () => {
  test("date strings round-trip through date columns without shifting", () => {
    for (const date of ["2026-01-01", "2026-02-28", "2026-12-31"]) assert.equal(fromDbDate(toDbDate(date)), date);
    assert.equal(isDateString("2026-02-30"), false);
    assert.equal(isDateString("2026-2-3"), false);
  });

  test("ranges and arithmetic", () => {
    assert.equal(addDays("2026-11-30", 2), "2026-12-02");
    assert.deepEqual(weekRange("2026-11-12"), ["2026-11-09", "2026-11-15"]);
    assert.deepEqual(monthRange("2026-02-10"), ["2026-02-01", "2026-02-28"]);
  });

  test("today follows Asia/Seoul by default", () => {
    // 2026-11-08 20:30 UTC is already 2026-11-09 in Seoul (UTC+9).
    assert.equal(todayInPlatform(new Date("2026-11-08T20:30:00Z")), "2026-11-09");
  });
});

describe("Input validation and permissions", () => {
  test("enrollment input: end ≥ start, price required unless waived, Pay Later needs a due date", () => {
    const base = { studentId: "s1", courseId: "c1", startDate: "2026-11-12", priceAmount: 500000 };
    assert.equal(parseCreateEnrollment({ ...base, endDate: "2026-12-12" }, "2026-11-09").priceAmount, 500000);
    assert.throws(() => parseCreateEnrollment({ ...base, endDate: "2026-11-01" }, "2026-11-09"));
    assert.throws(() => parseCreateEnrollment({ ...base, priceAmount: undefined }, "2026-11-09"));
    assert.equal(parseCreateEnrollment({ ...base, priceAmount: undefined, paymentArrangement: "WAIVED" }, "2026-11-09").priceAmount, null);
    assert.throws(() => parseCreateEnrollment({ ...base, paymentArrangement: "PAY_LATER" }, "2026-11-09"));
  });

  test("payment and decision input", () => {
    assert.equal(parseRecordPayment({ enrollmentId: "e1", amount: 100000 }, "2026-11-09").transactionDate, "2026-11-09");
    assert.throws(() => parseRecordPayment({ enrollmentId: "e1", amount: 100000, method: "CRYPTO" }, "2026-11-09"));
    assert.throws(() => parsePaymentDecision({ decision: "reject" }), "a reason is required");
    assert.throws(() => parsePaymentDecision({ decision: "delete" }));
    assert.throws(() => parseExam({ courseId: "c1", title: "x", examDate: "2026-11-14", startTime: "25:00" }));
  });

  test("recording or approving payments implies seeing them", () => {
    assert.equal(normalizePermissions({ ...NO_PERMISSIONS, approvePayments: true }).viewPayments, true);
    assert.equal(normalizePermissions({ ...NO_PERMISSIONS, recordPayments: true }).viewPayments, true);
    assert.equal(normalizePermissions({ ...NO_PERMISSIONS }).viewPayments, false);
  });

  test("access decisions are independent of the payment status", async () => {
    const base = {
      id: "x",
      status: "ACTIVE" as const,
      accessStatus: "ACTIVE" as const,
      accessExpiresAt: null,
      restrictWhenOverdue: false,
      paymentDueDate: toDbDate("2026-11-01"),
      priceAmount: 500000,
      paymentArrangement: "PAY_LATER" as const
    };
    assert.deepEqual(await evaluateEnrollmentAccess(base, "2026-11-09"), { allowed: true }, "Pay Later + unpaid + overdue date: can study");
    assert.equal((await evaluateEnrollmentAccess({ ...base, accessStatus: "RESTRICTED" }, "2026-11-09")).allowed, false);
    assert.equal((await evaluateEnrollmentAccess({ ...base, accessStatus: "REVOKED" }, "2026-11-09")).allowed, false);
    assert.equal((await evaluateEnrollmentAccess({ ...base, status: "CANCELLED" }, "2026-11-09")).allowed, false);
    assert.equal((await evaluateEnrollmentAccess({ ...base, status: "COMPLETED" }, "2026-11-09")).allowed, true, "completed students keep reviewing");
    assert.equal((await evaluateEnrollmentAccess({ ...base, accessExpiresAt: toDbDate("2026-11-09") }, "2026-11-09")).allowed, true, "last day is inclusive");
    assert.equal((await evaluateEnrollmentAccess({ ...base, accessExpiresAt: toDbDate("2026-11-08") }, "2026-11-09")).allowed, false);
  });
});

describe("Row Level Security (defence in depth for Supabase's public API)", () => {
  test("every application table has RLS enabled", async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ tablename: string; rowsecurity: boolean }>>(
      "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'"
    );
    assert.ok(rows.length >= 40);
    assert.deepEqual(rows.filter((row) => !row.rowsecurity).map((row) => row.tablename), []);
  });

  test("a role without BYPASSRLS (like Supabase's anon/authenticated) reads nothing, even with SELECT granted", async () => {
    const existing = await prisma.user.count();
    assert.ok(existing > 0);
    const visible = await prisma.$transaction(async (db) => {
      await db.$executeRawUnsafe("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'era_rls_probe') THEN CREATE ROLE era_rls_probe NOLOGIN NOBYPASSRLS; END IF; END $$");
      await db.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO era_rls_probe');
      await db.$executeRawUnsafe('GRANT SELECT ON "User", payment_transactions, student_notes TO era_rls_probe');
      await db.$executeRawUnsafe("SET LOCAL ROLE era_rls_probe");
      const users = await db.$queryRawUnsafe<Array<{ n: number }>>('SELECT count(*)::int AS n FROM "User"');
      const payments = await db.$queryRawUnsafe<Array<{ n: number }>>("SELECT count(*)::int AS n FROM payment_transactions");
      const notes = await db.$queryRawUnsafe<Array<{ n: number }>>("SELECT count(*)::int AS n FROM student_notes");
      return { users: users[0].n, payments: payments[0].n, notes: notes[0].n };
    });
    assert.deepEqual(visible, { users: 0, payments: 0, notes: 0 });
  });
});

describe("Sign-in identifiers", () => {
  test("an email with digits is never treated as a phone number", () => {
    assert.equal(normalizePhone("davron96@gmail.com"), "");
    assert.equal(normalizePhone("student2026@school.kr"), "");
    assert.equal(normalizePhone("+82 10-1234-5678"), "+821012345678");
    assert.equal(normalizePhone("010-1234-5678"), "01012345678");
  });
});
