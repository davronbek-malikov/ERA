import type { ManagementSource } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { retryOnDatabaseFailure } from "@/lib/server-data";
import { invalid, requireString } from "@/lib/validation";
import { authErrors } from "@/server/authz";
import type { ManagementActor } from "@/server/management/actor";
import { writeAudit } from "@/server/management/audit";
import { conflict } from "@/server/management/enrollments";
import { computeHomeworkPace, type HomeworkPace } from "@/server/management/homework-rule";
import { fromDbDate, todayInPlatform, toDbDate, weekday } from "@/server/management/time";
import { sendTelegramMessage, telegramConfig, telegramInviteUrl } from "@/server/telegram/bot";

/*
 * Automatic Telegram reminders for the weekly homework rule (homework-rule.ts).
 *
 * Every Saturday (Asia/Seoul) a scheduled job calls /api/cron/homework-reminders. For each teacher who switched
 * the reminder on, every ACTIVE student whose last finished week is red ("behind") gets the teacher's message
 * on Telegram. One message per enrollment and judged week (unique row in homework_reminders), so running the
 * job twice, or the teacher pressing "Send now" as well, never messages a student twice for the same week.
 * Students who never pressed Start on the bot can't be messaged; the teacher sees them and their invite link.
 */

export const DEFAULT_REMINDER_TEXT =
  "Assalomu alaykum! Kelishganimizdek, siz bir haftada eng kamida 3 ta vazifa topshirishingiz kerak edi, lekin vazifalarni to'liq bajarmadingiz. Eng avvalo tartib o'zingiz uchun kerak, shuning uchun yangi haftada o'tgan haftadagi kamchiliklarni to'ldirib qo'ying.";

/** Saturday (0 = Sunday … 6 = Saturday). */
export const REMINDER_WEEKDAY = 6;
export const REMINDER_TIME_LABEL = "10:00";

const MAX_TEXT = 1500;

type Options = { source: ManagementSource };
type Raw = Record<string, unknown>;

export type ReminderSettingsInput = { enabled: boolean; text: string };

export function parseReminderSettings(raw: Raw): ReminderSettingsInput {
  if (typeof raw.enabled !== "boolean") throw invalid("invalid-enabled", "Choose on or off.");
  const text = requireString(raw.text, "Message", { max: MAX_TEXT });
  return { enabled: raw.enabled, text };
}

/** `{name}` in the teacher's text becomes the student's name. */
export function renderReminder(template: string | null | undefined, studentName: string) {
  return (template?.trim() || DEFAULT_REMINDER_TEXT).replaceAll("{name}", studentName);
}

function requireTeacherProfile(actor: ManagementActor) {
  if (!actor.instructorId) throw authErrors.forbidden("Only teachers can send homework reminders.");
  return actor.instructorId;
}

export async function getReminderSettings(actor: ManagementActor) {
  const bot = telegramConfig();
  const row = actor.instructorId
    ? await retryOnDatabaseFailure(() =>
        prisma.instructor.findUnique({
          where: { id: actor.instructorId! },
          select: { reminderEnabled: true, reminderText: true, homeworkRuleEnabled: true, homeworkPerWeek: true }
        })
      )
    : null;
  return {
    editable: Boolean(row),
    enabled: row?.reminderEnabled ?? false,
    text: row?.reminderText?.trim() || DEFAULT_REMINDER_TEXT,
    ruleEnabled: row?.homeworkRuleEnabled ?? true,
    perWeek: row?.homeworkPerWeek ?? 3,
    botConfigured: bot.configured,
    botUsername: bot.username,
    webhookConfigured: Boolean(bot.webhookSecret),
    cronConfigured: Boolean(process.env.CRON_SECRET?.trim())
  };
}

export async function updateReminderSettings(actor: ManagementActor, input: ReminderSettingsInput, options: Options) {
  const instructorId = requireTeacherProfile(actor);
  return prisma.$transaction(async (tx) => {
    const before = await tx.instructor.findUnique({ where: { id: instructorId }, select: { reminderEnabled: true, reminderText: true } });
    if (!before) throw authErrors.notFound("Teacher profile not found.");
    const after = await tx.instructor.update({
      where: { id: instructorId },
      data: { reminderEnabled: input.enabled, reminderText: input.text === DEFAULT_REMINDER_TEXT ? null : input.text },
      select: { reminderEnabled: true, reminderText: true }
    });
    await writeAudit(tx, { actorId: actor.user.id, action: "homework.reminder.settings", entityType: "homework", entityId: instructorId, before, after, source: options.source });
    return { enabled: after.reminderEnabled, text: after.reminderText ?? DEFAULT_REMINDER_TEXT };
  });
}

