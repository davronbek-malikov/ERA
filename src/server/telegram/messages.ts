import { prisma } from "@/lib/prisma";
import { retryOnDatabaseFailure } from "@/lib/server-data";
import { invalid, requireId, requireString } from "@/lib/validation";
import { authErrors } from "@/server/authz";
import type { ManagementActor } from "@/server/management/actor";
import { writeAudit } from "@/server/management/audit";
import { conflict } from "@/server/management/enrollments";
import { computeHomeworkPace } from "@/server/management/homework-rule";
import { fromDbDate, nextWeekly, platformDateTimeToUtc, requireDateString, requireTimeString, todayInPlatform, utcToPlatform } from "@/server/management/time";
import { sendTelegramMessage, telegramConfig, telegramInviteUrl } from "@/server/telegram/bot";

/*
 * Telegram messages from a teacher to their students (Teacher Workspace → ERA Assistant → Messages).
 *
 * The teacher chooses:
 *   WHO   ALL (every student with an active course), BEHIND (behind the weekly homework rule at send time),
 *         or SELECTED (students they tick; checked against their own students when saved AND when sent);
 *   WHAT  the text ({name} becomes the student's name);
 *   WHEN  now, once at an exact local date/time, or every week on a weekday at a local time.
 *
 * Scheduled messages are sent by /api/cron/telegram (an external scheduler calls it every few minutes).
 * Each run claims the message atomically (nextRunAt compare-and-set) and every delivery is a unique row per
 * (message, student, run), so overlapping scheduler calls never message a student twice.
 */

export const DEFAULT_HOMEWORK_TEXT =
  "Assalomu alaykum, {name}! Kelishganimizdek, siz bir haftada eng kamida 3 ta vazifa topshirishingiz kerak edi, lekin vazifalarni to'liq bajarmadingiz. Eng avvalo tartib o'zingiz uchun kerak, shuning uchun yangi haftada o'tgan haftadagi kamchiliklarni to'ldirib qo'ying.";

export const AUDIENCES = ["ALL", "BEHIND", "SELECTED"] as const;
export type Audience = (typeof AUDIENCES)[number];
type When = "NOW" | "ONCE" | "WEEKLY";

const MAX_TEXT = 2000;
const MAX_SELECTED = 500;
const RUN_BATCH = 50;

export type MessageInput = {
  text: string;
  audience: Audience;
  studentIds: string[];
  when: When;
  sendAt: Date | null;
  weekday: number | null;
  timeOfDay: string | null;
};

type Raw = Record<string, unknown>;

