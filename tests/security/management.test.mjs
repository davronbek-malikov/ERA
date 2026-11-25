/**
 * Student Management & Payments — HTTP security and integration tests (docs/ERA_STUDENT_MANAGEMENT.md).
 * Runs against the production build started by tests/security/run.mjs, on the isolated local test database.
 * Covers the 20 acceptance scenarios: enrollments, manual payment verification, Pay Later and access, history,
 * permission boundaries (admin / teacher with and without permissions / student / anonymous) and the AI
 * assistant's read tools, proposals, confirmation and idempotency.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, test } from "node:test";

import { PrismaClient } from "@prisma/client";

import { actionWithFields, anonymous, as, call, fx, get, invokeAction, post, storageLog, telegramLinkToken } from "./helpers.mjs";

const prisma = new PrismaClient();
after(() => prisma.$disconnect());

const { users: u, courses: c, lessons: l, management: m, instructors: ins } = fx;
const admin = as(u.admin);
const teacherA = as(u.teacherA);
const teacherB = as(u.teacherB);
const studentA = as(u.studentA);
const bobSession = as(m.bob);
const ali2Session = as(m.ali2);

const NL = String.fromCharCode(10);
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const addDays = (date, days) => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const nextSaturday = addDays(today, (6 - new Date(`${today}T00:00:00Z`).getUTCDay() + 7) % 7 || 7);

const profile = async (session, studentId, workspace = "admin") => {
  const response = await get(`/api/management/students/${studentId}?workspace=${workspace}`, { session });
  return { status: response.status, profile: response.data?.profile };
};
const enrollmentOf = (p, courseId) => [...(p?.current ?? []), ...(p?.history ?? [])].find((view) => view.course.id === courseId);
const createEnrollment = (session, json) => post("/api/management/enrollments", { session, json });
const recordPayment = (session, json) => post("/api/management/payments", { session, json });
const decide = (session, id, json) => post(`/api/management/payments/${id}`, { session, json });
const access = (session, enrollmentId, json) => post(`/api/management/enrollments/${enrollmentId}/access`, { session, json });
const lessonContext = (session, lessonId) => get(`/api/lesson/${lessonId}/context`, { session });

function sse(response) {
  const events = [];
  for (const frame of response.text.split(NL + NL)) {
    const data = frame
      .split(NL)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join(NL);
    if (data) events.push(JSON.parse(data));
  }
  return events;
}
async function chat(session, agent, lines) {
  const response = await post("/api/ai/chat", { session, json: { agent, message: lines.join(NL), stream: true } });
  const events = sse(response);
  const done = events.find((event) => event.type === "done");
  const answer = done?.messages?.at(-1);
  return { status: response.status, events, answer, text: answer?.content ?? "", actions: answer?.actions ?? [], error: events.find((event) => event.type === "error") };
}
const confirmAction = (session, id, decision = "confirm") => post(`/api/ai/actions/${id}`, { session, json: { decision } });

const state = {};

describe("Enrollments and manual payment verification (admin)", () => {
  test("1. admin creates an enrollment; payment status starts UNPAID and is derived from transactions", async () => {
    const response = await createEnrollment(admin, {
      studentId: m.bob.id,
      courseId: c.courseA.id,
      startDate: today,
      endDate: addDays(today, 30),
      priceAmount: 500000,
      paymentArrangement: "PAY_IN_FULL",
      idempotencyKey: randomUUID()
    });
    assert.equal(response.status, 201, response.text);
    state.bobA = response.data.enrollmentId;
    const { profile: p } = await profile(admin, m.bob.id);
    const view = enrollmentOf(p, c.courseA.id);
    assert.equal(view.money.status, "UNPAID");
    assert.equal(view.money.remaining, 500000);
    assert.equal(view.teacher.id, ins.instructorA, "defaults to the course's teacher");
    const audit = await prisma.managementAuditLog.findFirst({ where: { entityId: state.bobA, action: "enrollment.create" } });
    assert.ok(audit, "creation is audited");
  });

  test("an enrollment for the same student and course is never created twice (history is not overwritten)", async () => {
    const response = await createEnrollment(admin, { studentId: m.bob.id, courseId: c.courseA.id, startDate: today, priceAmount: 1, paymentArrangement: "PAY_IN_FULL" });
    assert.equal(response.status, 409);
    assert.equal(response.data.code, "already-enrolled");
  });

  test("invalid input is rejected (end before start, negative or fractional money, Pay Later without due date)", async () => {
    const base = { studentId: m.ali1.id, courseId: m.courseA2.id, startDate: today, paymentArrangement: "PAY_IN_FULL" };
    assert.equal((await createEnrollment(admin, { ...base, priceAmount: 1000, endDate: addDays(today, -1) })).status, 400);
    assert.equal((await createEnrollment(admin, { ...base, priceAmount: -5 })).status, 400);
    assert.equal((await createEnrollment(admin, { ...base, priceAmount: 10.5 })).status, 400);
    assert.equal((await createEnrollment(admin, { ...base, priceAmount: 1000, paymentArrangement: "PAY_LATER" })).status, 400);
  });

  test("2. a full payment counts only after approval", async () => {
    const created = await createEnrollment(admin, {
      studentId: m.ali1.id,
      courseId: m.courseA2.id,
      startDate: today,
      endDate: addDays(today, 20),
      priceAmount: 300000,
      paymentArrangement: "PAY_IN_FULL"
    });
    assert.equal(created.status, 201, created.text);
    state.ali1A2 = created.data.enrollmentId;
    const recorded = await recordPayment(admin, { enrollmentId: state.ali1A2, amount: 300000, method: "BANK_TRANSFER" });
    assert.equal(recorded.status, 201);
    assert.equal(recorded.data.transaction.status, "PENDING");
    let view = enrollmentOf((await profile(admin, m.ali1.id)).profile, m.courseA2.id);
    assert.equal(view.money.status, "UNPAID", "PENDING never reduces the balance");
    assert.equal(view.money.pending, 300000);
    const approved = await decide(admin, recorded.data.transaction.id, { decision: "approve" });
    assert.equal(approved.status, 200, approved.text);
    view = enrollmentOf((await profile(admin, m.ali1.id)).profile, m.courseA2.id);
    assert.equal(view.money.status, "FULLY_PAID");
    assert.equal(view.money.remaining, 0);
  });

  test("3–4. multiple partial payments update the status automatically (₩100,000 + ₩150,000 + ₩250,000 = ₩500,000)", async () => {
    const statuses = [];
    for (const amount of [100000, 150000, 250000]) {
      const recorded = await recordPayment(admin, { enrollmentId: state.bobA, amount, method: "CASH" });
      assert.equal(recorded.status, 201);
      assert.equal((await decide(admin, recorded.data.transaction.id, { decision: "approve" })).status, 200);
      statuses.push(enrollmentOf((await profile(admin, m.bob.id)).profile, c.courseA.id).money);
    }
    assert.deepEqual(
      statuses.map((money) => [money.status, money.remaining]),
      [
        ["PARTIALLY_PAID", 400000],
        ["PARTIALLY_PAID", 250000],
        ["FULLY_PAID", 0]
      ]
    );
  });

  test("rejected and reversed payments never count, and nothing is deleted", async () => {
    const rejected = await recordPayment(admin, { enrollmentId: state.ali1A2, amount: 50000 });
    assert.equal((await decide(admin, rejected.data.transaction.id, { decision: "reject" })).status, 400, "a reason is required");
    assert.equal((await decide(admin, rejected.data.transaction.id, { decision: "reject", reason: "Not in the bank account" })).status, 200);
    const before = enrollmentOf((await profile(admin, m.ali1.id)).profile, m.courseA2.id);
    const approvedOne = before.payments.find((payment) => payment.status === "APPROVED");
    const reversed = await decide(admin, approvedOne.id, { decision: "reverse", reason: "Bank returned the transfer" });
    assert.equal(reversed.status, 200, reversed.text);
    const after = enrollmentOf((await profile(admin, m.ali1.id)).profile, m.courseA2.id);
    assert.equal(after.money.status, "UNPAID");
    assert.equal(after.money.remaining, 300000);
    assert.deepEqual(after.payments.map((payment) => payment.status).sort(), ["REJECTED", "REVERSED"]);
    assert.equal((await decide(admin, approvedOne.id, { decision: "reverse", reason: "again" })).status, 409, "can't reverse twice");
  });

  test("a correction keeps the original and adds a linked pending record", async () => {
    const recorded = await recordPayment(admin, { enrollmentId: state.ali1A2, amount: 100000 });
    const corrected = await decide(admin, recorded.data.transaction.id, { decision: "correct", amount: 150000, reason: "Actually paid 150,000" });
    assert.equal(corrected.status, 200, corrected.text);
    assert.equal(corrected.data.original.status, "REJECTED");
    assert.equal(corrected.data.correction.amount, 150000);
    assert.equal(corrected.data.correction.status, "PENDING");
    assert.equal(corrected.data.correction.correctionOfId, recorded.data.transaction.id);
    assert.equal(await prisma.paymentTransaction.count({ where: { id: recorded.data.transaction.id } }), 1, "original kept");
  });

  test("each month keeps its own payment: a payment recorded on the wrong month is moved, not double counted", async () => {
    // Bob: month 1 (courseA, state.bobA) and a second month (courseA2), both unpaid at first.
    const second = await createEnrollment(admin, { studentId: m.bob.id, courseId: m.courseA2.id, startDate: today, priceAmount: 100000, paymentArrangement: "PAY_IN_FULL" });
    assert.equal(second.status, 201, second.text);
    const monthTwo = second.data.enrollmentId;
    try {
      // Paid for the old month but confirmed on the new one by mistake.
      const wrong = await recordPayment(admin, { enrollmentId: monthTwo, amount: 100000, method: "CASH" });
      assert.equal((await decide(admin, wrong.data.transaction.id, { decision: "approve" })).status, 200);
      const oldBefore = enrollmentOf((await profile(admin, m.bob.id)).profile, c.courseA.id).money;

      assert.equal((await decide(admin, wrong.data.transaction.id, { decision: "move", targetEnrollmentId: monthTwo })).status, 409, "already on that month");
      assert.equal((await decide(admin, wrong.data.transaction.id, { decision: "move", targetEnrollmentId: state.ali1A2 })).status, 409, "another student's course");
      assert.equal((await decide(studentA, wrong.data.transaction.id, { decision: "move", targetEnrollmentId: state.bobA })).status, 403);

      const key = randomUUID();
      const moved = await decide(admin, wrong.data.transaction.id, { decision: "move", targetEnrollmentId: state.bobA, reason: "Paid for month 1", idempotencyKey: key });
      assert.equal(moved.status, 200, moved.text);
      assert.equal(moved.data.original.status, "REVERSED", "kept in the wrong month's history, no longer counts");
      assert.equal(moved.data.correction.enrollmentId, state.bobA);
      assert.equal(moved.data.correction.status, "APPROVED", "an approved payment stays approved on the right month");
      assert.equal(moved.data.correction.correctionOfId, wrong.data.transaction.id);
      const again = await decide(admin, wrong.data.transaction.id, { decision: "move", targetEnrollmentId: state.bobA, idempotencyKey: key });
      assert.equal(again.status, 200, "a retry returns the same move");
      assert.equal(await prisma.paymentTransaction.count({ where: { correctionOfId: wrong.data.transaction.id } }), 1, "moved once");

      const p = (await profile(admin, m.bob.id)).profile;
      const newMonth = enrollmentOf(p, m.courseA2.id).money;
      assert.equal(newMonth.approved, 0, "the new month is not paid by the old month's money");
      assert.equal(newMonth.remaining, 100000);
      assert.equal(enrollmentOf(p, c.courseA.id).money.approved, oldBefore.approved + 100000, "counted on the old month");
      assert.ok(await prisma.managementAuditLog.findFirst({ where: { action: "payment.move", entityId: wrong.data.transaction.id } }));
      assert.equal((await decide(admin, wrong.data.transaction.id, { decision: "move", targetEnrollmentId: monthTwo })).status, 409, "a moved payment can't move again");
    } finally {
      const ids = (await prisma.paymentTransaction.findMany({ where: { enrollmentId: monthTwo }, select: { id: true } })).map((row) => row.id);
      await prisma.paymentTransaction.deleteMany({ where: { correctionOfId: { in: ids } } });
      await prisma.paymentTransaction.deleteMany({ where: { enrollmentId: monthTwo } });
      await prisma.enrollment.delete({ where: { id: monthTwo } });
    }
  });

  test("18 (manual). retrying with the same idempotency key never records a second payment", async () => {
    const key = randomUUID();
    const first = await recordPayment(admin, { enrollmentId: state.ali1A2, amount: 12345, idempotencyKey: key });
    const second = await recordPayment(admin, { enrollmentId: state.ali1A2, amount: 12345, idempotencyKey: key });
    const raced = await Promise.all([1, 2, 3].map(() => recordPayment(admin, { enrollmentId: state.ali1A2, amount: 12345, idempotencyKey: key })));
    assert.equal(first.status, 201);
    assert.equal(second.data.transaction.id, first.data.transaction.id);
    assert.equal(second.data.created, false);
    assert.ok(raced.every((response) => response.data?.transaction?.id === first.data.transaction.id));
    assert.equal(await prisma.paymentTransaction.count({ where: { idempotencyKey: key } }), 1);
    assert.equal((await recordPayment(admin, { enrollmentId: state.ali1A2, amount: 99, idempotencyKey: key })).status, 409, "same key, different payment");
  });

  test("a refund can't exceed the approved payments", async () => {
    const refund = await recordPayment(admin, { enrollmentId: state.ali1A2, amount: 999999, kind: "REFUND" });
    assert.equal(refund.status, 201);
    assert.equal((await decide(admin, refund.data.transaction.id, { decision: "approve" })).status, 409);
  });
});

describe("Access, Pay Later and course history", () => {
  test("5–6. an unpaid student with Pay Later access can study; the payment status stays UNPAID", async () => {
    const created = await createEnrollment(admin, {
      studentId: m.ali2.id,
      courseId: c.courseA.id,
      startDate: today,
      priceAmount: 400000,
      paymentArrangement: "PAY_IN_FULL",
      grantAccess: false
    });
    assert.equal(created.status, 201, created.text);
    state.ali2A = created.data.enrollmentId;
    let context = await lessonContext(ali2Session, l.lessonA1.id);
    assert.equal(context.status, 403, "restricted until access is granted");
    assert.equal(context.data.code, "course-access-blocked");

    const granted = await access(admin, state.ali2A, { action: "grant_pay_later", reason: "Scholarship pending", paymentDueDate: addDays(today, 14) });
    assert.equal(granted.status, 200, granted.text);
    context = await lessonContext(ali2Session, l.lessonA1.id);
    assert.equal(context.status, 200, context.text);
    const view = enrollmentOf((await profile(admin, m.ali2.id)).profile, c.courseA.id);
    assert.equal(view.money.status, "UNPAID");
    assert.equal(view.arrangement, "PAY_LATER");
    assert.equal(view.accessAllowed, true);
    assert.ok(view.accessLog.some((log) => log.reason?.includes("Scholarship pending")), "access change logged");
  });

  test("7. revoking access blocks lessons, the tutor and progress; restoring brings them back", async () => {
    assert.equal((await access(admin, state.ali2A, { action: "revoke", reason: "Left the course" })).status, 200);
    assert.equal((await lessonContext(ali2Session, l.lessonA1.id)).status, 403);
    const tutor = await post("/api/era/chat", { session: ali2Session, json: { courseId: c.courseA.id, lessonId: l.lessonA1.id, question: "hello" } });
    assert.equal(tutor.status, 403);
    const page = await get(`/learn/courses/${c.courseA.slug}/lessons/${l.lessonA1.slug}`, { session: ali2Session });
    assert.ok(!page.text.includes("SECRET_CONTENT_a-1"), "no lesson content for a revoked student");
    assert.equal((await access(admin, state.ali2A, { action: "revoke", reason: "again" })).status, 409, "no-op changes are refused");
    assert.equal((await access(admin, state.ali2A, { action: "restore", reason: "Came back" })).status, 200);
    assert.equal((await lessonContext(ali2Session, l.lessonA1.id)).status, 200);
  });

  test("removing a student from a course cuts access at once, keeps history, and only staff can return them", async () => {
    const membership = (session, json) => post(`/api/management/enrollments/${state.ali2A}/membership`, { session, json });
    assert.equal((await membership(teacherA, { workspace: "teacher", action: "remove" })).status, 403, "teacher without permission");
    assert.ok([403, 404].includes((await membership(teacherB, { workspace: "teacher", action: "remove" })).status), "another teacher's student");
    assert.equal((await membership(ali2Session, { action: "remove" })).status, 403, "students can't use it");

    const removed = await membership(admin, { action: "remove", reason: "Left the group" });
    assert.equal(removed.status, 200, removed.text);
    assert.equal((await lessonContext(ali2Session, l.lessonA1.id)).status, 403, "no lessons after removal");
    const tutor = await post("/api/era/chat", { session: ali2Session, json: { courseId: c.courseA.id, lessonId: l.lessonA1.id, question: "hello" } });
    assert.equal(tutor.status, 403, "no tutor after removal");
    const view = enrollmentOf((await profile(admin, m.ali2.id)).profile, c.courseA.id);
    assert.equal(view.status, "CANCELLED", "kept as history, not deleted");
    assert.equal(view.accessStatus, "REVOKED");
    assert.equal((await membership(admin, { action: "remove" })).status, 409, "already removed");

    const restored = await membership(admin, { action: "restore" });
    assert.equal(restored.status, 200, restored.text);
    assert.equal((await lessonContext(ali2Session, l.lessonA1.id)).status, 200, "back in after the teacher returns them");
    assert.equal(enrollmentOf((await profile(admin, m.ali2.id)).profile, c.courseA.id).status, "ACTIVE");

    // Finished the course (moving on): it leaves "current" for Previous courses, can be reopened.
    assert.equal((await membership(ali2Session, { action: "complete" })).status, 403, "students can't finish courses");
    const finished = await membership(admin, { action: "complete" });
    assert.equal(finished.status, 200, finished.text);
    const p = (await profile(admin, m.ali2.id)).profile;
    assert.ok(p.history.some((view) => view.id === state.ali2A && view.status === "COMPLETED"), "under previous courses");
    assert.ok(!p.current.some((view) => view.id === state.ali2A), "no longer current");
    assert.ok(await prisma.managementAuditLog.findFirst({ where: { action: "enrollment.complete", entityId: state.ali2A } }));
    assert.equal((await membership(admin, { action: "complete" })).status, 409, "already finished");
    assert.equal((await membership(admin, { action: "restore" })).status, 200, "reopened");
    assert.equal(enrollmentOf((await profile(admin, m.ali2.id)).profile, c.courseA.id).status, "ACTIVE");
  });

  test("19. due dates: with the overdue rule on, a passed due date with a balance pauses access", async () => {
    const patched = await call("PATCH", `/api/management/enrollments/${state.ali2A}`, { session: admin, json: { paymentDueDate: addDays(today, -1) } });
    assert.equal(patched.status, 200, patched.text);
    assert.equal((await lessonContext(ali2Session, l.lessonA1.id)).status, 200, "rule off: overdue alone doesn't block");
    assert.equal((await access(admin, state.ali2A, { action: "set_overdue_rule", reason: "Policy", restrictWhenOverdue: true })).status, 200);
    const blocked = await lessonContext(ali2Session, l.lessonA1.id);
    assert.equal(blocked.status, 403);
    assert.match(blocked.data.error, /overdue/i);
    const view = enrollmentOf((await profile(admin, m.ali2.id)).profile, c.courseA.id);
    assert.equal(view.money.overdue, true);
    assert.equal((await access(admin, state.ali2A, { action: "set_overdue_rule", reason: "Policy off", restrictWhenOverdue: false })).status, 200);
    assert.equal((await lessonContext(ali2Session, l.lessonA1.id)).status, 200);
    assert.equal((await access(admin, state.ali2A, { action: "extend", reason: "x", accessExpiresAt: addDays(today, -3) })).status, 400, "no past expiry");
  });

  test("8–9. completing a course keeps it in history; the next course is a new enrollment", async () => {
    const completed = await call("PATCH", `/api/management/enrollments/${state.bobA}`, { session: admin, json: { status: "COMPLETED", reason: "Finished" } });
    assert.equal(completed.status, 200, completed.text);
    const second = await createEnrollment(admin, {
      studentId: m.bob.id,
      courseId: m.courseA2.id,
      startDate: addDays(today, 3),
      endDate: addDays(today, 33),
      priceAmount: 500000,
      paymentArrangement: "PARTIAL"
    });
    assert.equal(second.status, 201, second.text);
    state.bobA2 = second.data.enrollmentId;
    const { profile: p } = await profile(admin, m.bob.id);
    assert.deepEqual(p.current.map((view) => view.course.id), [m.courseA2.id]);
    const old = p.history.find((view) => view.course.id === c.courseA.id);
    assert.equal(old.status, "COMPLETED");
    assert.equal(old.money.status, "FULLY_PAID", "the finished course keeps its own payments");
    assert.equal(old.payments.filter((payment) => payment.status === "APPROVED").length, 3);
  });

  test("a student sees their own enrollments and payment status, but never internal notes or approvers", async () => {
    const note = await post("/api/management/notes", { session: admin, json: { studentId: m.ali2.id, note: "INTERNAL_NOTE_SECRET" } });
    assert.equal(note.status, 201);
    const page = await get("/learn/courses", { session: ali2Session });
    assert.equal(page.status, 200);
    assert.ok(page.text.includes("Pay Later"));
    for (const secret of ["INTERNAL_NOTE_SECRET", "Scholarship pending", "Test admin"]) assert.ok(!page.text.includes(secret), secret);
  });
});

describe("Permission boundaries", () => {
  test("10. a teacher sees only their assigned students", async () => {
    assert.equal((await profile(teacherA, m.bob.id, "teacher")).status, 200);
    assert.equal((await profile(teacherB, m.bob.id, "teacher")).status, 404);
    const page = await get("/teacher/my-students", { session: teacherB });
    assert.equal(page.status, 200);
    assert.ok(!page.text.includes("Bob Lee") && !page.text.includes("Ali Rahimov"));
    const own = await get("/teacher/my-students", { session: teacherA });
    assert.ok(own.text.includes("Ali Rahimov"));
    assert.equal((await get("/admin/students", { session: teacherA })).status >= 300, true, "admin-only page");
  });

  test("11. a teacher without permission can't change payments; with 'record' they can't approve", async () => {
    const recorded = await recordPayment(teacherA, { workspace: "teacher", enrollmentId: state.bobA2, amount: 10000 });
    assert.equal(recorded.status, 201, recorded.text);
    assert.equal(recorded.data.transaction.status, "PENDING");
    assert.equal((await decide(teacherA, recorded.data.transaction.id, { workspace: "teacher", decision: "approve" })).status, 403);
    assert.equal((await recordPayment(teacherB, { workspace: "teacher", enrollmentId: state.bobA2, amount: 10000 })).status, 403);
    assert.ok([403, 404].includes((await decide(teacherB, recorded.data.transaction.id, { workspace: "teacher", decision: "reject", reason: "x" })).status));
    assert.equal((await createEnrollment(teacherA, { workspace: "teacher", studentId: u.studentC.id, courseId: c.courseA.id, startDate: today, priceAmount: 1, paymentArrangement: "PAY_IN_FULL" })).status, 403);
    assert.equal((await access(teacherA, state.ali2A, { workspace: "teacher", action: "restrict", reason: "x" })).status, 403);
    const teacherBView = await profile(teacherA, m.ali2.id, "teacher");
    assert.ok(teacherBView.profile.current[0].money, "teacher A may see payments");
  });

  test("a teacher without 'see payments' gets no money fields at all", async () => {
    await prisma.enrollment.update({ where: { id: state.ali2A }, data: { instructorId: ins.instructorB } });
    const view = await profile(teacherB, m.ali2.id, "teacher");
    assert.equal(view.status, 200);
    assert.equal(view.profile.current[0].money, null);
    assert.deepEqual(view.profile.current[0].payments, []);
    await prisma.enrollment.update({ where: { id: state.ali2A }, data: { instructorId: ins.instructorA } });
  });

  test("12. students and anonymous visitors can't use the management API", async () => {
    assert.equal((await profile(studentA, u.studentB.id)).status, 403);
    assert.equal((await recordPayment(studentA, { enrollmentId: state.bobA2, amount: 1 })).status, 403);
    assert.equal((await profile(anonymous, m.bob.id)).status, 401);
    assert.equal((await recordPayment(anonymous, { enrollmentId: state.bobA2, amount: 1 })).status, 401);
    assert.equal((await post(`/api/ai/actions/abc123`, { session: studentA, json: { decision: "confirm" } })).status, 404);
  });

  test("only administrators change teacher permissions; changes are audited", async () => {
    const body = { viewPayments: true, recordPayments: false, approvePayments: false, manageEnrollments: false, manageAccess: false };
    assert.equal((await call("PUT", `/api/management/teachers/${ins.instructorB}/permissions`, { session: teacherA, json: { workspace: "teacher", ...body } })).status, 403);
    const saved = await call("PUT", `/api/management/teachers/${ins.instructorB}/permissions`, { session: admin, json: body });
    assert.equal(saved.status, 200, saved.text);
    assert.ok(await prisma.managementAuditLog.findFirst({ where: { entityId: ins.instructorB, action: "permission.update" } }));
    await call("PUT", `/api/management/teachers/${ins.instructorB}/permissions`, { session: admin, json: { ...body, viewPayments: false } });
  });

  test("cross-site requests and client-supplied identities are ignored", async () => {
    const forged = await call("POST", "/api/management/payments", {
      session: admin,
      json: { enrollmentId: state.bobA2, amount: 1 },
      headers: { origin: "https://evil.example" }
    });
    assert.equal(forged.status, 403);
    const spoof = await recordPayment(teacherA, { workspace: "teacher", enrollmentId: state.bobA2, amount: 1, recordedById: u.admin.id, status: "APPROVED" });
    assert.equal(spoof.status, 201);
    assert.equal(spoof.data.transaction.status, "PENDING");
    assert.equal(spoof.data.transaction.recordedById, u.teacherA.id);
  });

  test("exams: teachers schedule for their own courses only", async () => {
    assert.equal((await post("/api/management/exams", { session: teacherB, json: { workspace: "teacher", courseId: m.courseA2.id, title: "x", examDate: nextSaturday, startTime: "10:00" } })).status, 404);
    const exam = await post("/api/management/exams", {
      session: teacherA,
      json: { workspace: "teacher", courseId: m.courseA2.id, title: "SATURDAY_EXAM_A2", examDate: nextSaturday, startTime: "10:00", endTime: "11:30" }
    });
    assert.equal(exam.status, 201, exam.text);
    state.examId = exam.data.examId;
    assert.equal((await post("/api/management/exams", { session: teacherA, json: { workspace: "teacher", courseId: m.courseA2.id, title: "x", examDate: nextSaturday, startTime: "12:00", endTime: "11:00" } })).status, 400);
    assert.equal((await call("DELETE", `/api/management/exams/${state.examId}?workspace=teacher`, { session: teacherB })).status, 404);
  });
});

describe("ERA AI Student Management assistant", () => {
  test("13. read tools: unpaid students come from the database", async () => {
    const r = await chat(admin, "admin", ["Show all students who have not paid.", 'TOOLCALL list_enrollments {"paymentStatus":"UNPAID"}']);
    assert.equal(r.status, 200);
    assert.ok(!r.error, JSON.stringify(r.error));
    assert.ok(r.text.includes("Ali Rahimov"), r.text.slice(0, 500));
    assert.ok(!r.text.includes("Ali Karimov") || r.text.includes("UNPAID"), "statuses come from the tool result");
    assert.ok(r.events.some((event) => event.type === "tool"));
    const log = (await storageLog()).filter((entry) => entry.path === "ollama:/api/chat").at(-1);
    assert.ok(log.system.includes("ERA Student Management tools") && log.system.includes(today), "tool rules and today's date are in the system prompt");
  });

  test("14. Saturday's exams", async () => {
    const r = await chat(admin, "admin", ["Who has exams this Saturday?", `TOOLCALL list_exams {"from":"${nextSaturday}","to":"${nextSaturday}"}`]);
    assert.ok(r.text.includes("SATURDAY_EXAM_A2"), r.text.slice(0, 500));
  });

  test("17. ambiguous names are returned for clarification, not guessed", async () => {
    const r = await chat(admin, "admin", ["Ali paid 100,000 KRW today", 'TOOLCALL find_students {"query":"Ali"}']);
    assert.ok(r.text.includes("Ali Karimov") && r.text.includes("Ali Rahimov"));
    assert.ok(r.text.includes("Several students match"));
    assert.equal(r.actions.length, 0);
  });

  test("15. the AI creates an enrollment only after confirmation", async () => {
    const before = await prisma.enrollment.count({ where: { userId: m.ali1.id, courseId: c.courseB.id } });
    const r = await chat(admin, "admin", [
      "Ali Karimov starts course B today, finishing in 30 days, price 200,000 won.",
      `TOOLCALL propose_enrollment {"studentId":"${m.ali1.id}","courseId":"${c.courseB.id}","startDate":"${today}","endDate":"${addDays(today, 30)}","priceAmount":200000,"paymentArrangement":"PAY_IN_FULL"}`
    ]);
    assert.equal(r.actions.length, 1, JSON.stringify(r.error ?? r.text));
    assert.equal(r.actions[0].status, "PENDING");
    assert.equal(await prisma.enrollment.count({ where: { userId: m.ali1.id, courseId: c.courseB.id } }), before, "nothing written before confirmation");
    const confirmed = await confirmAction(admin, r.actions[0].id);
    assert.equal(confirmed.status, 200, confirmed.text);
    assert.equal(confirmed.data.action.status, "EXECUTED");
    const created = await prisma.enrollment.findFirst({ where: { userId: m.ali1.id, courseId: c.courseB.id } });
    assert.equal(created.priceAmount, 200000);
    assert.ok(await prisma.managementAuditLog.findFirst({ where: { entityId: created.id, action: "enrollment.create", source: "AI" } }));
  });

  test("16 & 18. the AI records a PENDING payment after confirmation, exactly once", async () => {
    const r = await chat(admin, "admin", ["Bob paid 70,000 today", `TOOLCALL propose_payment {"enrollmentId":"${state.bobA2}","amount":70000,"method":"CASH"}`]);
    assert.equal(r.actions.length, 1, JSON.stringify(r.error ?? r.text));
    const actionId = r.actions[0].id;
    assert.equal(await prisma.paymentTransaction.count({ where: { enrollmentId: state.bobA2, amount: 70000 } }), 0);
    assert.equal((await confirmAction(teacherA, actionId)).status, 404, "only the user it was proposed to can confirm");
    const results = await Promise.all([confirmAction(admin, actionId), confirmAction(admin, actionId), confirmAction(admin, actionId)]);
    assert.ok(results.every((response) => response.status === 200));
    const again = await confirmAction(admin, actionId);
    assert.equal(again.data.action.status, "EXECUTED");
    const rows = await prisma.paymentTransaction.findMany({ where: { enrollmentId: state.bobA2, amount: 70000 } });
    assert.equal(rows.length, 1, "no duplicate transaction");
    assert.equal(rows[0].status, "PENDING");
    assert.equal(rows[0].source, "AI");
    assert.equal(rows[0].idempotencyKey, `ai-action:${actionId}`);
    const history = await get(`/api/ai/conversations/${r.events.find((event) => event.type === "done").conversationId}?agent=admin`, { session: admin });
    assert.ok(history.data.messages.some((message) => message.content.includes("PENDING")), "the result is added to the conversation");
  });

  test("approving a payment through the AI needs confirmation and the permission", async () => {
    const pending = await prisma.paymentTransaction.findFirst({ where: { enrollmentId: state.bobA2, amount: 70000 } });
    const teacher = await chat(teacherA, "teacher", [`TOOLCALL propose_payment_review {"transactionId":"${pending.id}","decision":"approve"}`]);
    assert.equal(teacher.actions.length, 0, "teacher A can't approve: the tool isn't even offered");
    const r = await chat(admin, "admin", [`TOOLCALL propose_payment_review {"transactionId":"${pending.id}","decision":"approve"}`]);
    assert.equal(r.actions.length, 1);
    assert.equal((await prisma.paymentTransaction.findUnique({ where: { id: pending.id } })).status, "PENDING");
    assert.equal((await confirmAction(admin, r.actions[0].id)).data.action.status, "EXECUTED");
    assert.equal((await prisma.paymentTransaction.findUnique({ where: { id: pending.id } })).status, "APPROVED");
  });

  test("cancelled proposals never run; the AI can't reach another teacher's students", async () => {
    const r = await chat(admin, "admin", [`TOOLCALL propose_access_change {"enrollmentId":"${state.ali2A}","action":"revoke","reason":"test"}`]);
    assert.equal(r.actions.length, 1);
    assert.equal((await confirmAction(admin, r.actions[0].id, "cancel")).data.action.status, "CANCELLED");
    assert.equal((await confirmAction(admin, r.actions[0].id)).data.action.status, "CANCELLED");
    assert.equal((await prisma.enrollment.findUnique({ where: { id: state.ali2A } })).accessStatus, "ACTIVE");

    const other = await chat(teacherB, "teacher", [`TOOLCALL get_student_profile {"studentId":"${m.bob.id}"}`]);
    assert.ok(other.text.includes("not found"), other.text.slice(0, 300));
    const offered = (await storageLog()).filter((entry) => entry.path === "ollama:/api/chat").at(-1).body.tools.map((tool) => tool.function.name);
    assert.ok(!offered.includes("propose_payment") && !offered.includes("list_payments"), `teacher B has no payment tools: ${offered}`);
  });

  test("invalid tool input is rejected by the server, not trusted", async () => {
    const r = await chat(admin, "admin", [`TOOLCALL propose_payment {"enrollmentId":"${state.bobA2}","amount":-5}`]);
    assert.equal(r.actions.length, 0);
    assert.ok(/amount/i.test(r.text), r.text.slice(0, 300));
  });
});

describe("Teacher homework workflow (docs/ERA_TEACHER_HOMEWORK.md)", () => {
  const hw = {};

  test("the teacher workspace opens on My students", async () => {
    const response = await get("/teacher", { session: teacherA });
    assert.ok([303, 307, 308].includes(response.status), String(response.status));
    assert.match(response.location ?? "", /\/teacher\/my-students$/);
  });

  test("a teacher creates a course with lessons; other teachers can't touch it", async () => {
    const created = await post("/api/management/courses", {
      session: teacherA,
      json: {
        workspace: "teacher",
        title: "Machine Learning Foundation HW",
        durationWeeks: 4,
        lessons: [
          { title: "Intro", taughtSummary: "Python + numpy", homework: "HOMEWORK_TEXT_1" },
          { title: "Linear regression", homework: "Train a model" },
          { title: "Logistic regression" }
        ]
      }
    });
    assert.equal(created.status, 201, created.text);
    hw.courseId = created.data.courseId;
    assert.equal(created.data.lessons, 3);
    const lessons = await prisma.lesson.findMany({ where: { courseId: hw.courseId }, orderBy: { position: "asc" } });
    assert.deepEqual(lessons.map((lesson) => lesson.position), [1, 2, 3]);
    hw.lesson1 = lessons[0].id;
    hw.lesson3 = lessons[2].id;
    hw.lesson2 = lessons[1].id;
    assert.equal((await post(`/api/management/courses/${hw.courseId}/lessons`, { session: teacherB, json: { workspace: "teacher", title: "x" } })).status, 404);
    assert.equal((await call("PATCH", `/api/management/lessons/${hw.lesson3}`, { session: teacherB, json: { workspace: "teacher", homework: "x" } })).status, 404);
    const added = await post(`/api/management/courses/${hw.courseId}/lessons`, { session: teacherA, json: { workspace: "teacher", title: "Trees", homework: "Fit a tree" } });
    assert.equal(added.status, 201);
    assert.equal(added.data.position, 4);
    const edited = await call("PATCH", `/api/management/lessons/${hw.lesson3}`, {
      session: teacherA,
      json: { workspace: "teacher", taughtSummary: "Sigmoid, log loss", homework: "Classify Titanic" }
    });
    assert.equal(edited.status, 200, edited.text);
  });

  test("adding a student: admin (with enrollment and temporary password); duplicates and missing permission refused", async () => {
    const created = await post("/api/management/students", {
      session: admin,
      json: { name: "Homework Student", email: "hw-student@security.test", githubUrl: "github.com/hwstudent", courseId: hw.courseId, startDate: today, priceAmount: 500000 }
    });
    assert.equal(created.status, 201, created.text);
    assert.match(created.data.temporaryPassword, /^Era-[a-z0-9]{4}-[a-z0-9]{4}$/);
    assert.equal(created.data.enrollment.courseTitle, "Machine Learning Foundation HW");
    hw.studentId = created.data.student.id;
    hw.enrollmentId = created.data.enrollment.enrollmentId;
    const user = await prisma.user.findUnique({ where: { id: hw.studentId } });
    assert.equal(user.role, "STUDENT");
    assert.equal(user.githubUrl, "https://github.com/hwstudent");
    assert.notEqual(user.passwordHash, created.data.temporaryPassword, "only the hash is stored");
    assert.equal((await post("/api/management/students", { session: admin, json: { name: "Dup", email: "hw-student@security.test" } })).status, 409);
    assert.equal((await post("/api/management/students", { session: teacherB, json: { workspace: "teacher", name: "No", email: "no-perm@security.test" } })).status, 403);
    assert.equal((await post("/api/management/students", { session: studentA, json: { name: "No", email: "no-perm2@security.test" } })).status, 403);
  });

  test("homework checks: the student's teacher records them; profile shows lesson, homework and result", async () => {
    const review = await call("PUT", "/api/management/homework", {
      session: teacherA,
      json: { workspace: "teacher", enrollmentId: hw.enrollmentId, lessonId: hw.lesson1, status: "DONE", githubUrl: "https://github.com/hwstudent/ml/tree/main/lesson-1", note: "Clean notebook" }
    });
    assert.equal(review.status, 200, review.text);
    const again = await call("PUT", "/api/management/homework", {
      session: teacherA,
      json: { workspace: "teacher", enrollmentId: hw.enrollmentId, lessonId: hw.lesson3, status: "NEEDS_WORK", note: "Missing plots" }
    });
    assert.equal(again.status, 200);
    assert.equal(await prisma.homeworkReview.count({ where: { enrollmentId: hw.enrollmentId } }), 2);

    const { profile: p } = await profile(teacherA, hw.studentId, "teacher");
    const view = p.current.find((item) => item.id === hw.enrollmentId);
    assert.equal(view.homework.length, 4);
    assert.equal(view.homework[0].homework, "HOMEWORK_TEXT_1");
    assert.equal(view.homework[0].review.status, "DONE");
    assert.equal(view.homework[2].review.status, "NEEDS_WORK");
    assert.equal(view.homework[1].review, null);
    assert.equal(p.student.githubUrl, "https://github.com/hwstudent");

    const list = await get("/teacher/my-students", { session: teacherA });
    assert.ok(list.text.includes("Homework Student") && list.text.includes("1/4"), "list shows homework progress");
  });

  test("homework checks are scoped and validated", async () => {
    const body = { workspace: "teacher", enrollmentId: hw.enrollmentId, lessonId: hw.lesson1, status: "DONE" };
    assert.equal((await call("PUT", "/api/management/homework", { session: teacherB, json: body })).status, 404, "another teacher's student");
    assert.equal((await call("PUT", "/api/management/homework", { session: teacherA, json: { ...body, status: "PERFECT" } })).status, 400);
    assert.equal((await call("PUT", "/api/management/homework", { session: teacherA, json: { ...body, lessonId: l.lessonA1.id } })).status, 404, "lesson of another course");
    assert.equal((await call("PUT", "/api/management/homework", { session: teacherA, json: { ...body, githubUrl: "javascript:alert(1)" } })).status, 400);
    assert.equal((await call("PUT", "/api/management/homework", { session: studentA, json: body })).status, 403);
    const page = await get("/learn/courses", { session: as({ id: hw.studentId, role: "STUDENT", name: "Homework Student" }) });
    assert.ok(!page.text.includes("Clean notebook") && !page.text.includes("Missing plots"), "teacher notes aren't shown to the student");
  });

  test("the chatbot reads lessons and homework, and records a check only after confirmation", async () => {
    const lessons = await chat(teacherA, "teacher", [`TOOLCALL list_course_lessons {"courseId":"${hw.courseId}"}`]);
    assert.ok(lessons.text.includes("HOMEWORK_TEXT_1") && lessons.text.includes("Classify Titanic"), lessons.text.slice(0, 400));
    const todo = await chat(teacherA, "teacher", [`TOOLCALL list_homework {"courseId":"${hw.courseId}","status":"NOT_SUBMITTED"}`]);
    assert.ok(todo.text.includes("2. Linear regression") && !todo.text.includes("1. Intro"), todo.text.slice(0, 400));

    const proposal = await chat(teacherA, "teacher", [
      `TOOLCALL propose_homework_review {"enrollmentId":"${hw.enrollmentId}","lessonId":"${hw.lesson3}","status":"DONE","note":"Fixed the plots"}`
    ]);
    assert.equal(proposal.actions.length, 1, JSON.stringify(proposal.error ?? proposal.text));
    assert.equal((await prisma.homeworkReview.findFirst({ where: { enrollmentId: hw.enrollmentId, lessonId: hw.lesson3 } })).status, "NEEDS_WORK", "unchanged before confirmation");
    assert.equal((await confirmAction(teacherA, proposal.actions[0].id)).data.action.status, "EXECUTED");
    const after = await prisma.homeworkReview.findFirst({ where: { enrollmentId: hw.enrollmentId, lessonId: hw.lesson3 } });
    assert.equal(after.status, "DONE");
    assert.equal(after.note, "Fixed the plots");
    assert.ok(await prisma.managementAuditLog.findFirst({ where: { entityId: after.id, action: "homework.review", source: "AI" } }));

    const course = await chat(teacherA, "teacher", ['TOOLCALL propose_course {"title":"Deep Learning HW","lessons":[{"title":"CNNs","homework":"Build a CNN"}]}']);
    assert.equal(course.actions.length, 1, JSON.stringify(course.error ?? course.text));
    const confirmed = await confirmAction(teacherA, course.actions[0].id);
    assert.equal(confirmed.data.action.status, "EXECUTED");
    const createdCourse = await prisma.course.findFirst({ where: { title: "Deep Learning HW" }, include: { lessons: true } });
    assert.equal(createdCourse.instructorId, ins.instructorA, "created for the teacher who asked");
    assert.equal(createdCourse.lessons[0].homework, "Build a CNN");
  });

  test("hand-in dates are saved; the profile shows the weekly pace; going back to not-submitted clears the date", async () => {
    const reviewed = await prisma.homeworkReview.findFirst({ where: { enrollmentId: hw.enrollmentId, lessonId: hw.lesson1 } });
    assert.ok(reviewed.submittedAt, "a handed-in homework has a submission date");
    const { profile: p } = await profile(teacherA, hw.studentId, "teacher");
    const view = p.current.find((item) => item.id === hw.enrollmentId);
    assert.ok(["on-track", "behind", "off", "exam-ready"].includes(view.pace.state), JSON.stringify(view.pace));
    assert.equal(view.pace.perWeek, 3);

    const reset = await call("PUT", "/api/management/homework", { session: teacherA, json: { workspace: "teacher", enrollmentId: hw.enrollmentId, lessonId: hw.lesson2, status: "SUBMITTED" } });
    assert.equal(reset.status, 200, reset.text);
    assert.ok((await prisma.homeworkReview.findFirst({ where: { enrollmentId: hw.enrollmentId, lessonId: hw.lesson2 } })).submittedAt);
    await call("PUT", "/api/management/homework", { session: teacherA, json: { workspace: "teacher", enrollmentId: hw.enrollmentId, lessonId: hw.lesson2, status: "NOT_SUBMITTED" } });
    assert.equal((await prisma.homeworkReview.findFirst({ where: { enrollmentId: hw.enrollmentId, lessonId: hw.lesson2 } })).submittedAt, null);
  });

  test("each teacher turns their own rule on/off; students and bad values are refused", async () => {
    const rule = (session, json) => call("PUT", "/api/management/homework/rule", { session, json });
    assert.equal((await rule(teacherA, { workspace: "teacher", enabled: true, perWeek: 0 })).status, 400);
    assert.equal((await rule(teacherA, { workspace: "teacher", enabled: "yes", perWeek: 3 })).status, 400);
    assert.equal((await rule(studentA, { enabled: false, perWeek: 3 })).status, 403);

    const off = await rule(teacherA, { workspace: "teacher", enabled: false, perWeek: 4 });
    assert.equal(off.status, 200, off.text);
    const teacherAInstructor = await prisma.instructor.findFirst({ where: { userId: u.teacherA.id } });
    assert.equal(teacherAInstructor.homeworkRuleEnabled, false);
    assert.equal(teacherAInstructor.homeworkPerWeek, 4);
    const teacherBInstructor = await prisma.instructor.findFirst({ where: { userId: u.teacherB.id } });
    assert.equal(teacherBInstructor.homeworkRuleEnabled, true, "another teacher's rule is untouched");

    const { profile: p } = await profile(teacherA, hw.studentId, "teacher");
    assert.equal(p.current.find((item) => item.id === hw.enrollmentId).pace.state, "off");
    assert.ok(await prisma.managementAuditLog.findFirst({ where: { action: "homework.rule", actorId: u.teacherA.id } }), "audited");
    assert.equal((await rule(teacherA, { workspace: "teacher", enabled: true, perWeek: 3 })).status, 200);
  });

  test("automatic reminder: each student's own week (from their start date) ends behind → one personal message per week", async () => {
    const UZ = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
    const uz = (date) => `${Number(date.slice(8, 10))}-${UZ[Number(date.slice(5, 7)) - 1]}`;
    const start = addDays(today, -7); // week 1 = start … yesterday: just ended
    const cron = () => call("GET", "/api/cron/telegram", { headers: { authorization: "Bearer test-cron-secret" } });
    await prisma.user.update({ where: { id: hw.studentId }, data: { telegramChatId: "555" } });
    await prisma.enrollment.update({ where: { id: hw.enrollmentId }, data: { startDate: new Date(`${start}T00:00:00.000Z`) } });
    try {
      const auto = await post("/api/management/telegram/messages", {
        session: teacherA,
        json: { workspace: "teacher", text: "Avto {name}: {startDate} kuni boshlagansiz, {weekFrom}–{weekTo}: {count}/{required}", audience: "ALL", when: "AUTO", time: "10:00", pacing: "FAST" }
      });
      assert.equal(auto.status, 201, auto.text);
      const row = await prisma.telegramMessage.findUnique({ where: { id: auto.data.messageId } });
      assert.equal(row.schedule, "STUDENT_WEEK");
      assert.equal(row.audience, "BEHIND", "AUTO always targets students behind the rule");

      await prisma.telegramMessage.update({ where: { id: row.id }, data: { nextRunAt: new Date(Date.now() - 1000) } });
      assert.equal((await cron()).status, 200);
      const deliveries = await prisma.telegramDelivery.findMany({ where: { messageId: row.id, studentId: hw.studentId } });
      assert.equal(deliveries.length, 1, "the student whose week just ended");
      assert.equal(deliveries[0].runKey, `week:${start}`);
      const expected = `Avto Homework Student: ${uz(start)} kuni boshlagansiz, ${uz(start)}–${uz(addDays(start, 6))}: 0/3`;
      assert.equal(deliveries[0].text, expected);
      const sent = (await storageLog()).filter((entry) => entry.path.endsWith("/sendMessage") && String(entry.body?.chat_id) === "555" && String(entry.body?.text ?? "").startsWith("Avto Homework Student"));
      assert.equal(sent.length, 1);
      assert.ok(sent[0].body.text.startsWith(expected), "personal values filled in");

      // Next day's run: same week, no second message.
      await prisma.telegramMessage.update({ where: { id: row.id }, data: { nextRunAt: new Date(Date.now() - 1000) } });
      await cron();
      assert.equal(await prisma.telegramDelivery.count({ where: { messageId: row.id, studentId: hw.studentId } }), 1, "once per week");
      assert.ok((await prisma.telegramMessage.findUnique({ where: { id: row.id } })).nextRunAt > new Date(), "runs again tomorrow");

      // Backup timer from the open page: teachers only.
      assert.equal((await post("/api/management/telegram/dispatch", { session: teacherA, json: { workspace: "teacher" } })).status, 200);
      assert.equal((await post("/api/management/telegram/dispatch", { session: studentA, json: {} })).status, 403);
    } finally {
      await prisma.enrollment.update({ where: { id: hw.enrollmentId }, data: { startDate: new Date(`${today}T00:00:00.000Z`) } });
      await prisma.user.update({ where: { id: hw.studentId }, data: { telegramChatId: null } });
      await prisma.telegramMessage.deleteMany({ where: { instructorId: ins.instructorA } });
    }
  });

  test("send again to the students a message didn't reach, once they have a Telegram connection", async () => {
    await prisma.user.update({ where: { id: hw.studentId }, data: { telegramChatId: null, telegram: null } });
    try {
      const first = await post("/api/management/telegram/messages", { session: teacherA, json: { workspace: "teacher", text: "Qayta {name}", audience: "SELECTED", studentIds: [hw.studentId], when: "NOW" } });
      assert.equal(first.status, 201, first.text);
      assert.equal(first.data.summary.notConnected, 1, "no contact yet");
      const retry = (session) => post(`/api/management/telegram/messages/${first.data.messageId}/retry`, { session, json: { workspace: "teacher" } });
      assert.equal((await retry(teacherB)).status, 404, "another teacher's message");
      assert.equal((await retry(studentA)).status, 403);

      await prisma.user.update({ where: { id: hw.studentId }, data: { telegramChatId: "555" } }); // the contact was added later
      const again = await retry(teacherA);
      assert.equal(again.status, 200, again.text);
      assert.equal(again.data.requeued, 1);
      assert.equal(again.data.sent, 1);
      const delivery = await prisma.telegramDelivery.findFirst({ where: { messageId: first.data.messageId } });
      assert.equal(delivery.status, "SENT");
      assert.ok((await storageLog()).some((entry) => entry.path.endsWith("/sendMessage") && String(entry.body?.text ?? "").startsWith("Qayta Homework Student")));
      assert.equal((await retry(teacherA)).data.requeued, 0, "nothing left to resend");
    } finally {
      await prisma.user.update({ where: { id: hw.studentId }, data: { telegramChatId: null } });
      await prisma.telegramMessage.deleteMany({ where: { instructorId: ins.instructorA } });
    }
  });

  test("Tugallanmagan after the deadline; the teacher records Imtihondan o'tdi / yiqilgan for their own students only", async () => {
    const url = `/api/management/enrollments/${hw.enrollmentId}/exam-result`;
    const result = (session, value) => call("PUT", url, { session, json: { workspace: "teacher", result: value } });
    assert.equal((await result(teacherB, "FAILED")).status, 404, "another teacher's student");
    assert.equal((await result(studentA, "FAILED")).status, 403);
    assert.equal((await result(teacherA, "MAYBE")).status, 400);

    const original = await prisma.enrollment.findUnique({ where: { id: hw.enrollmentId }, select: { startDate: true, endDate: true } });
    try {
      // The course ended yesterday with homework still missing → incomplete (Tugallanmagan).
      await prisma.enrollment.update({ where: { id: hw.enrollmentId }, data: { startDate: new Date(`${addDays(today, -30)}T00:00:00.000Z`), endDate: new Date(`${addDays(today, -1)}T00:00:00.000Z`) } });
      let view = enrollmentOf((await profile(teacherA, hw.studentId, "teacher")).profile, hw.courseId);
      assert.equal(view.pace.state, "incomplete", JSON.stringify(view.pace));
      assert.ok(view.pace.done < view.pace.total);
      const list = await get("/teacher/my-students?status=all", { session: teacherA });
      assert.ok(list.text.includes("Incomplete or failed the exam"), "banner on My students");

      assert.equal((await result(teacherA, "FAILED")).status, 200);
      view = enrollmentOf((await profile(teacherA, hw.studentId, "teacher")).profile, hw.courseId);
      assert.equal(view.pace.state, "exam-failed");
      assert.equal(view.examResult, "FAILED");
      assert.ok(await prisma.managementAuditLog.findFirst({ where: { action: "enrollment.exam_result", entityId: hw.enrollmentId, actorId: u.teacherA.id } }));

      assert.equal((await result(teacherA, "PASSED")).status, 200);
      view = enrollmentOf((await profile(teacherA, hw.studentId, "teacher")).profile, hw.courseId);
      assert.equal(view.pace.state, "exam-passed");

      assert.equal((await result(teacherA, null)).status, 200, "can be cleared");
      assert.equal((await prisma.enrollment.findUnique({ where: { id: hw.enrollmentId } })).examResult, null);
    } finally {
      await prisma.enrollment.update({ where: { id: hw.enrollmentId }, data: { startDate: original.startDate, endDate: original.endDate, examResult: null, examResultAt: null, examResultById: null } });
    }
  });

  test("Telegram: the webhook needs the secret; only a valid personal invite link connects a student", async () => {
    const hook = (secret, text, chatType = "private", chatId = 555) =>
      call("POST", "/api/telegram/webhook", {
        headers: secret ? { "x-telegram-bot-api-secret-token": secret } : {},
        json: { update_id: 1, message: { text, chat: { id: chatId, type: chatType } } }
      });
    const token = telegramLinkToken(hw.studentId);
    assert.equal((await hook(null, `/start ${token}`)).status, 401);
    assert.equal((await hook("wrong-secret", `/start ${token}`)).status, 401);

    const forged = await hook("test-webhook-secret", `/start ${u.studentA.id}_AAAAAAAAAAAAAAAAAAAAAA`);
    assert.equal(forged.status, 200);
    assert.equal((await prisma.user.findUnique({ where: { id: u.studentA.id } })).telegramChatId, null, "a forged token links nobody");
    const borrowed = telegramLinkToken(u.studentA.id).replace(u.studentA.id, hw.studentId);
    await hook("test-webhook-secret", `/start ${borrowed}`);
    assert.equal((await prisma.user.findUnique({ where: { id: hw.studentId } })).telegramChatId, null, "one student's signature doesn't work for another");
    await hook("test-webhook-secret", `/start ${token}`, "group", -100);
    assert.equal((await prisma.user.findUnique({ where: { id: hw.studentId } })).telegramChatId, null, "groups are ignored");

    assert.equal((await hook("test-webhook-secret", `/start ${token}`)).status, 200);
    const linked = await prisma.user.findUnique({ where: { id: hw.studentId } });
    assert.equal(linked.telegramChatId, "555");
    assert.ok(linked.telegramLinkedAt);
    const replies = (await storageLog()).filter((entry) => entry.path.endsWith("/sendMessage") && String(entry.body?.chat_id) === "555");
    assert.ok(replies.some((entry) => entry.body.text.includes("ulandingiz")), "the student gets a confirmation");
  });

  test("Telegram messages: the teacher chooses who, what and when; scope, validation and once-per-run delivery", async () => {
    const create = (session, json) => post("/api/management/telegram/messages", { session, json: { workspace: "teacher", ...json } });
    const cron = (headers = { authorization: "Bearer test-cron-secret" }) => call("GET", "/api/cron/telegram", { headers });
    const sentTo555 = async (prefix) => (await storageLog()).filter((entry) => entry.path.endsWith("/sendMessage") && String(entry.body?.chat_id) === "555" && String(entry.body?.text ?? "").startsWith(prefix)).length;
    const tomorrow = addDays(today, 1);

    // Validation and permissions.
    assert.equal((await create(studentA, { text: "x", audience: "ALL", when: "NOW" })).status, 403);
    assert.equal((await create(teacherA, { text: "  ", audience: "ALL", when: "NOW" })).status, 400);
    assert.equal((await create(teacherA, { text: "x", audience: "EVERYONE", when: "NOW" })).status, 400);
    assert.equal((await create(teacherA, { text: "x", audience: "SELECTED", studentIds: [], when: "NOW" })).status, 400);
    assert.equal((await create(teacherA, { text: "x", audience: "ALL", when: "ONCE", date: addDays(today, -1), time: "10:00" })).status, 400, "past time");
    assert.equal((await create(teacherA, { text: "x", audience: "ALL", when: "WEEKLY", weekday: 9, time: "10:00" })).status, 400);
    assert.equal((await create(teacherA, { text: "x", audience: "ALL", when: "WEEKLY", weekday: 6, time: "25:00" })).status, 400);
    assert.equal((await create(teacherB, { text: "x", audience: "SELECTED", studentIds: [hw.studentId], when: "NOW" })).status, 404, "another teacher's student");

    // NOW to chosen students; {name} is filled in.
    await prisma.user.update({ where: { id: hw.studentId }, data: { telegramChatId: "555" } });
    const before = await sentTo555("Salom Homework Student");
    const now = await create(teacherA, { text: "Salom {name}, dars 19:00 da", audience: "SELECTED", studentIds: [hw.studentId], when: "NOW" });
    assert.equal(now.status, 201, now.text);
    assert.equal(now.data.summary.sent, 1, now.text);
    assert.equal((await sentTo555("Salom Homework Student")) - before, 1);
    assert.ok(await prisma.managementAuditLog.findFirst({ where: { action: "telegram.send", entityId: now.data.messageId, actorId: u.teacherA.id } }));

    // BEHIND: only students behind the weekly rule right now.
    await prisma.enrollment.update({ where: { id: hw.enrollmentId }, data: { startDate: new Date(`${addDays(today, -10)}T00:00:00.000Z`) } });
    try {
      const behind = await create(teacherA, { text: "Ortda {name}", audience: "BEHIND", when: "NOW" });
      assert.equal(behind.status, 201, behind.text);
      assert.equal(await sentTo555("Ortda Homework Student"), 1, "the behind student got it");

      // ONCE at an exact time: nothing before it is due, exactly once after.
      const once = await create(teacherA, { text: "Bir martalik {name}", audience: "ALL", when: "ONCE", date: tomorrow, time: "09:30" });
      assert.equal(once.status, 201, once.text);
      assert.equal(new Date(once.data.nextRunAt).toISOString(), new Date(`${tomorrow}T00:30:00.000Z`).toISOString(), "09:30 Seoul = 00:30 UTC");
      assert.equal((await cron({})).status, 401);
      assert.equal((await cron({ authorization: "Bearer wrong" })).status, 401);
      assert.equal((await cron()).status, 200);
      assert.equal(await sentTo555("Bir martalik"), 0, "not before its time");
      await prisma.telegramMessage.update({ where: { id: once.data.messageId }, data: { nextRunAt: new Date(Date.now() - 1000) } });
      const ran = await cron();
      assert.ok(ran.data.processed >= 1 && ran.data.sent >= 1, ran.text);
      await cron();
      assert.equal(await sentTo555("Bir martalik Homework Student"), 1, "a one-time message is sent once");
      assert.equal((await prisma.telegramMessage.findUnique({ where: { id: once.data.messageId } })).active, false);

      // WEEKLY on Saturday 10:00 Seoul; two scheduler calls at the same moment still send once.
      const weekly = await create(teacherA, { text: "Haftalik {name}", audience: "BEHIND", when: "WEEKLY", weekday: 6, time: "10:00" });
      assert.equal(weekly.status, 201, weekly.text);
      const next = new Date(weekly.data.nextRunAt);
      assert.equal(next.getUTCDay(), 6);
      assert.equal(next.getUTCHours(), 1, "10:00 Seoul = 01:00 UTC");
      assert.ok(next.getTime() > Date.now());
      await prisma.telegramMessage.update({ where: { id: weekly.data.messageId }, data: { nextRunAt: new Date(Date.now() - 1000) } });
      await Promise.all([cron(), cron()]);
      assert.equal(await sentTo555("Haftalik Homework Student"), 1, "exactly one delivery per weekly run");
      const afterRun = await prisma.telegramMessage.findUnique({ where: { id: weekly.data.messageId } });
      assert.equal(afterRun.active, true);
      assert.ok(afterRun.nextRunAt.getTime() > Date.now(), "moved to next week");

      // Pause / resume / delete: own messages only.
      const url = `/api/management/telegram/messages/${weekly.data.messageId}`;
      assert.equal((await call("PATCH", url, { session: teacherB, json: { workspace: "teacher", active: false } })).status, 404);
      assert.equal((await call("PATCH", url, { session: teacherA, json: { workspace: "teacher", active: false } })).status, 200);
      await prisma.telegramMessage.update({ where: { id: weekly.data.messageId }, data: { nextRunAt: new Date(Date.now() - 1000) } });
      await cron();
      assert.equal(await sentTo555("Haftalik Homework Student"), 1, "a paused message is not sent");
      const resumed = await call("PATCH", url, { session: teacherA, json: { workspace: "teacher", active: true } });
      assert.equal(resumed.status, 200, resumed.text);
      assert.ok(new Date(resumed.data.nextRunAt).getTime() > Date.now(), "resumes from the next future Saturday, no catch-up burst");
      assert.equal((await call("DELETE", `${url}?workspace=teacher`, { session: teacherB })).status, 404);
      assert.equal((await call("DELETE", `${url}?workspace=teacher`, { session: teacherA })).status, 200);
      assert.equal(await prisma.telegramMessage.findUnique({ where: { id: weekly.data.messageId } }), null);

      // A student who blocked the bot: failed, and shown as not connected again.
      await prisma.user.update({ where: { id: hw.studentId }, data: { telegramChatId: "blocked" } });
      const blocked = await create(teacherA, { text: "Blok {name}", audience: "SELECTED", studentIds: [hw.studentId], when: "NOW" });
      assert.equal(blocked.data.summary.failed, 1, blocked.text);
      assert.equal((await prisma.user.findUnique({ where: { id: hw.studentId } })).telegramChatId, null);

      // The Messages page: in the sidebar, lists my students with invite links, never secrets; other teachers don't see them.
      const page = await get("/teacher/assistant/messages", { session: teacherA });
      assert.equal(page.status, 200);
      assert.ok(page.text.includes('href="/teacher/assistant/messages"') && page.text.includes('href="/teacher/assistant"'), "sidebar: Chatbot and Messages");
      assert.ok(page.text.includes("Homework Student"));
      assert.ok(page.text.includes("t.me/era_test_bot?start="));
      assert.ok(!page.text.includes("test-bot-token-123") && !page.text.includes("test-cron-secret") && !page.text.includes("test-webhook-secret"), "no secrets in the page");
      assert.ok(!(await get("/teacher/assistant/messages", { session: teacherB })).text.includes("Homework Student"));
      assert.ok([303, 307, 308].includes((await get("/teacher/assistant/messages", { session: studentA })).status), "students are sent away");
    } finally {
      await prisma.enrollment.update({ where: { id: hw.enrollmentId }, data: { startDate: new Date(`${today}T00:00:00.000Z`) } });
      await prisma.telegramMessage.deleteMany({ where: { instructorId: ins.instructorA } });
    }
  });
});

describe("Voice input for the assistant", () => {
  const audio = () => {
    const form = new FormData();
    form.append("audio", new Blob([new Uint8Array(4000)], { type: "audio/webm" }), "voice.webm");
    return form;
  };
  test("only teachers and admins may transcribe; nothing works without a configured provider", async () => {
    assert.equal((await post("/api/ai/transcribe", { session: anonymous, body: audio() })).status, 401);
    assert.equal((await post("/api/ai/transcribe", { session: studentA, body: audio() })).status, 403);
    const teacher = await post("/api/ai/transcribe", { session: teacherA, body: audio() });
    assert.equal(teacher.status, 503, "the test server has no GROQ_API_KEY / OPENAI_API_KEY");
    assert.equal(teacher.data.code, "voice-not-configured");
    const forged = await call("POST", "/api/ai/transcribe", { session: teacherA, body: audio(), headers: { origin: "https://evil.example" } });
    assert.equal(forged.status, 403);
  });
});

describe("Students without email, Telegram contact, course order", () => {
  test("a teacher adds a student with only a name and Telegram; no email or password is shown", async () => {
    const created = await post("/api/management/students", { session: admin, json: { name: "Telegram Only", telegram: "t.me/tg_only_student", courseId: m.courseA2.id, startDate: today, priceAmount: 300000 } });
    assert.equal(created.status, 201, created.text);
    assert.equal(created.data.temporaryPassword, null, "no sign-in details for a record-only student");
    const user = await prisma.user.findUnique({ where: { id: created.data.student.id } });
    assert.equal(user.telegram, "@tg_only_student");
    assert.match(user.email, /@no-email\.eraacademy\.local$/);
    const { profile: p } = await profile(admin, user.id);
    assert.equal(p.student.email, null, "the internal address is never returned");
    assert.equal(p.student.telegram, "@tg_only_student");
    const page = await get(`/admin/students/${user.id}`, { session: admin });
    assert.ok(!page.text.includes("no-email.eraacademy.local"));
    assert.equal((await post("/api/management/students", { session: admin, json: { name: "Bad TG", telegram: "not a handle!" } })).status, 400);
    const edited = await call("PATCH", `/api/management/students/${user.id}`, { session: admin, json: { telegram: "+998901234567" } });
    assert.equal(edited.status, 200, edited.text);
    assert.equal(edited.data.telegram, "+998901234567");
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  });

  test("teachers set their own course order; other teachers' courses can't be included", async () => {
    const mine = await prisma.course.findMany({ where: { instructorId: ins.instructorA }, orderBy: { createdAt: "asc" }, select: { id: true } });
    const reversed = mine.map((course) => course.id).reverse();
    const saved = await call("PUT", "/api/management/courses/order", { session: teacherA, json: { workspace: "teacher", courseIds: reversed } });
    assert.equal(saved.status, 200, saved.text);
    const after = await prisma.course.findMany({ where: { instructorId: ins.instructorA }, orderBy: { position: "asc" }, select: { id: true } });
    assert.deepEqual(after.map((course) => course.id), reversed);
    assert.equal((await call("PUT", "/api/management/courses/order", { session: teacherA, json: { workspace: "teacher", courseIds: [...reversed, c.courseB.id] } })).status, 404);
    assert.equal((await call("PUT", "/api/management/courses/order", { session: studentA, json: { courseIds: reversed } })).status, 403);
  });
});

describe("A new teacher works on their own right away (multi-teacher)", () => {
  const nt = {};
  test("admin creates a teacher account → own profile, starter permissions, own students only, signed Telegram messages", async () => {
    const usersHtml = (await get("/admin/users", { session: admin })).text;
    const actionId = actionWithFields(usersHtml, ["name", "email", "password", "role"]);
    assert.ok(actionId, "the create-user form exists");
    const email = `new-teacher-${randomUUID().slice(0, 8)}@security.test`;
    await invokeAction("/admin/users", actionId, { name: "Nodira Opa", email, password: "Password123!", role: "INSTRUCTOR", status: "ACTIVE" }, admin);

    const user = await prisma.user.findUnique({ where: { email } });
    assert.equal(user?.role, "INSTRUCTOR");
    const profile = await prisma.instructor.findUnique({ where: { userId: user.id }, include: { permissions: true } });
    assert.ok(profile, "a teacher profile is created and linked");
    assert.equal(profile.permissions?.canManageEnrollments, true, "can add and enroll students");
    assert.equal(profile.permissions?.canRecordPayments, true, "can record payments");
    assert.ok(await prisma.managementAuditLog.findFirst({ where: { action: "permission.starter", entityId: profile.id } }));

    const nodira = as({ id: user.id, role: "INSTRUCTOR", name: "Nodira Opa", email });
    Object.assign(nt, { session: nodira, instructorId: profile.id });
    const course = await post("/api/management/courses", { session: nodira, json: { workspace: "teacher", title: "Nodira Python", durationWeeks: 4, lessons: [{ title: "Kirish", homework: "Hello world" }] } });
    assert.equal(course.status, 201, course.text);
    const student = await post("/api/management/students", {
      session: nodira,
      json: { workspace: "teacher", name: "Nodira Student", telegram: "@nodira_student", courseId: course.data.courseId, startDate: today, priceAmount: 300000 }
    });
    assert.equal(student.status, 201, student.text);
    const enrollmentId = student.data.enrollment.enrollmentId;
    Object.assign(nt, { courseId: course.data.courseId, studentId: student.data.student.id });
    const paid = await recordPayment(nodira, { workspace: "teacher", enrollmentId, kind: "PAYMENT", amount: 300000, currency: "KRW", method: "CASH", transactionDate: today, idempotencyKey: randomUUID() });
    assert.equal(paid.status, 201, paid.text);
    assert.equal((await decide(nodira, paid.data.transaction.id, { workspace: "teacher", decision: "approve" })).status, 200, "approves money for their own student");

    // Isolation both ways.
    const mine = await get("/teacher/my-students", { session: nodira });
    assert.ok(mine.text.includes("Nodira Student") && !mine.text.includes("Homework Student"), "sees only their own students");
    assert.ok(!(await get("/teacher/my-students", { session: teacherA })).text.includes("Nodira Student"), "others don't see theirs");
    assert.equal((await post("/api/management/telegram/messages", { session: nodira, json: { workspace: "teacher", text: "x", audience: "SELECTED", studentIds: [u.studentA.id], when: "NOW" } })).status, 404);

    // Telegram: one shared bot, every message signed with the teacher's name.
    await prisma.user.update({ where: { id: student.data.student.id }, data: { telegramChatId: "777" } });
    const sent = await post("/api/management/telegram/messages", { session: nodira, json: { workspace: "teacher", text: "Salom {name}", audience: "ALL", when: "NOW" } });
    assert.equal(sent.status, 201, sent.text);
    assert.equal(sent.data.summary.sent, 1);
    const message = (await storageLog()).filter((entry) => entry.path.endsWith("/sendMessage") && String(entry.body?.chat_id) === "777").at(-1);
    assert.equal(message.body.text, "Salom Nodira Student\n\n— Nodira Opa, ERA Academy");
  });

  test("own Telegram number: connect step by step, send from it, fall back to the bot, pace and pause on FLOOD_WAIT", async () => {
    assert.ok(nt.session, "previous test created the teacher");
    const account = (session, json) => post("/api/management/telegram/account", { session, json: { workspace: "teacher", ...json } });
    const create = (json) => post("/api/management/telegram/messages", { session: nt.session, json: { workspace: "teacher", ...json } });
    const mtproto = async (op) => (await storageLog()).filter((entry) => entry.path === `/mtproto/${op}`);
    const ready = () => prisma.telegramAccount.update({ where: { instructorId: nt.instructorId }, data: { lastSentAt: null, limitedUntil: null } });
    const addStudent = async (name, telegram, chatId) => {
      const created = await post("/api/management/students", { session: nt.session, json: { workspace: "teacher", name, telegram, courseId: nt.courseId, startDate: today, priceAmount: 100000 } });
      assert.equal(created.status, 201, created.text);
      if (chatId) await prisma.user.update({ where: { id: created.data.student.id }, data: { telegramChatId: chatId } });
      return created.data.student.id;
    };

    // Connecting: only the teacher, validated, phone → code → two-step password.
    assert.equal((await account(studentA, { step: "phone", phone: "+998901112233" })).status, 403);
    assert.equal((await account(nt.session, { step: "phone", phone: "12" })).status, 400);
    assert.equal((await account(nt.session, { step: "phone", phone: "+998900000000" })).status, 400, "Telegram rejects the number");
    const started = await account(nt.session, { step: "phone", phone: "+998901112233" });
    assert.equal(started.status, 200, started.text);
    assert.equal(started.data.status, "CODE_SENT");
    assert.equal((await account(nt.session, { step: "code", code: "99999" })).status, 400, "wrong code");
    assert.equal((await account(nt.session, { step: "code", code: "22222" })).data.status, "PASSWORD_NEEDED");
    assert.equal((await account(nt.session, { step: "password", password: "nope" })).status, 400, "wrong password");
    const connected = await account(nt.session, { step: "password", password: "secret-pass" });
    assert.equal(connected.data.status, "CONNECTED", connected.text);
    const row = await prisma.telegramAccount.findUnique({ where: { instructorId: nt.instructorId } });
    assert.equal(row.status, "CONNECTED");
    assert.ok(row.sessionEnc && !row.sessionEnc.includes("live-session-SECRET"), "the login is stored encrypted");
    assert.ok(await prisma.managementAuditLog.findFirst({ where: { action: "telegram.account.connect", actorId: (await prisma.instructor.findUnique({ where: { id: nt.instructorId } })).userId } }));
    const page = await get("/teacher/assistant/messages", { session: nt.session });
    assert.ok(page.text.includes("nodira_opa") && !page.text.includes("live-session-SECRET") && !page.text.includes(row.sessionEnc), "status shown, login never");
    assert.equal(await prisma.telegramAccount.count({ where: { instructorId: ins.instructorA } }), 0, "other teachers are unaffected");

    // From the teacher's own number: no bot, no signature.
    await ready();
    const own = await create({ text: "Salom {name}", audience: "SELECTED", studentIds: [nt.studentId], when: "NOW", pacing: "FAST" });
    assert.equal(own.status, 201, own.text);
    assert.equal(own.data.summary.sent, 1, own.text);
    const sendCall = (await mtproto("send")).at(-1);
    assert.equal(sendCall.body.target, "@nodira_student");
    assert.equal(sendCall.body.text, "Salom Nodira Student", "from the teacher: no bot signature");
    assert.equal((await prisma.telegramDelivery.findFirst({ where: { messageId: own.data.messageId } })).via, "ACCOUNT");

    // Privacy blocks strangers → the bot takes over (signed).
    const privateId = await addStudent("Private Student", "@private_user", "778");
    await ready();
    const fallback = await create({ text: "Salom {name}", audience: "SELECTED", studentIds: [privateId], when: "NOW", pacing: "FAST" });
    assert.equal(fallback.data.summary.sent, 1, fallback.text);
    assert.equal((await prisma.telegramDelivery.findFirst({ where: { messageId: fallback.data.messageId } })).via, "BOT");
    const botCall = (await storageLog()).filter((entry) => entry.path.endsWith("/sendMessage") && String(entry.body?.chat_id) === "778").at(-1);
    assert.equal(botCall.body.text, "Salom Private Student\n\n— Nodira Opa, ERA Academy");

    // FAST from an own number: one now, the next after a random 45–110 s gap.
    await ready();
    const fast = await create({ text: "Tez {name}", audience: "SELECTED", studentIds: [nt.studentId, privateId], when: "NOW", pacing: "FAST" });
    assert.equal(fast.data.summary.queued, 1, fast.text);
    const queued = await prisma.telegramDelivery.findFirst({ where: { messageId: fast.data.messageId, status: "QUEUED" } });
    const gap = queued.scheduledFor.getTime() - queued.createdAt.getTime();
    assert.ok(gap >= 44_000 && gap <= 111_000, `random gap ${gap}`);
    assert.equal((await call("GET", "/api/cron/telegram", { headers: { authorization: "Bearer test-cron-secret" } })).status, 200);
    assert.equal((await prisma.telegramDelivery.findUnique({ where: { id: queued.id } })).status, "QUEUED", "not before its time");

    // FLOOD_WAIT: the account pauses and the message waits (it does not jump to the bot).
    const floodId = await addStudent("Flood Student", "@flood_user", "779");
    await ready();
    const flood = await create({ text: "Flood {name}", audience: "SELECTED", studentIds: [floodId], when: "NOW", pacing: "FAST" });
    assert.equal(flood.data.summary.queued, 1, flood.text);
    const waiting = await prisma.telegramDelivery.findFirst({ where: { messageId: flood.data.messageId } });
    assert.equal(waiting.status, "QUEUED");
    assert.ok(waiting.scheduledFor.getTime() >= Date.now() + 290_000, "retried after Telegram's wait");
    assert.ok((await prisma.telegramAccount.findUnique({ where: { instructorId: nt.instructorId } })).limitedUntil > new Date());
    assert.ok(!(await storageLog()).some((entry) => entry.path.endsWith("/sendMessage") && String(entry.body?.chat_id) === "779"), "no bot burst while waiting");

    // SPREAD: random times inside 08:00–17:00 Seoul, never at night, and pausing holds the queue.
    await ready();
    const tomorrow = addDays(today, 1);
    const spread = await create({ text: "Kun {name}", audience: "ALL", when: "ONCE", date: tomorrow, pacing: "SPREAD", windowStart: "08:00", windowEnd: "17:00" });
    assert.equal(spread.status, 201, spread.text);
    assert.equal(new Date(spread.data.nextRunAt).toISOString(), new Date(`${addDays(tomorrow, -1)}T23:00:00.000Z`).toISOString(), "08:00 Seoul = 23:00 UTC the day before");
    await prisma.telegramMessage.update({ where: { id: spread.data.messageId }, data: { nextRunAt: new Date(Date.now() - 1000) } });
    await call("GET", "/api/cron/telegram", { headers: { authorization: "Bearer test-cron-secret" } });
    const planned = await prisma.telegramDelivery.findMany({ where: { messageId: spread.data.messageId } });
    assert.equal(planned.length, 3);
    for (const delivery of planned) {
      const minutes = ((delivery.scheduledFor.getUTCHours() + 9) % 24) * 60 + delivery.scheduledFor.getUTCMinutes();
      assert.ok(minutes >= 8 * 60 && minutes <= 17 * 60, `inside the window: ${delivery.scheduledFor.toISOString()}`);
    }
    const plan = `/api/management/telegram/messages/${spread.data.messageId}`;
    assert.equal((await call("PATCH", plan, { session: nt.session, json: { workspace: "teacher", active: false } })).status, 200);
    assert.equal(await prisma.telegramDelivery.count({ where: { messageId: spread.data.messageId, status: "QUEUED" } }), 0, "paused");
    assert.equal((await call("PATCH", plan, { session: teacherA, json: { workspace: "teacher", active: true } })).status, 404, "other teachers can't touch it");
    assert.equal((await call("PATCH", plan, { session: nt.session, json: { workspace: "teacher", active: true } })).status, 200);
    assert.ok((await prisma.telegramDelivery.count({ where: { messageId: spread.data.messageId, status: "QUEUED" } })) > 0, "resumed");
    await prisma.telegramMessage.delete({ where: { id: spread.data.messageId } });

    // The teacher ended the session in Telegram (Settings → Devices): back to the bot, shown as disconnected.
    const revokeId = await addStudent("Revoke Student", "@revoke_me", null);
    await ready();
    const revoked = await create({ text: "x {name}", audience: "SELECTED", studentIds: [revokeId], when: "NOW", pacing: "FAST" });
    assert.equal(revoked.data.summary.notConnected, 1, revoked.text);
    assert.equal((await prisma.telegramAccount.findUnique({ where: { instructorId: nt.instructorId } })).status, "DISCONNECTED");

    // Disconnect removes the login.
    assert.equal((await call("DELETE", "/api/management/telegram/account?workspace=teacher", { session: nt.session })).status, 200);
    assert.equal(await prisma.telegramAccount.count({ where: { instructorId: nt.instructorId } }), 0);
    await prisma.telegramMessage.deleteMany({ where: { instructorId: nt.instructorId } });
  });

  test("move to the next month in one step: the result goes on the finished month, only the new month is current", async () => {
    assert.ok(nt.session && nt.studentId);
    const second = await post("/api/management/courses", { session: nt.session, json: { workspace: "teacher", title: "Nodira RAG 1-oy", durationWeeks: 4, lessons: [{ title: "RAG", homework: "Build a retriever" }] } });
    assert.equal(second.status, 201, second.text);
    const old = await prisma.enrollment.findFirst({ where: { userId: nt.studentId, courseId: nt.courseId } });
    const next = (session, json) => post(`/api/management/enrollments/${old.id}/next`, { session, json: { workspace: "teacher", ...json } });
    assert.ok([403, 404].includes((await next(teacherA, { courseId: second.data.courseId, startDate: today, priceAmount: 100000 })).status), "another teacher's student");
    assert.equal((await next(studentA, { courseId: second.data.courseId, startDate: today })).status, 403);
    assert.equal((await next(nt.session, { courseId: nt.courseId, startDate: today, priceAmount: 100000 })).status, 409, "not the same course");
    assert.equal((await next(nt.session, { courseId: second.data.courseId, startDate: today, priceAmount: 100000, examResult: "GREAT" })).status, 400);

    const moved = await next(nt.session, { courseId: second.data.courseId, startDate: today, priceAmount: 100000, examResult: "PASSED" });
    assert.equal(moved.status, 201, moved.text);
    const finished = await prisma.enrollment.findUnique({ where: { id: old.id } });
    assert.equal(finished.status, "COMPLETED");
    assert.equal(finished.examResult, "PASSED", "the result belongs to the month that ended");
    const fresh = await prisma.enrollment.findUnique({ where: { id: moved.data.enrollmentId } });
    assert.equal(fresh.status, "ACTIVE");
    assert.equal(fresh.examResult, null, "the new month starts clean");
    assert.equal(fresh.priceAmount, 100000);
    const p = (await profile(nt.session, nt.studentId, "teacher")).profile;
    assert.deepEqual(p.current.map((view) => view.course.id), [second.data.courseId], "only the new month is current");
    assert.ok(p.history.some((view) => view.id === old.id), "the old month is under previous courses");
    assert.ok(await prisma.managementAuditLog.findFirst({ where: { action: "enrollment.move_next", entityId: old.id } }));
    assert.equal((await next(nt.session, { courseId: second.data.courseId, startDate: today, priceAmount: 100000 })).status, 409, "already moved");
  });
});

describe("Lesson study room: upload → AI guide → review → publish → study, ask, test yourself", () => {
  const lessonId = l.lessonA1.id;
  const studyPath = "/learn/courses/course-a/lessons/a-1/study";
  const studentC = as(u.studentC);
  const step = (session, name) => post(`/api/teacher/study/${lessonId}/generate`, { session, json: { step: name } });
  const answer = (session, json) => post(`/api/learn/study/${lessonId}/answer`, { session, json: { language: "uz", ...json } });
  const ask = (session, json) => post(`/api/learn/study/${lessonId}/ask`, { session, json: { language: "uz", ...json } });
  const llmCalls = async () => (await storageLog()).filter((entry) => /^(ollama|anthropic|openai):/.test(entry.path)).length;
  let savedAccess = null;

  async function upload(session, filename, text) {
    const content = Buffer.from(text, "utf8");
    const signed = await post("/api/admin/storage/upload", { session, json: { filename, contentType: "text/plain", folder: "knowledge-documents", fileSize: content.length } });
    if (signed.status !== 200) return signed;
    const put = await fetch(signed.data.uploadUrl, { method: "PUT", body: content, headers: { "content-type": "text/plain" } });
    assert.equal(put.status, 200);
    return post(`/api/teacher/study/${lessonId}/materials`, { session, json: { storagePath: signed.data.path, filename, mimeType: "text/plain", fileSize: content.length } });
  }

  const cleanup = async () => {
    await prisma.studyAttempt.deleteMany({ where: { lessonId } });
    await prisma.studyAskCache.deleteMany({ where: { lessonId } });
    await prisma.studyAnnotation.deleteMany({ where: { lessonId } });
    await prisma.lessonStudyGuide.deleteMany({ where: { lessonId } });
    await prisma.lessonStudyMaterial.deleteMany({ where: { lessonId } });
  };

  test("setup: student A can open lesson A1 (enrolled, access on)", async () => {
    await cleanup();
    const enrollment = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId: u.studentA.id, courseId: c.courseA.id } } });
    assert.ok(enrollment, "fixture enrollment");
    savedAccess = { id: enrollment.id, status: enrollment.status, accessStatus: enrollment.accessStatus, accessExpiresAt: enrollment.accessExpiresAt, restrictWhenOverdue: enrollment.restrictWhenOverdue };
    await prisma.enrollment.update({ where: { id: enrollment.id }, data: { status: "ACTIVE", accessStatus: "ACTIVE", accessExpiresAt: null, restrictWhenOverdue: false } });
  });

  test("only the lesson's own teacher manages its materials and guide", async () => {
    assert.equal((await step(teacherB, "chapter")).status, 404, "another teacher");
    assert.equal((await step(studentA, "chapter")).status, 403, "a student");
    assert.equal((await step(anonymous, "chapter")).status, 401);
    assert.equal((await post(`/api/teacher/study/${lessonId}/publish`, { session: teacherB, json: { publish: true } })).status, 404);
    assert.equal((await call("PUT", `/api/teacher/study/${lessonId}/guide`, { session: studentA, json: { language: "uz", content: {} } })).status, 403);
    // Streaming pages answer 200 with the not-found content: what matters is that nothing of the lesson is shown.
    const otherTeacher = await get(`/teacher/study/${lessonId}`, { session: teacherB });
    assert.ok([200, 404].includes(otherTeacher.status));
    assert.doesNotMatch(otherTeacher.text, /Dars materiallari|AI bilan darslik yaratish/);
    assert.equal((await step(teacherA, "chapter")).status, 422, "nothing to write from yet");
    assert.equal((await step(teacherA, "invalid")).status, 400);
  });

  test("teacher uploads the lesson material; AI writes the guide in 3 steps (Uzbek, questions, English)", async () => {
    const added = await upload(teacherA, "lesson-3.txt", "Data preprocessing. SOURCE_MARK_PREPROCESSING. Missing values, normalization, one-hot encoding. ".repeat(5));
    assert.equal(added.status, 201, added.text);
    assert.equal((await upload(teacherB, "x.txt", "Another teacher's text about anything at all, long enough to be read.")).status, 404);

    assert.equal((await step(teacherA, "questions")).status, 409, "the text comes first");
    const chapter = await step(teacherA, "chapter");
    assert.equal(chapter.status, 200, chapter.text);
    const questions = await step(teacherA, "questions");
    assert.equal(questions.status, 200, questions.text);
    assert.deepEqual(questions.data.counts, { EASY: 5, MEDIUM: 5, ADVANCED: 5, CHECKPOINT: 6 });
    const english = await step(teacherA, "english");
    assert.equal(english.status, 200, english.text);

    const guide = await prisma.lessonStudyGuide.findUnique({ where: { lessonId } });
    assert.equal(guide.status, "DRAFT", "students don't see it before the teacher publishes");
    assert.match(JSON.stringify(guide.contentUz), /SOURCE_MARK_PREPROCESSING/, "written from the uploaded material");
    const uzQuestion = guide.contentUz.questions[1];
    const enQuestion = guide.contentEn.questions.find((question) => question.id === uzQuestion.id);
    assert.equal(enQuestion.correct, uzQuestion.correct, "the translation can't change the right answers");
    assert.ok(await prisma.managementAuditLog.findFirst({ where: { action: "study.generate_chapter", entityId: lessonId } }));
  });

  test("a draft: students can't open it; the teacher previews it", async () => {
    const page = await get(studyPath, { session: studentA });
    assert.equal(page.status, 200);
    assert.match(page.text, /hali darslik tayyor emas|no study guide yet/);
    assert.equal((await ask(studentA, { question: "Normalizatsiya nima?" })).status, 404);
    const preview = await get(studyPath, { session: teacherA });
    assert.equal(preview.status, 200);
    assert.match(preview.text, /Ko&#x27;rib chiqish rejimi|Ko'rib chiqish rejimi/);
  });

  test("published: every enrolled student studies the same guide; answers stay on the server", async () => {
    const published = await post(`/api/teacher/study/${lessonId}/publish`, { session: teacherA, json: { publish: true } });
    assert.equal(published.status, 200, published.text);
    const page = await get(studyPath, { session: studentA });
    assert.equal(page.status, 200);
    assert.match(page.text, /Yetishmayotgan qiymatlar/);
    assert.match(page.text, /Xulosa/);
    assert.match(page.text, /Izohlar/);
    assert.doesNotMatch(page.text, /Masofaga asoslangan modellar uchun|Because of Oson/, "model answers and explanations are not sent before answering");
    const english = await get(`${studyPath}?lang=en`, { session: studentA });
    assert.match(english.text, /EN Ma(&#x27;|')lumotlarni tayyorlash/);

    // Not enrolled → no guide.
    const outsider = await get(studyPath, { session: studentC });
    assert.doesNotMatch(outsider.text, /Yetishmayotgan qiymatlar/);
    assert.ok([403, 404].includes((await ask(studentC, { question: "Normalizatsiya nima?" })).status));
    assert.ok([403, 404].includes((await answer(studentC, { questionId: "q1", choice: 0 })).status));
  });

  test("test yourself: multiple choice is graded instantly; interview answers get a score and a follow-up", async () => {
    const guide = await prisma.lessonStudyGuide.findUnique({ where: { lessonId } });
    const easy = guide.contentUz.questions.find((question) => question.level === "EASY");
    const right = await answer(studentA, { questionId: easy.id, choice: easy.correct });
    assert.equal(right.status, 200, right.text);
    assert.equal(right.data.correct, true);
    const wrong = await answer(studentA, { questionId: easy.id, choice: (easy.correct + 1) % 4 });
    assert.equal(wrong.data.correct, false);
    assert.equal(wrong.data.correctIndex, easy.correct);
    assert.equal((await answer(studentA, { questionId: easy.id, choice: 9 })).status, 400);
    assert.equal((await answer(studentA, { questionId: "no-such-question", choice: 0 })).status, 404);

    const checkpoint = guide.contentUz.sections[0].checkpoint[0];
    assert.equal((await answer(studentA, { questionId: checkpoint.id, choice: checkpoint.correct })).data.correct, true);

    const advanced = guide.contentUz.questions.find((question) => question.level === "ADVANCED");
    const graded = await answer(studentA, { questionId: advanced.id, answer: "Masshtablash masofani to'g'ri hisoblash uchun kerak." });
    assert.equal(graded.status, 200, graded.text);
    assert.equal(graded.data.score, 65);
    assert.ok(graded.data.followUp, "an interview follow-up question");
    const follow = await answer(studentA, { questionId: advanced.id, answer: "Chunki katta qiymatli belgi masofani boshqaradi.", followUp: graded.data.followUp });
    assert.equal(follow.data.score, 80);
    assert.equal(follow.data.followUp, "", "only one follow-up");

    const attempts = await prisma.studyAttempt.count({ where: { lessonId, userId: u.studentA.id } });
    assert.ok(attempts >= 5);
    const results = await get(`/teacher/study/${lessonId}`, { session: teacherA });
    assert.match(results.text, new RegExp(u.studentA.name), "the teacher sees the student's results");
  });

  test("ask a question: smart search + AI; the same question again costs no tokens", async () => {
    const before = await llmCalls();
    const first = await ask(studentA, { question: "Normalizatsiya nima uchun kerak?" });
    assert.equal(first.status, 200, first.text);
    assert.equal(first.data.cached, false);
    assert.ok(first.data.answer);
    const sent = (await storageLog()).filter((entry) => /^(ollama|anthropic|openai):/.test(entry.path)).at(-1);
    assert.match(JSON.stringify(sent.messages), /Normalizatsiya/, "the matching passage was sent");
    assert.ok(JSON.stringify(sent.messages).length < 12_000, "only a few passages, not the whole lesson");
    const again = await ask(studentA, { question: "normalizatsiya nima uchun kerak" });
    assert.equal(again.data.cached, true);
    assert.equal(again.data.answer, first.data.answer);
    assert.equal(await llmCalls(), before + 1, "one AI call for two identical questions");
    const selected = await ask(studentA, { question: "Bu formulani tushuntiring", selection: "x' = (x - min)/(max - min)" });
    assert.equal(selected.status, 200);
    assert.equal(selected.data.cached, false, "questions about a selection are not cached");
    assert.equal((await ask(studentA, { question: "x" })).status, 400);
  });

  test("selection toolbar: highlights and notes are private to the student; Explain this concept is cached", async () => {
    const guide = await prisma.lessonStudyGuide.findUnique({ where: { lessonId } });
    const sectionId = guide.contentUz.sections[0].id;
    const annotate = (session, json) => post(`/api/learn/study/${lessonId}/annotations`, { session, json: { language: "uz", ...json } });
    const edit = (session, id, json) => call("PATCH", `/api/learn/study/${lessonId}/annotations/${id}`, { session, json });
    const remove = (session, id) => call("DELETE", `/api/learn/study/${lessonId}/annotations/${id}`, { session });

    const created = await annotate(studentA, { sectionId, quote: "Yetishmayotgan qiymatlarni", start: 0, color: "green" });
    assert.equal(created.status, 201, created.text);
    const id = created.data.annotation.id;
    assert.equal(created.data.annotation.color, "green");
    assert.equal((await annotate(studentA, { sectionId: "no-such-section", quote: "x y", start: 0 })).status, 400);
    assert.equal((await annotate(studentA, { sectionId, quote: "abc", start: -1 })).status, 400);
    assert.equal((await annotate(studentA, { sectionId, quote: "x".repeat(1001), start: 0 })).status, 400);
    assert.equal((await annotate(studentA, { sectionId, quote: "abc", start: 0, color: "purple" })).data.annotation.color, "yellow", "unknown colors fall back to yellow");
    assert.ok([403, 404].includes((await annotate(studentC, { sectionId, quote: "abc", start: 0 })).status), "not enrolled");

    // Only the owner can see, change or delete it (the teacher can open the guide but not the student's notes).
    assert.equal((await edit(teacherA, id, { note: "hijack" })).status, 404);
    assert.equal((await remove(teacherA, id)).status, 404);
    assert.doesNotMatch((await get(studyPath, { session: teacherA })).text, new RegExp(id));
    assert.match((await get(studyPath, { session: studentA })).text, new RegExp(id), "the student's page carries their highlights");

    const noted = await edit(studentA, id, { note: "Imtihonda kerak", color: "pink" });
    assert.equal(noted.status, 200, noted.text);
    assert.equal(noted.data.annotation.note, "Imtihonda kerak");
    assert.equal(noted.data.annotation.color, "pink");
    assert.equal((await edit(studentA, id, { note: "" })).data.annotation.note, null, "an empty note removes it");

    // Explain this concept: the same selected term is explained once, then served from the cache.
    const before = (await storageLog()).filter((entry) => /^(ollama|anthropic|openai):/.test(entry.path)).length;
    const first = await ask(studentA, { question: "Tushuntirib ber: Normalizatsiya", selection: "Normalizatsiya", mode: "explain" });
    assert.equal(first.status, 200, first.text);
    assert.equal(first.data.cached, false);
    const second = await ask(studentA, { question: "Tushuntirib ber: normalizatsiya", selection: "normalizatsiya", mode: "explain" });
    assert.equal(second.data.cached, true);
    const after = (await storageLog()).filter((entry) => /^(ollama|anthropic|openai):/.test(entry.path)).length;
    assert.equal(after, before + 1);

    assert.equal((await remove(studentA, id)).status, 200);
    assert.equal((await remove(studentA, id)).status, 404);
    await prisma.studyAnnotation.deleteMany({ where: { lessonId } });
  });

  test("editing puts the guide back to draft until it is published again", async () => {
    const guide = await prisma.lessonStudyGuide.findUnique({ where: { lessonId } });
    const edited = { ...guide.contentUz, title: "Tahrirlangan sarlavha" };
    const saved = await call("PUT", `/api/teacher/study/${lessonId}/guide`, { session: teacherA, json: { language: "uz", content: edited } });
    assert.equal(saved.status, 200, saved.text);
    assert.equal((await prisma.lessonStudyGuide.findUnique({ where: { lessonId } })).status, "DRAFT");
    assert.equal((await ask(studentA, { question: "Normalizatsiya nima?" })).status, 404);
    await post(`/api/teacher/study/${lessonId}/publish`, { session: teacherA, json: { publish: true } });
    assert.match((await get(studyPath, { session: studentA })).text, /Tahrirlangan sarlavha/);
    assert.equal(await prisma.studyAskCache.count({ where: { lessonId } }), 0, "old cached answers are cleared on publish");
  });

  test("cleanup", async () => {
    await cleanup();
    if (savedAccess) {
      const { id, ...data } = savedAccess;
      await prisma.enrollment.update({ where: { id }, data });
    }
  });
});
