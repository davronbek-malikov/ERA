import { prisma } from "@/lib/prisma";
import { retryOnDatabaseFailure } from "@/lib/server-data";
import { invalid, requireId, requireString } from "@/lib/validation";
import { authErrors } from "@/server/authz";
import type { ManagementActor } from "@/server/management/actor";
import { writeAudit } from "@/server/management/audit";
import { conflict } from "@/server/management/enrollments";
import { computeHomeworkPace } from "@/server/management/homework-rule";
import { fromDbDate, nextWeekly, platformDateTimeToUtc, requireDateString, requireTimeString, todayInPlatform, utcToPlatform } from "@/server/management/time";
import { sendFromAccount } from "@/server/telegram/account-client";
import { sendTelegramMessage, telegramConfig, telegramInviteUrl } from "@/server/telegram/bot";
import { planSendTimes, shuffle, windowIsValid, type Pacing } from "@/server/telegram/pacing";
import { decryptSession } from "@/server/telegram/session-crypto";

/*
 * Telegram messages from a teacher to their students (Teacher Workspace → ERA Assistant → Messages).
 *
 * The teacher chooses:
 *   WHO   ALL (every student with an active course), BEHIND (behind the weekly homework rule at send time),
 *         or SELECTED (students they tick; checked against their own students when saved AND when sent);
 *   WHAT  the text ({name} becomes the student's name);
 *   WHEN  now, once on a date, or every week on a weekday;
 *   PACE  FAST (one after another, random 45–110 s gaps) or SPREAD (random times inside e.g. 08:00–17:00).
 *
 * HOW it is sent (per student, at their own random time):
 *   1. from the teacher's own Telegram number when they connected it (account.ts), to the student's @username
 *      or phone (phone only if the student is in the teacher's contacts);
 *   2. otherwise, or when that fails, through the ERA bot if the student pressed Start on it (signed with the
 *      teacher's name);
 *   3. otherwise NOT_CONNECTED.
 * Telegram asking to slow down (FLOOD_WAIT up to 1 hour) pauses the teacher's account and the rest waits;
 * a longer limit (PEER_FLOOD) switches to the bot until it ends.
 *
 * A run (one sending of a message) puts one QUEUED delivery per student with its random time; the scheduler
 * (/api/cron/telegram, every minute) starts due runs and sends the deliveries whose time has come, at most one
 * per teacher account per minute. Runs and deliveries are claimed atomically, so overlapping scheduler calls
 * never message a student twice.
 */

export const DEFAULT_HOMEWORK_TEXT =
  "Assalomu alaykum, {name}! Kelishganimizdek, siz bir haftada eng kamida 3 ta vazifa topshirishingiz kerak edi, lekin vazifalarni to'liq bajarmadingiz. Eng avvalo tartib o'zingiz uchun kerak, shuning uchun yangi haftada o'tgan haftadagi kamchiliklarni to'ldirib qo'ying.";

export const AUDIENCES = ["ALL", "BEHIND", "SELECTED"] as const;
export type Audience = (typeof AUDIENCES)[number];
type When = "NOW" | "ONCE" | "WEEKLY";

const MAX_TEXT = 2000;
const MAX_SELECTED = 500;
const RUN_BATCH = 50;
/** Deliveries looked at per scheduler call. */
const DISPATCH_BATCH = 60;
/** At most one message from a teacher's own number per this interval, whatever the plan says. */
const ACCOUNT_MIN_INTERVAL_MS = 40_000;
/** FLOOD_WAIT up to this long: wait. Longer, or PEER_FLOOD: use the bot until the limit ends. */
const MAX_WAIT_MS = 60 * 60_000;
const PEER_FLOOD_PAUSE_MS = 24 * 60 * 60_000;