export function parseMessageInput(raw: Raw, now: Date = new Date()): MessageInput {
  const text = requireString(raw.text, "Message", { min: 1, max: MAX_TEXT }).trim();
  if (!text) throw invalid("invalid-Message", "Write the message.");
  const audience = AUDIENCES.find((value) => value === raw.audience);
  if (!audience) throw invalid("invalid-audience", "Choose who gets the message.");
  let studentIds: string[] = [];
  if (audience === "SELECTED") {
    if (!Array.isArray(raw.studentIds) || raw.studentIds.length === 0) throw invalid("invalid-students", "Choose at least one student.");
    if (raw.studentIds.length > MAX_SELECTED) throw invalid("invalid-students", "Too many students.");
    studentIds = [...new Set(raw.studentIds.map((id) => requireId(id, "studentId")))];
  }
  const when = (["NOW", "ONCE", "WEEKLY"] as const).find((value) => value === raw.when);
  if (!when) throw invalid("invalid-when", "Choose when to send.");

  if (when === "ONCE") {
    const sendAt = platformDateTimeToUtc(requireDateString(raw.date, "date"), requireTimeString(raw.time, "time"));
    if (sendAt.getTime() < now.getTime() - 60_000) throw invalid("time-passed", "That time has already passed. Choose a later time.");
    return { text, audience, studentIds, when, sendAt, weekday: null, timeOfDay: null };
  }
  if (when === "WEEKLY") {
    const weekday = Number(raw.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw invalid("invalid-weekday", "Choose a day of the week.");
    return { text, audience, studentIds, when, sendAt: null, weekday, timeOfDay: requireTimeString(raw.time, "time") };
  }
  return { text, audience, studentIds, when, sendAt: now, weekday: null, timeOfDay: null };
}

export function renderText(template: string, studentName: string) {
  return template.replaceAll("{name}", studentName);
}

function requireInstructor(actor: ManagementActor) {
  if (!actor.instructorId) throw authErrors.forbidden("Only teachers can send messages to students.");
  return actor.instructorId;
}

// ------------------------------------------------------------------------------------------------
// The teacher's students (scope)
// ------------------------------------------------------------------------------------------------

type ScopedStudent = {
  id: string;
  name: string;
  telegram: string | null;
  chatId: string | null;
  behind: { course: string; week: number; count: number; required: number } | null;
};

/** Students with an ACTIVE course of this teacher, with their Telegram chat and weekly-rule state. */
async function scopedStudents(instructorId: string, today = todayInPlatform()): Promise<ScopedStudent[]> {
  const enrollments = await retryOnDatabaseFailure(() =>
    prisma.enrollment.findMany({
      where: { instructorId, status: "ACTIVE" },
      orderBy: [{ user: { name: "asc" } }],
      select: {
        status: true,
        startDate: true,
        endDate: true,
        user: { select: { id: true, name: true, telegram: true, telegramChatId: true } },
        course: { select: { title: true, _count: { select: { lessons: true } } } },
        instructor: { select: { homeworkRuleEnabled: true, homeworkPerWeek: true } },
        homeworkReviews: { select: { status: true, submittedAt: true } }
      }
    })
  );
  const students = new Map<string, ScopedStudent>();
  for (const enrollment of enrollments) {
    const pace = computeHomeworkPace({
      startDate: fromDbDate(enrollment.startDate),
      endDate: fromDbDate(enrollment.endDate),
      status: enrollment.status,
      today,
      ruleEnabled: enrollment.instructor?.homeworkRuleEnabled ?? true,
      perWeek: enrollment.instructor?.homeworkPerWeek ?? 3,
      totalLessons: enrollment.course._count.lessons,
      doneLessons: enrollment.homeworkReviews.filter((review) => review.status === "DONE").length,
      submittedAt: enrollment.homeworkReviews.map((review) => review.submittedAt)
    });
    const existing = students.get(enrollment.user.id);
    const behind =
      pace.state === "behind" && pace.lastWeek
        ? { course: enrollment.course.title, week: pace.lastWeek.number, count: pace.lastWeek.count, required: pace.lastWeek.required }
        : null;
    if (existing) {
      existing.behind ??= behind;
    } else {
      students.set(enrollment.user.id, {
        id: enrollment.user.id,
        name: enrollment.user.name,
        telegram: enrollment.user.telegram,
        chatId: enrollment.user.telegramChatId,
        behind
      });
    }
  }
  return [...students.values()];
}

function recipientsFor(audience: string, selected: string[], students: ScopedStudent[]) {
  if (audience === "ALL") return students;
  if (audience === "BEHIND") return students.filter((student) => student.behind);
  const wanted = new Set(selected);
  return students.filter((student) => wanted.has(student.id));
}

// ------------------------------------------------------------------------------------------------
// Sending
// ------------------------------------------------------------------------------------------------

export type DeliverySummary = { recipients: number; sent: number; failed: number; notConnected: number; skipped: number };

async function claimDelivery(messageId: string, studentId: string, runKey: string): Promise<string | null> {
  try {
    const created = await prisma.telegramDelivery.create({ data: { messageId, studentId, runKey, status: "SENDING" }, select: { id: true } });
    return created.id;
  } catch {
    // Already exists for this run: only a FAILED one (or a stuck SENDING from a crashed run) is retried.
    const stale = new Date(Date.now() - 10 * 60_000);
    const row = await prisma.telegramDelivery.findUnique({ where: { messageId_studentId_runKey: { messageId, studentId, runKey } }, select: { id: true } });
    if (!row) return null;
    const taken = await prisma.telegramDelivery.updateMany({
      where: { id: row.id, OR: [{ status: "FAILED" }, { status: "NOT_CONNECTED" }, { status: "SENDING", updatedAt: { lt: stale } }] },
      data: { status: "SENDING", error: null }
    });
    return taken.count === 1 ? row.id : null;
  }
}

async function deliver(message: { id: string; instructorId: string; text: string; audience: string; studentIds: string[] }, runKey: string): Promise<DeliverySummary> {
  const students = await scopedStudents(message.instructorId);
  const recipients = recipientsFor(message.audience, message.studentIds, students);
  const summary: DeliverySummary = { recipients: recipients.length, sent: 0, failed: 0, notConnected: 0, skipped: 0 };

  for (const student of recipients) {
    const deliveryId = await claimDelivery(message.id, student.id, runKey);
    if (!deliveryId) {
      summary.skipped += 1;
      continue;
    }
    if (!student.chatId) {
      await prisma.telegramDelivery.update({ where: { id: deliveryId }, data: { status: "NOT_CONNECTED", error: "The student hasn't pressed Start on the bot yet." } });
      summary.notConnected += 1;
      continue;
    }
    const result = await sendTelegramMessage(student.chatId, renderText(message.text, student.name));
    await prisma.telegramDelivery.update({
      where: { id: deliveryId },
      data: result.ok ? { status: "SENT", sentAt: new Date(), error: null } : { status: "FAILED", error: result.error }
    });
    if (result.ok) summary.sent += 1;
    else {
      summary.failed += 1;
      // Blocked the bot / deleted the chat: forget it so the teacher sees "not connected" and can re-invite.
      if (result.blocked) await prisma.user.update({ where: { id: student.id }, data: { telegramChatId: null, telegramLinkedAt: null } });
    }
  }
  return summary;
}

async function auditRun(actorId: string | null, messageId: string, summary: DeliverySummary, trigger: string) {
  await prisma.$transaction((tx) =>
    writeAudit(tx, { actorId, action: "telegram.send", entityType: "message", entityId: messageId, after: { ...summary, trigger }, source: actorId ? "MANUAL" : "SYSTEM" })
  );
}

// ------------------------------------------------------------------------------------------------
// Teacher actions
// ------------------------------------------------------------------------------------------------

export async function createMessage(actor: ManagementActor, input: MessageInput) {
  const instructorId = requireInstructor(actor);
  if (input.when === "NOW" && !telegramConfig().configured) throw conflict("telegram-not-configured", "The Telegram bot is not connected yet.");
  if (input.audience === "SELECTED") {
    const mine = new Set((await scopedStudents(instructorId)).map((student) => student.id));
    if (input.studentIds.some((id) => !mine.has(id))) throw authErrors.notFound("Student not found among your students.");
  }

  const now = new Date();
  const nextRunAt = input.when === "WEEKLY" ? nextWeekly(input.weekday!, input.timeOfDay!, now) : input.when === "ONCE" ? input.sendAt : null;
  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.telegramMessage.create({
      data: {
        instructorId,
        createdById: actor.user.id,
        text: input.text,
        audience: input.audience,
        studentIds: input.studentIds,
        schedule: input.when === "WEEKLY" ? "WEEKLY" : "ONCE",
        sendAt: input.when === "WEEKLY" ? null : input.sendAt,
        weekday: input.weekday,
        timeOfDay: input.timeOfDay,
        nextRunAt,
        active: input.when !== "NOW",
        lastRunAt: input.when === "NOW" ? now : null
      }
    });
    await writeAudit(tx, {
      actorId: actor.user.id,
      action: "telegram.message.create",
      entityType: "message",
      entityId: created.id,
      after: { audience: created.audience, students: created.studentIds.length, schedule: input.when, nextRunAt: created.nextRunAt },
      source: "MANUAL"
    });
    return created;
  });

  if (input.when !== "NOW") return { messageId: message.id, nextRunAt: message.nextRunAt?.toISOString() ?? null, summary: null };
  const summary = await deliver(message, "once");
  await auditRun(actor.user.id, message.id, summary, "NOW");
  return { messageId: message.id, nextRunAt: null, summary };
}

