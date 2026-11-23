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
import { computeHomeworkPace } from "@/server/management/homework-rule";
import { planSendTimes, shuffle } from "@/server/telegram/pacing";
import { decryptSession, encryptSession } from "@/server/telegram/session-crypto";
import { renderText, telegramTarget, uzDate } from "@/server/telegram/messages";
import { nextDaily } from "@/server/management/time";
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

describe("Weekly homework rule (calendar weeks from each student's start date)", () => {
  const base = { startDate: "2026-11-02", endDate: "2026-12-27", status: "ACTIVE", ruleEnabled: true, perWeek: 3, totalLessons: 10, doneLessons: 0 };
  const at = (date: string) => `${date}T03:00:00Z`;

  test("week 1 is never judged; this week's progress is shown", () => {
    const pace = computeHomeworkPace({ ...base, today: "2026-11-05", submittedAt: [at("2026-11-03")] });
    assert.equal(pace.state, "on-track");
    assert.equal(pace.week, 1);
    assert.deepEqual([pace.thisWeek?.count, pace.thisWeek?.required], [1, 3]);
    assert.equal(pace.lastWeek, null);
  });

  test("fewer than 3 in the last finished week = behind; 3 or more = on track", () => {
    const behind = computeHomeworkPace({ ...base, today: "2026-11-10", submittedAt: [at("2026-11-03"), at("2026-11-08")] });
    assert.equal(behind.state, "behind");
    assert.deepEqual([behind.lastWeek?.number, behind.lastWeek?.from, behind.lastWeek?.to, behind.lastWeek?.count], [1, "2026-11-02", "2026-11-08", 2]);
    const ok = computeHomeworkPace({ ...base, today: "2026-11-10", submittedAt: [at("2026-11-03"), at("2026-11-04"), at("2026-11-08"), at("2026-11-09")] });
    assert.equal(ok.state, "on-track");
    assert.equal(ok.thisWeek?.count, 1, "the 9th belongs to week 2");
  });

  test("the requirement shrinks when fewer homeworks are left", () => {
    const pace = computeHomeworkPace({ ...base, totalLessons: 4, today: "2026-11-17", submittedAt: [at("2026-11-02"), at("2026-11-03"), at("2026-11-04"), at("2026-11-10")] });
    assert.equal(pace.lastWeek?.required, 1);
    assert.equal(pace.state, "on-track");
  });

  test("all homework done = exam ready (even with the rule off); rule off or not active = no warning", () => {
    assert.equal(computeHomeworkPace({ ...base, ruleEnabled: false, doneLessons: 10, today: "2026-11-20", submittedAt: [] }).state, "exam-ready");
    assert.equal(computeHomeworkPace({ ...base, ruleEnabled: false, today: "2026-11-20", submittedAt: [] }).state, "off");
    assert.equal(computeHomeworkPace({ ...base, status: "CANCELLED", today: "2026-11-20", submittedAt: [] }).state, "off");
    assert.equal(computeHomeworkPace({ ...base, today: "2026-10-30", submittedAt: [] }).state, "on-track", "before the start");
  });

  test("dates follow the platform time zone (Seoul): 23:30 UTC Sunday is Monday in Seoul", () => {
    const pace = computeHomeworkPace({ ...base, today: "2026-11-10", submittedAt: ["2026-11-08T23:30:00Z"] });
    assert.equal(pace.lastWeek?.count, 0);
    assert.equal(pace.thisWeek?.count, 1);
  });

  test("after the deadline: Tugallanmagan (incomplete); the teacher's exam result wins over everything", () => {
    const over = computeHomeworkPace({ ...base, doneLessons: 6, today: "2026-12-28", submittedAt: [] });
    assert.equal(over.state, "incomplete");
    assert.deepEqual([over.done, over.total], [6, 10]);
    assert.equal(computeHomeworkPace({ ...base, doneLessons: 6, today: "2026-12-27", submittedAt: [] }).state === "incomplete", false, "the last day still counts");
    assert.equal(computeHomeworkPace({ ...base, ruleEnabled: false, doneLessons: 6, today: "2026-12-28", submittedAt: [] }).state, "incomplete", "shown even with the weekly rule off");
    assert.equal(computeHomeworkPace({ ...base, status: "COMPLETED", doneLessons: 6, today: "2026-11-20", submittedAt: [] }).state, "incomplete", "closed early");
    assert.equal(computeHomeworkPace({ ...base, doneLessons: 10, today: "2026-12-28", submittedAt: [] }).state, "exam-ready", "all done is never incomplete");
    assert.equal(computeHomeworkPace({ ...base, status: "CANCELLED", doneLessons: 2, today: "2026-12-28", submittedAt: [] }).state, "off", "removed students aren't marked");
    assert.equal(computeHomeworkPace({ ...base, doneLessons: 10, today: "2026-12-28", submittedAt: [], examResult: "FAILED" }).state, "exam-failed");
    assert.equal(computeHomeworkPace({ ...base, doneLessons: 3, today: "2026-11-10", submittedAt: [], examResult: "PASSED" }).state, "exam-passed");
  });
});