// ------------------------------------------------------------------------------------------------
// Who is due
// ------------------------------------------------------------------------------------------------

type DueRow = {
  enrollmentId: string;
  instructorId: string;
  student: { id: string; name: string; telegram: string | null; linked: boolean };
  chatId: string | null;
  course: string;
  pace: HomeworkPace;
  text: string;
  reminder: { status: string; sentAt: string | null; error: string | null } | null;
};

async function loadStudents(instructorIds: string[], today: string) {
  const enrollments = await retryOnDatabaseFailure(() =>
    prisma.enrollment.findMany({
      where: { instructorId: { in: instructorIds }, status: "ACTIVE" },
      orderBy: [{ user: { name: "asc" } }],
      select: {
        id: true,
        instructorId: true,
        status: true,
        startDate: true,
        endDate: true,
        user: { select: { id: true, name: true, telegram: true, telegramChatId: true } },
        course: { select: { title: true, _count: { select: { lessons: true } } } },
        instructor: { select: { homeworkRuleEnabled: true, homeworkPerWeek: true, reminderText: true } },
        homeworkReviews: { select: { status: true, submittedAt: true } },
        homeworkReminders: { orderBy: { weekFrom: "desc" }, take: 3, select: { weekFrom: true, status: true, sentAt: true, error: true } }
      }
    })
  );
  return enrollments.map((enrollment) => {
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
    const judged = pace.lastWeek?.from ?? null;
    const reminder = judged ? enrollment.homeworkReminders.find((row) => fromDbDate(row.weekFrom) === judged) : undefined;
    return {
      enrollmentId: enrollment.id,
      instructorId: enrollment.instructorId!,
      student: { id: enrollment.user.id, name: enrollment.user.name, telegram: enrollment.user.telegram, linked: Boolean(enrollment.user.telegramChatId) },
      chatId: enrollment.user.telegramChatId,
      course: enrollment.course.title,
      pace,
      text: renderReminder(enrollment.instructor?.reminderText, enrollment.user.name),
      reminder: reminder ? { status: reminder.status, sentAt: reminder.sentAt?.toISOString() ?? null, error: reminder.error } : null
    } satisfies DueRow;
  });
}

/** Everything the teacher's "Automatic messages" tab shows. */
export async function getReminderOverview(actor: ManagementActor) {
  const today = todayInPlatform();
  if (!actor.instructorId) return { today, students: [], behind: [], history: [] };
  const rows = await loadStudents([actor.instructorId], today);
  const history = await retryOnDatabaseFailure(() =>
    prisma.homeworkReminder.findMany({
      where: { instructorId: actor.instructorId! },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, status: true, source: true, sentAt: true, createdAt: true, weekNumber: true, handedIn: true, required: true, error: true, student: { select: { id: true, name: true } } }
    })
  );

  // One line per student for the Telegram connection list (a student may have several courses).
  const students = new Map<string, { id: string; name: string; telegram: string | null; linked: boolean; inviteUrl: string | null }>();
  for (const row of rows) {
    if (!students.has(row.student.id)) students.set(row.student.id, { ...row.student, inviteUrl: row.student.linked ? null : telegramInviteUrl(row.student.id) });
  }

  return {
    today,
    students: [...students.values()],
    behind: rows
      .filter((row) => row.pace.state === "behind")
      .map(({ chatId: _chatId, ...row }) => ({ ...row, inviteUrl: row.student.linked ? null : telegramInviteUrl(row.student.id) })),
    history: history.map((row) => ({
      id: row.id,
      status: row.status,
      source: row.source,
      at: (row.sentAt ?? row.createdAt).toISOString(),
      week: row.weekNumber,
      handedIn: row.handedIn,
      required: row.required,
      error: row.error,
      student: row.student
    }))
  };
}

// ------------------------------------------------------------------------------------------------
// Sending
// ------------------------------------------------------------------------------------------------