export type MessageInput = {
  text: string;
  audience: Audience;
  studentIds: string[];
  when: When;
  sendAt: Date | null;
  weekday: number | null;
  timeOfDay: string | null;
  pacing: Pacing;
  windowStart: string;
  windowEnd: string;
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

  const pacing: Pacing = raw.pacing === "SPREAD" ? "SPREAD" : "FAST";
  const windowStart = pacing === "SPREAD" ? requireTimeString(raw.windowStart, "windowStart") : "08:00";
  const windowEnd = pacing === "SPREAD" ? requireTimeString(raw.windowEnd, "windowEnd") : "17:00";
  if (pacing === "SPREAD" && !windowIsValid(windowStart, windowEnd)) throw invalid("invalid-window", "The sending window must end after it starts.");
  const base = { text, audience, studentIds, when, pacing, windowStart, windowEnd };

  if (when === "ONCE") {
    const date = requireDateString(raw.date, "date");
    if (pacing === "SPREAD") {
      // Spread over that day's window; today after the window opened → start now.
      if (date < todayInPlatform(now)) throw invalid("time-passed", "That day has already passed. Choose a later day.");
      const opens = platformDateTimeToUtc(date, windowStart);
      return { ...base, sendAt: opens.getTime() < now.getTime() ? now : opens, weekday: null, timeOfDay: null };
    }
    const sendAt = platformDateTimeToUtc(date, requireTimeString(raw.time, "time"));
    if (sendAt.getTime() < now.getTime() - 60_000) throw invalid("time-passed", "That time has already passed. Choose a later time.");
    return { ...base, sendAt, weekday: null, timeOfDay: null };
  }
  if (when === "WEEKLY") {
    const weekday = Number(raw.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw invalid("invalid-weekday", "Choose a day of the week.");
    return { ...base, sendAt: null, weekday, timeOfDay: pacing === "SPREAD" ? windowStart : requireTimeString(raw.time, "time") };
  }
  return { ...base, sendAt: now, weekday: null, timeOfDay: null };
}

export function renderText(template: string, studentName: string) {
  return template.replaceAll("{name}", studentName);
}

function requireInstructor(actor: ManagementActor) {
  if (!actor.instructorId) throw authErrors.forbidden("Only teachers can send messages to students.");
  return actor.instructorId;
}

/** "@username" or a phone number, as saved on the student (teaching.ts parseTelegram). */
export function telegramTarget(value: string | null | undefined): { username: string | null; phone: string | null } {
  const text = value?.trim() ?? "";
  if (/^@[A-Za-z][A-Za-z0-9_]{3,31}$/.test(text)) return { username: text, phone: null };
  const digits = text.replace(/[^\d+]/g, "");
  if (/^\+?\d{8,15}$/.test(digits)) return { username: null, phone: digits.startsWith("+") ? digits : `+${digits}` };
  return { username: null, phone: null };
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

/** Students with an ACTIVE course of this teacher, with their Telegram contact and weekly-rule state. */
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
// Teacher accounts (own number)
// ------------------------------------------------------------------------------------------------

type AccountState = { mode: "send"; session: string; lastSentAt: Date | null } | { mode: "wait"; until: Date } | { mode: "bot" };

async function accountState(instructorId: string, now: Date): Promise<AccountState> {
  const account = await prisma.telegramAccount.findUnique({ where: { instructorId } });
  if (!account || account.status !== "CONNECTED") return { mode: "bot" };
  const session = decryptSession(account.sessionEnc);
  if (!session) return { mode: "bot" };
  if (account.limitedUntil && account.limitedUntil.getTime() > now.getTime()) {
    return account.limitedUntil.getTime() - now.getTime() <= MAX_WAIT_MS ? { mode: "wait", until: account.limitedUntil } : { mode: "bot" };
  }
  return { mode: "send", session, lastSentAt: account.lastSentAt };
}

async function hasConnectedAccount(instructorId: string) {
  const account = await prisma.telegramAccount.findUnique({ where: { instructorId }, select: { status: true } });
  return account?.status === "CONNECTED";
}

// ------------------------------------------------------------------------------------------------
// Runs: who gets it and at what (random) time
// ------------------------------------------------------------------------------------------------

export type DeliverySummary = { recipients: number; queued: number; sent: number; failed: number; notConnected: number; skipped: number };
const emptySummary = (): DeliverySummary => ({ recipients: 0, queued: 0, sent: 0, failed: 0, notConnected: 0, skipped: 0 });

type RunMessage = { id: string; instructorId: string; audience: string; studentIds: string[]; pacing: string; windowStart: string; windowEnd: string };

/** Queues one delivery per recipient with its own random time. Returns the first and last planned times. */
async function startRun(message: RunMessage, runKey: string, now: Date) {
  const [students, accountConnected] = await Promise.all([scopedStudents(message.instructorId), hasConnectedAccount(message.instructorId)]);
  const recipients = shuffle(recipientsFor(message.audience, message.studentIds, students));
  const times = planSendTimes({
    count: recipients.length,
    pacing: message.pacing === "SPREAD" ? "SPREAD" : "FAST",
    now,
    windowStart: message.windowStart,
    windowEnd: message.windowEnd,
    accountConnected
  });
  const rows = recipients.map((student, index) => {
    const reachable = Boolean(student.chatId) || (accountConnected && Boolean(telegramTarget(student.telegram).username || telegramTarget(student.telegram).phone));
    return reachable
      ? { messageId: message.id, studentId: student.id, runKey, status: "QUEUED", scheduledFor: times[index] }
      : { messageId: message.id, studentId: student.id, runKey, status: "NOT_CONNECTED", scheduledFor: times[index], error: "No Telegram connection: the student has no saved Telegram and hasn't pressed Start on the bot." };
  });
  // Unique (message, student, run): a second scheduler call for the same run adds nothing.
  const created = await prisma.telegramDelivery.createMany({ data: rows, skipDuplicates: true });
  return { recipients: recipients.length, created: created.count, firstAt: times[0] ?? null, lastAt: times.at(-1) ?? null };
}

// ------------------------------------------------------------------------------------------------
// Dispatch: send the deliveries whose time has come
// ------------------------------------------------------------------------------------------------

/** Sends due deliveries (optionally only one teacher's). Never two messages from one teacher's number in a row. */
async function dispatchDue(now: Date, options: { instructorId?: string } = {}): Promise<DeliverySummary> {
  const summary = emptySummary();
  const due = await prisma.telegramDelivery.findMany({
    where: { status: "QUEUED", scheduledFor: { lte: now }, ...(options.instructorId ? { message: { instructorId: options.instructorId } } : {}) },
    orderBy: { scheduledFor: "asc" },
    take: DISPATCH_BATCH,
    select: {
      id: true,
      scheduledFor: true,
      student: { select: { id: true, name: true, telegram: true, telegramChatId: true } },
      message: { select: { id: true, text: true, instructorId: true, instructor: { select: { name: true } } } }
    }
  });

  const byTeacher = new Map<string, typeof due>();
  for (const delivery of due) byTeacher.set(delivery.message.instructorId, [...(byTeacher.get(delivery.message.instructorId) ?? []), delivery]);

  for (const [instructorId, deliveries] of byTeacher) {
    let account = await accountState(instructorId, now);
    let usedAccountThisCall = false;
    const inScope = new Set((await scopedStudents(instructorId)).map((student) => student.id));

    for (const delivery of deliveries) {
      const target = telegramTarget(delivery.student.telegram);
      const canUseAccount = account.mode === "send" && Boolean(target.username || target.phone);

      // Pace the teacher's own number: one per call and at least ACCOUNT_MIN_INTERVAL_MS apart.
      if (canUseAccount && account.mode === "send") {
        const tooSoon = usedAccountThisCall || (account.lastSentAt && now.getTime() - account.lastSentAt.getTime() < ACCOUNT_MIN_INTERVAL_MS);
        if (tooSoon) continue; // stays QUEUED for the next call
      }
      if (account.mode === "wait" && (target.username || target.phone)) {
        // Telegram asked us to slow down for a while: keep it queued until then (with a little randomness).
        await prisma.telegramDelivery.updateMany({ where: { id: delivery.id, status: "QUEUED" }, data: { scheduledFor: new Date(account.until.getTime() + Math.random() * 120_000) } });
        continue;
      }

      const claimed = await prisma.telegramDelivery.updateMany({ where: { id: delivery.id, status: "QUEUED" }, data: { status: "SENDING" } });
      if (claimed.count === 0) {
        summary.skipped += 1;
        continue;
      }
      if (!inScope.has(delivery.student.id)) {
        await prisma.telegramDelivery.update({ where: { id: delivery.id }, data: { status: "FAILED", error: "No longer this teacher's active student." } });
        summary.failed += 1;
        continue;
      }

      const text = renderText(delivery.message.text, delivery.student.name);
      let outcome: { status: "SENT"; via: "ACCOUNT" | "BOT" } | { status: "FAILED" | "NOT_CONNECTED"; error: string } | null = null;

      if (canUseAccount && account.mode === "send") {
        const result = await sendFromAccount(account.session, target, text);
        usedAccountThisCall = true;
        if (result.ok) {
          outcome = { status: "SENT", via: "ACCOUNT" };
          await prisma.telegramAccount.update({ where: { instructorId }, data: { lastSentAt: new Date(), lastError: null } });
          account = { ...account, lastSentAt: new Date() };
        } else if (result.kind === "flood" && result.seconds * 1000 <= MAX_WAIT_MS) {
          const until = new Date(now.getTime() + result.seconds * 1000);
          await prisma.telegramAccount.update({ where: { instructorId }, data: { limitedUntil: until, lastError: `FLOOD_WAIT ${result.seconds}s` } });
          await prisma.telegramDelivery.update({ where: { id: delivery.id }, data: { status: "QUEUED", scheduledFor: new Date(until.getTime() + Math.random() * 120_000) } });
          account = { mode: "wait", until };
          continue;
        } else if (result.kind === "flood" || result.kind === "limited") {
          const until = new Date(now.getTime() + (result.kind === "flood" ? result.seconds * 1000 : PEER_FLOOD_PAUSE_MS));
          await prisma.telegramAccount.update({ where: { instructorId }, data: { limitedUntil: until, lastError: result.kind === "flood" ? `FLOOD_WAIT ${result.seconds}s` : "PEER_FLOOD" } });
          account = { mode: "bot" };
        } else if (result.kind === "revoked") {
          // The teacher ended ERA's session in Telegram (Settings → Devices): back to the bot.
          await prisma.telegramAccount.update({ where: { instructorId }, data: { status: "DISCONNECTED", sessionEnc: null, lastError: "Session ended in Telegram" } });
          account = { mode: "bot" };
        } else {
          outcome = { status: "FAILED", error: result.reason };
        }
      }

      // Fallback (or no own number): the ERA bot, signed with the teacher's name.
      if (!outcome || outcome.status !== "SENT") {
        const chatId = delivery.student.telegramChatId;
        if (chatId && telegramConfig().configured) {
          const signature = delivery.message.instructor?.name ? `\n\n— ${delivery.message.instructor.name}, ERA Academy` : "";
          const result = await sendTelegramMessage(chatId, `${text}${signature}`);
          if (result.ok) outcome = { status: "SENT", via: "BOT" };
          else {
            outcome = { status: "FAILED", error: result.error };
            if (result.blocked) await prisma.user.update({ where: { id: delivery.student.id }, data: { telegramChatId: null, telegramLinkedAt: null } });
          }
        } else if (!outcome) {
          outcome = { status: "NOT_CONNECTED", error: "The student hasn't pressed Start on the bot, and no own number could reach them." };
        }
      }

      await prisma.telegramDelivery.update({
        where: { id: delivery.id },
        data: outcome.status === "SENT" ? { status: "SENT", via: outcome.via, sentAt: new Date(), error: null } : { status: outcome.status, error: outcome.error }
      });
      if (outcome.status === "SENT") summary.sent += 1;
      else if (outcome.status === "NOT_CONNECTED") summary.notConnected += 1;
      else summary.failed += 1;
    }
  }
  return summary;
}

async function auditRun(actorId: string | null, messageId: string, summary: object, trigger: string) {
  await prisma.$transaction((tx) =>
    writeAudit(tx, { actorId, action: "telegram.send", entityType: "message", entityId: messageId, after: { ...summary, trigger }, source: actorId ? "MANUAL" : "SYSTEM" })
  );
}

// ------------------------------------------------------------------------------------------------
// Teacher actions
// ------------------------------------------------------------------------------------------------

export async function createMessage(actor: ManagementActor, input: MessageInput) {
  const instructorId = requireInstructor(actor);
  if (input.when === "NOW" && !telegramConfig().configured && !(await hasConnectedAccount(instructorId))) {
    throw conflict("telegram-not-configured", "The Telegram bot is not connected yet.");
  }
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
        pacing: input.pacing,
        windowStart: input.windowStart,
        windowEnd: input.windowEnd,
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
      after: { audience: created.audience, students: created.studentIds.length, schedule: input.when, pacing: input.pacing, nextRunAt: created.nextRunAt },
      source: "MANUAL"
    });
    return created;
  });

  if (input.when !== "NOW") return { messageId: message.id, nextRunAt: message.nextRunAt?.toISOString() ?? null, summary: null };
  const run = await startRun(message, "once", now);
  const sent = await dispatchDue(new Date(), { instructorId });
  const [queued, notConnected] = await Promise.all([
    prisma.telegramDelivery.count({ where: { messageId: message.id, status: "QUEUED" } }),
    prisma.telegramDelivery.count({ where: { messageId: message.id, status: "NOT_CONNECTED" } })
  ]);
  const summary = { ...sent, recipients: run.recipients, queued, notConnected };
  await auditRun(actor.user.id, message.id, summary, "NOW");
  return { messageId: message.id, nextRunAt: null, summary, firstAt: run.firstAt?.toISOString() ?? null, lastAt: run.lastAt?.toISOString() ?? null };
}

