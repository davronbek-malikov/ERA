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

import { anonymous, as, call, fx, get, post, storageLog } from "./helpers.mjs";

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
});
