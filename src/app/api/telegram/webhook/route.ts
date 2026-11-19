import { NextResponse, type NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/server/management/audit";
import { safeEqual, sendTelegramMessage, telegramConfig, verifyTelegramLinkToken } from "@/server/telegram/bot";

export const dynamic = "force-dynamic";

/*
 * Telegram webhook. Telegram POSTs every message the bot receives here, with the secret we registered in
 * X-Telegram-Bot-Api-Secret-Token. The only thing we act on is "/start <token>" from a student's personal
 * invite link: it stores that chat so homework reminders can reach the student. Always answers 200 to
 * Telegram for well-formed calls (otherwise it keeps retrying).
 */

type Update = { message?: { text?: string; chat?: { id?: number | string; type?: string } } };

const LINKED = "✅ Siz ERA Academy botiga ulandingiz. Endi uy vazifalari bo'yicha eslatmalar shu yerga keladi.";
const NEED_LINK = "Assalomu alaykum! Ulanish uchun o'qituvchingiz yuborgan shaxsiy havolani oching va Start tugmasini bosing.";

export async function POST(request: NextRequest) {
  const { webhookSecret, configured } = telegramConfig();
  if (!configured || !webhookSecret || !safeEqual(request.headers.get("x-telegram-bot-api-secret-token"), webhookSecret)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = (await request.json().catch(() => null)) as Update | null;
  const text = update?.message?.text?.trim() ?? "";
  const chatId = update?.message?.chat?.id;
  // Only private chats: a group must never receive a student's reminders.
  if (chatId === undefined || update?.message?.chat?.type !== "private" || !text.startsWith("/start")) {
    return NextResponse.json({ ok: true });
  }

  const token = text.split(/\s+/)[1] ?? "";
  const studentId = token ? verifyTelegramLinkToken(token) : null;
  const student = studentId ? await prisma.user.findUnique({ where: { id: studentId }, select: { id: true, telegramChatId: true } }) : null;
  if (!student) {
    await sendTelegramMessage(String(chatId), NEED_LINK);
    return NextResponse.json({ ok: true });
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: student.id }, data: { telegramChatId: String(chatId), telegramLinkedAt: new Date() } });
    await writeAudit(tx, { actorId: student.id, action: "student.telegram.link", entityType: "student", entityId: student.id, before: { linked: Boolean(student.telegramChatId) }, after: { linked: true }, source: "SYSTEM" });
  });
  await sendTelegramMessage(String(chatId), LINKED);
  return NextResponse.json({ ok: true });
}