async function ownMessage(actor: ManagementActor, messageId: string) {
  const instructorId = requireInstructor(actor);
  const message = await prisma.telegramMessage.findFirst({ where: { id: requireId(messageId, "messageId"), instructorId } });
  if (!message) throw authErrors.notFound("Message not found.");
  return message;
}

/** Pause or resume a scheduled message. A resumed weekly message continues from its next future day. */
export async function setMessageActive(actor: ManagementActor, messageId: string, active: boolean) {
  const message = await ownMessage(actor, messageId);
  const now = new Date();
  let nextRunAt = message.nextRunAt;
  if (active) {
    if (message.schedule === "WEEKLY") nextRunAt = nextWeekly(message.weekday ?? 6, message.timeOfDay ?? "10:00", now);
    else if (!message.sendAt || message.sendAt.getTime() < now.getTime() || message.lastRunAt) throw conflict("message-done", "This message was already sent or its time has passed.");
    else nextRunAt = message.sendAt;
  }
  await prisma.$transaction(async (tx) => {
    await tx.telegramMessage.update({ where: { id: message.id }, data: { active, nextRunAt } });
    await writeAudit(tx, { actorId: actor.user.id, action: active ? "telegram.message.resume" : "telegram.message.pause", entityType: "message", entityId: message.id, source: "MANUAL" });
  });
  return { active, nextRunAt: nextRunAt?.toISOString() ?? null };
}

export async function deleteMessage(actor: ManagementActor, messageId: string) {
  const message = await ownMessage(actor, messageId);
  await prisma.$transaction(async (tx) => {
    await tx.telegramMessage.delete({ where: { id: message.id } });
    await writeAudit(tx, { actorId: actor.user.id, action: "telegram.message.delete", entityType: "message", entityId: message.id, before: { text: message.text, audience: message.audience, schedule: message.schedule }, source: "MANUAL" });
  });
  return { deleted: true };
}

// ------------------------------------------------------------------------------------------------
// Scheduler
// ------------------------------------------------------------------------------------------------