async function claimSlot(input: {
  enrollmentId: string;
  studentId: string;
  instructorId: string;
  weekFrom: Date;
  week: { number: number; count: number; required: number };
  source: "AUTO" | "MANUAL";
}): Promise<string | null> {
  const key = { enrollmentId_weekFrom: { enrollmentId: input.enrollmentId, weekFrom: input.weekFrom } };
  const existing = await prisma.homeworkReminder.findUnique({ where: key, select: { id: true } });
  if (!existing) {
    try {
      const created = await prisma.homeworkReminder.create({
        data: {
          enrollmentId: input.enrollmentId,
          studentId: input.studentId,
          instructorId: input.instructorId,
          weekFrom: input.weekFrom,
          weekNumber: input.week.number,
          handedIn: input.week.count,
          required: input.week.required,
          status: "SENDING",
          source: input.source
        },
        select: { id: true }
      });
      return created.id;
    } catch {
      return null; // another run created it a moment ago
    }
  }
  const stale = new Date(Date.now() - 10 * 60_000);
  const taken = await prisma.homeworkReminder.updateMany({
    where: { id: existing.id, OR: [{ status: "FAILED" }, { status: "SENDING", updatedAt: { lt: stale } }] },
    data: { status: "SENDING", source: input.source, handedIn: input.week.count, required: input.week.required }
  });
  return taken.count === 1 ? existing.id : null;
}

export type SendSummary = { sent: number; failed: number; notLinked: number; alreadySent: number; behind: number };

async function sendForInstructors(instructorIds: string[], source: "AUTO" | "MANUAL", actorId: string | null): Promise<SendSummary> {
  const summary: SendSummary = { sent: 0, failed: 0, notLinked: 0, alreadySent: 0, behind: 0 };
  if (instructorIds.length === 0) return summary;
  const today = todayInPlatform();
  const rows = (await loadStudents(instructorIds, today)).filter((row) => row.pace.state === "behind" && row.pace.lastWeek);

  for (const row of rows) {
    summary.behind += 1;
    const week = row.pace.lastWeek!;
    if (row.reminder?.status === "SENT") {
      summary.alreadySent += 1;
      continue;
    }
    if (!row.chatId) {
      summary.notLinked += 1;
      continue;
    }
    const weekFrom = toDbDate(week.from);
    // Claim the (enrollment, week) slot before sending, so two runs at the same moment can't both send.
    // A FAILED row is retried; a SENDING row older than 10 minutes (crashed run) is retried too.
    const claimId = await claimSlot({ enrollmentId: row.enrollmentId, studentId: row.student.id, instructorId: row.instructorId, weekFrom, week, source });
    if (!claimId) {
      summary.alreadySent += 1;
      continue;
    }

    const result = await sendTelegramMessage(row.chatId, row.text);
    await prisma.homeworkReminder.update({
      where: { id: claimId },
      data: result.ok ? { status: "SENT", sentAt: new Date(), error: null } : { status: "FAILED", error: result.error }
    });
    if (result.ok) summary.sent += 1;
    else {
      summary.failed += 1;
      // The student blocked the bot: forget the chat so the teacher sees "not connected" and can re-invite.
      if (result.blocked) await prisma.user.update({ where: { id: row.student.id }, data: { telegramChatId: null, telegramLinkedAt: null } });
    }
  }

  // One audit row per run: the teacher's own "Send now", or the Saturday job for everyone.
  await prisma.$transaction((tx) =>
    writeAudit(tx, {
      actorId,
      action: "homework.reminder.send",
      entityType: "homework",
      entityId: source === "MANUAL" ? instructorIds[0] : `scheduled-${today}`,
      after: { ...summary, trigger: source, teachers: instructorIds.length },
      source: source === "MANUAL" ? "MANUAL" : "SYSTEM"
    })
  );
  return summary;
}

/** The teacher pressed "Send now": their own students only, whatever day it is. */
export async function sendRemindersNow(actor: ManagementActor) {
  const instructorId = requireTeacherProfile(actor);
  if (!telegramConfig().configured) throw conflict("telegram-not-configured", "The Telegram bot is not connected yet. Ask the administrator to add it (see the guide on this page).");
  return sendForInstructors([instructorId], "MANUAL", actor.user.id);
}

/** The Saturday job: every teacher who switched automatic reminders on (and kept the weekly rule on). */
export async function runScheduledReminders(options: { anyDay?: boolean } = {}) {
  const today = todayInPlatform();
  if (!options.anyDay && weekday(today) !== REMINDER_WEEKDAY) return { skipped: "not-saturday" as const, today };
  if (!telegramConfig().configured) return { skipped: "bot-not-configured" as const, today };
  const instructors = await prisma.instructor.findMany({ where: { reminderEnabled: true, homeworkRuleEnabled: true }, select: { id: true } });
  const summary = await sendForInstructors(
    instructors.map((row) => row.id),
    "AUTO",
    null
  );
  return { skipped: null, today, teachers: instructors.length, ...summary };
}