async function ownMessage(actor: ManagementActor, messageId: string) {
  const instructorId = requireInstructor(actor);
  const message = await prisma.telegramMessage.findFirst({ where: { id: requireId(messageId, "messageId"), instructorId } });
  if (!message) throw authErrors.notFound("Message not found.");
  return message;
}

/** Pause or resume. Pausing also holds this message's queued deliveries; resuming releases them. */
export async function setMessageActive(actor: ManagementActor, messageId: string, active: boolean) {
  const message = await ownMessage(actor, messageId);
  const now = new Date();
  // A one-time message that already started: pause/resume only its remaining queued deliveries.
  if (message.schedule === "ONCE" && message.lastRunAt) {
    await prisma.$transaction(async (tx) => {
      await tx.telegramDelivery.updateMany({ where: { messageId: message.id, status: active ? "PAUSED" : "QUEUED" }, data: { status: active ? "QUEUED" : "PAUSED" } });
      await writeAudit(tx, { actorId: actor.user.id, action: active ? "telegram.message.resume" : "telegram.message.pause", entityType: "message", entityId: message.id, source: "MANUAL" });
    });
    return { active: false, nextRunAt: null };
  }
  let nextRunAt = message.nextRunAt;
  if (active) {
    if (message.schedule === "WEEKLY") nextRunAt = nextWeekly(message.weekday ?? 6, message.timeOfDay ?? "10:00", now);
    else if (!message.sendAt || message.sendAt.getTime() < now.getTime() || message.lastRunAt) throw conflict("message-done", "This message was already sent or its time has passed.");
    else nextRunAt = message.sendAt;
  }
  await prisma.$transaction(async (tx) => {
    await tx.telegramMessage.update({ where: { id: message.id }, data: { active, nextRunAt } });
    await tx.telegramDelivery.updateMany({ where: { messageId: message.id, status: active ? "PAUSED" : "QUEUED" }, data: { status: active ? "QUEUED" : "PAUSED" } });
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

/** Starts every run whose time has come, then sends what is due. Called by /api/cron/telegram every minute. */
export async function runDueMessages(now: Date = new Date()) {
  const due = await prisma.telegramMessage.findMany({
    where: { active: true, nextRunAt: { lte: now } },
    orderBy: { nextRunAt: "asc" },
    take: RUN_BATCH
  });
  let processed = 0;
  for (const message of due) {
    const scheduledFor = message.nextRunAt!;
    const weekly = message.schedule === "WEEKLY";
    // Compare-and-set on nextRunAt: if another call already took this run, count is 0 and we skip it.
    const claimed = await prisma.telegramMessage.updateMany({
      where: { id: message.id, active: true, nextRunAt: scheduledFor },
      data: weekly
        ? { nextRunAt: nextWeekly(message.weekday ?? 6, message.timeOfDay ?? "10:00", now), lastRunAt: now }
        : { nextRunAt: null, active: false, lastRunAt: now }
    });
    if (claimed.count === 0) continue;
    const run = await startRun(message, weekly ? utcToPlatform(scheduledFor).date : "once", now);
    await auditRun(null, message.id, run, weekly ? "WEEKLY" : "ONCE");
    processed += 1;
  }
  const sent = await dispatchDue(new Date());
  return { reason: null, processed, ...sent };
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
        take: 30
      })
    ),
    retryOnDatabaseFailure(() =>
      prisma.telegramDelivery.findMany({
        where: { message: { instructorId }, status: { in: ["SENT", "FAILED", "NOT_CONNECTED"] } },
        orderBy: { updatedAt: "desc" },
        take: 30,
        select: { id: true, status: true, error: true, via: true, sentAt: true, updatedAt: true, student: { select: { id: true, name: true } }, message: { select: { text: true } } }
      })
    )
  ]);
  const ids = plans.map((plan) => plan.id);
  const [counts, nextQueued] = ids.length
    ? await Promise.all([
        prisma.telegramDelivery.groupBy({ by: ["messageId", "runKey", "status"], where: { messageId: { in: ids } }, _count: { _all: true } }),
        prisma.telegramDelivery.groupBy({ by: ["messageId"], where: { messageId: { in: ids }, status: "QUEUED" }, _min: { scheduledFor: true } })
      ])
    : [[], []];
  const names = new Map(students.map((student) => [student.id, student.name]));

  const progressOf = (messageId: string) => {
    const rows = counts.filter((row) => row.messageId === messageId);
    const latest = rows.map((row) => row.runKey).sort().at(-1);
    if (!latest) return null;
    const ofRun = rows.filter((row) => row.runKey === latest);
    const count = (status: string) => ofRun.filter((row) => row.status === status).reduce((sum, row) => sum + row._count._all, 0);
    const total = ofRun.reduce((sum, row) => sum + row._count._all, 0);
    const next = nextQueued.find((row) => row.messageId === messageId)?._min.scheduledFor ?? null;
    return { total, sent: count("SENT"), waiting: count("QUEUED") + count("SENDING"), paused: count("PAUSED"), next: next ? utcToPlatform(next) : null };
  };

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
      pacing: plan.pacing as Pacing,
      windowStart: plan.windowStart,
      windowEnd: plan.windowEnd,
      sendAt: plan.sendAt ? utcToPlatform(plan.sendAt) : null,
      nextRunAt: plan.nextRunAt ? utcToPlatform(plan.nextRunAt) : null,
      lastRunAt: plan.lastRunAt ? utcToPlatform(plan.lastRunAt) : null,
      active: plan.active,
      progress: progressOf(plan.id)
    })),
    history: history.map((row) => ({
      id: row.id,
      status: row.status,
      error: row.error,
      via: row.via,
      at: utcToPlatform(row.sentAt ?? row.updatedAt),
      student: row.student,
      preview: row.message.text.slice(0, 80)
    }))
  };
}