/** Sends every scheduled message whose time has come. Called by /api/cron/telegram every few minutes. */
export async function runDueMessages(now: Date = new Date()) {
  if (!telegramConfig().configured) return { reason: "bot-not-configured" as const, processed: 0 };
  const due = await prisma.telegramMessage.findMany({
    where: { active: true, nextRunAt: { lte: now } },
    orderBy: { nextRunAt: "asc" },
    take: RUN_BATCH
  });
  let processed = 0;
  const totals: DeliverySummary = { recipients: 0, sent: 0, failed: 0, notConnected: 0, skipped: 0 };
  for (const message of due) {
    const scheduledFor = message.nextRunAt!;
    const weekly = message.schedule === "WEEKLY";
    // Compare-and-set on nextRunAt: if another run already took this message, count is 0 and we skip it.
    const claimed = await prisma.telegramMessage.updateMany({
      where: { id: message.id, active: true, nextRunAt: scheduledFor },
      data: weekly
        ? { nextRunAt: nextWeekly(message.weekday ?? 6, message.timeOfDay ?? "10:00", now), lastRunAt: now }
        : { nextRunAt: null, active: false, lastRunAt: now }
    });
    if (claimed.count === 0) continue;
    const summary = await deliver(message, weekly ? utcToPlatform(scheduledFor).date : "once");
    await auditRun(null, message.id, summary, weekly ? "WEEKLY" : "ONCE");
    processed += 1;
    for (const key of Object.keys(totals) as (keyof DeliverySummary)[]) totals[key] += summary[key];
  }
  return { reason: null, processed, ...totals };
}

// ------------------------------------------------------------------------------------------------
// Page data
// ------------------------------------------------------------------------------------------------

export async function getMessagesOverview(actor: ManagementActor) {
  const bot = telegramConfig();
  const setup = {
    botConfigured: bot.configured,
    webhookConfigured: Boolean(bot.webhookSecret),
    cronConfigured: Boolean(process.env.CRON_SECRET?.trim())
  };
  if (!actor.instructorId) return { setup, editable: false, ruleEnabled: true, perWeek: 3, students: [], plans: [], history: [] };
  const instructorId = actor.instructorId;
  const [instructor, students, plans, history] = await Promise.all([
    retryOnDatabaseFailure(() => prisma.instructor.findUnique({ where: { id: instructorId }, select: { homeworkRuleEnabled: true, homeworkPerWeek: true } })),
    scopedStudents(instructorId),
    retryOnDatabaseFailure(() =>
      prisma.telegramMessage.findMany({
        where: { instructorId, OR: [{ active: true }, { schedule: "WEEKLY" }, { createdAt: { gte: new Date(Date.now() - 14 * 86_400_000) } }] },
        orderBy: [{ active: "desc" }, { createdAt: "desc" }],
        take: 30,
        include: { _count: { select: { deliveries: { where: { status: "SENT" } } } } }
      })
    ),
    retryOnDatabaseFailure(() =>
      prisma.telegramDelivery.findMany({
        where: { message: { instructorId } },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { id: true, status: true, error: true, sentAt: true, createdAt: true, student: { select: { id: true, name: true } }, message: { select: { text: true } } }
      })
    )
  ]);
  const names = new Map(students.map((student) => [student.id, student.name]));

  return {
    setup,
    editable: Boolean(instructor),
    ruleEnabled: instructor?.homeworkRuleEnabled ?? true,
    perWeek: instructor?.homeworkPerWeek ?? 3,
    students: students.map((student) => ({
      id: student.id,
      name: student.name,
      telegram: student.telegram,
      linked: Boolean(student.chatId),
      inviteUrl: student.chatId ? null : telegramInviteUrl(student.id),
      behind: student.behind
    })),
    plans: plans.map((plan) => ({
      id: plan.id,
      text: plan.text,
      audience: plan.audience as Audience,
      selectedNames: plan.studentIds.map((id) => names.get(id)).filter((name): name is string => Boolean(name)),
      schedule: plan.schedule as "ONCE" | "WEEKLY",
      weekday: plan.weekday,
      timeOfDay: plan.timeOfDay,
      sendAt: plan.sendAt ? utcToPlatform(plan.sendAt) : null,
      nextRunAt: plan.nextRunAt ? utcToPlatform(plan.nextRunAt) : null,
      lastRunAt: plan.lastRunAt ? utcToPlatform(plan.lastRunAt) : null,
      active: plan.active,
      sentCount: plan._count.deliveries
    })),
    history: history.map((row) => ({
      id: row.id,
      status: row.status,
      error: row.error,
      at: utcToPlatform(row.sentAt ?? row.createdAt),
      student: row.student,
      preview: row.message.text.slice(0, 80)
    }))
  };
}