describe("Telegram sending plan (random times, never at night)", () => {
  const seoulMinutes = (date: Date) => ((date.getUTCHours() + 9) % 24) * 60 + date.getUTCMinutes();
  // 2026-11-16 07:00 Seoul = 2026-11-15 22:00 UTC.
  const morning = new Date("2026-11-15T22:00:00.000Z");
  const base = { pacing: "SPREAD" as const, windowStart: "08:00", windowEnd: "17:00", accountConnected: true };

  test("20 students spread over 08:00–17:00: random, ordered, inside the window, at least 2 minutes apart", () => {
    const times = planSendTimes({ ...base, count: 20, now: morning });
    assert.equal(times.length, 20);
    for (const time of times) {
      assert.ok(seoulMinutes(time) >= 8 * 60 && seoulMinutes(time) <= 17 * 60, time.toISOString());
      assert.equal(new Date(time.getTime() + 9 * 3600_000).toISOString().slice(0, 10), "2026-11-16", "the same day");
    }
    for (let index = 1; index < times.length; index += 1) assert.ok(times[index].getTime() - times[index - 1].getTime() >= 2 * 60_000 - 1000);
    const gaps = times.slice(1).map((time, index) => time.getTime() - times[index].getTime());
    assert.ok(new Set(gaps).size > 10, "gaps are irregular");
    assert.ok(seoulMinutes(times[0]) < 9 * 60 && seoulMinutes(times.at(-1)!) > 16 * 60, "spread over the whole day");
  });

  test("after the window closes it starts the next morning; too many students continue the next day", () => {
    const evening = new Date("2026-11-16T10:00:00.000Z"); // 19:00 Seoul
    const next = planSendTimes({ ...base, count: 5, now: evening });
    for (const time of next) {
      assert.equal(new Date(time.getTime() + 9 * 3600_000).toISOString().slice(0, 10), "2026-11-17");
      assert.ok(seoulMinutes(time) >= 8 * 60 && seoulMinutes(time) <= 17 * 60);
    }
    const many = planSendTimes({ ...base, count: 300, now: morning });
    const days = new Set(many.map((time) => new Date(time.getTime() + 9 * 3600_000).toISOString().slice(0, 10)));
    assert.ok(days.size >= 2, "overflow goes to the next day");
    for (const time of many) assert.ok(seoulMinutes(time) >= 8 * 60 && seoulMinutes(time) <= 17 * 60, "never at night");
  });

  test("FAST: random 45–110 s gaps from an own number; all at once through the bot", () => {
    const fast = planSendTimes({ ...base, pacing: "FAST", count: 4, now: morning });
    assert.equal(fast[0].getTime(), morning.getTime());
    for (let index = 1; index < fast.length; index += 1) {
      const gap = fast[index].getTime() - fast[index - 1].getTime();
      assert.ok(gap >= 45_000 && gap <= 110_000, String(gap));
    }
    const bot = planSendTimes({ ...base, pacing: "FAST", count: 4, now: morning, accountConnected: false });
    assert.ok(bot.every((time) => time.getTime() === morning.getTime()));
    assert.deepEqual(shuffle([1, 2, 3, 4]).sort(), [1, 2, 3, 4]);
  });

  test("the saved Telegram login is encrypted and tamper-proof; contacts are parsed safely", () => {
    const sealed = encryptSession("session-string");
    assert.ok(!sealed.includes("session-string"));
    assert.equal(decryptSession(sealed), "session-string");
    assert.equal(decryptSession(sealed.slice(0, -2) + "AA"), null, "tampered");
    assert.equal(decryptSession("garbage"), null);
    assert.deepEqual(telegramTarget("@ali_karimov"), { username: "@ali_karimov", phone: null });
    assert.deepEqual(telegramTarget("+998 90 123 45 67"), { username: null, phone: "+998901234567" });
    assert.deepEqual(telegramTarget("hello"), { username: null, phone: null });
  });
});

describe("Personal message values and the daily automatic run", () => {
  test("{name}, {startDate}, {course}, {count}, {required}, {weekFrom}, {weekTo} are filled in (Uzbek dates)", () => {
    assert.equal(uzDate("2026-11-04"), "4-noyabr");
    const text = renderText("{name}: {startDate} kuni {course} boshlagansiz. {weekFrom} – {weekTo}: {count}/{required}", {
      name: "Ali",
      startDate: "2026-11-04",
      course: "RAG 1-oy",
      count: 1,
      required: 3,
      weekFrom: "2026-11-11",
      weekTo: "2026-11-17"
    });
    assert.equal(text, "Ali: 4-noyabr kuni RAG 1-oy boshlagansiz. 11-noyabr – 17-noyabr: 1/3");
    assert.equal(renderText("Salom {name}", "Madina"), "Salom Madina");
  });

  test("the automatic reminder runs once a day at its time (Seoul)", () => {
    const at0700 = new Date("2026-11-15T22:00:00.000Z"); // 16 Nov 07:00 Seoul
    assert.equal(nextDaily("10:00", at0700).toISOString(), "2026-11-16T01:00:00.000Z", "today 10:00");
    const at1100 = new Date("2026-11-16T02:00:00.000Z"); // 16 Nov 11:00 Seoul
    assert.equal(nextDaily("10:00", at1100).toISOString(), "2026-11-17T01:00:00.000Z", "tomorrow 10:00");
  });
});
