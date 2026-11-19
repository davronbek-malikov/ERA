import { timingSafeEqual } from "node:crypto";

import { signForPurpose } from "@/lib/auth";

/*
 * ERA Telegram bot (docs: guide in the Assistant → Automatic messages tab).
 *
 * Telegram bots can only message people who pressed Start on the bot first, so each student gets a personal
 * invite link t.me/<bot>?start=<token>. The token is the student's id plus an HMAC signature (no database row,
 * cannot be guessed or forged for another student). When the student presses Start, Telegram calls our
 * webhook and we store their chat id.
 *
 * Configuration (server environment, never in the browser):
 *   TELEGRAM_BOT_TOKEN       from @BotFather
 *   TELEGRAM_BOT_USERNAME    the bot's username without "@", for invite links
 *   TELEGRAM_WEBHOOK_SECRET  random string; Telegram sends it back in X-Telegram-Bot-Api-Secret-Token
 *   TELEGRAM_API_BASE        optional, tests only (defaults to https://api.telegram.org)
 */

const LINK_PURPOSE = "telegram-link";

export function telegramConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
  const username = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "") || null;
  return {
    token,
    username,
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || null,
    apiBase: (process.env.TELEGRAM_API_BASE?.trim() || "https://api.telegram.org").replace(/\/$/, ""),
    configured: Boolean(token && username)
  };
}

export function telegramLinkToken(userId: string) {
  return `${userId}_${signForPurpose(LINK_PURPOSE, userId).slice(0, 22)}`;
}

/** The student id inside a valid invite token, or null. */
export function verifyTelegramLinkToken(token: string): string | null {
  const separator = token.indexOf("_");
  if (separator <= 0) return null;
  const userId = token.slice(0, separator);
  if (!/^[a-z0-9]{10,40}$/i.test(userId)) return null;
  const expected = Buffer.from(telegramLinkToken(userId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given) ? userId : null;
}

export function telegramInviteUrl(userId: string): string | null {
  const { username } = telegramConfig();
  return username ? `https://t.me/${username}?start=${telegramLinkToken(userId)}` : null;
}

export function safeEqual(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export type TelegramSendResult = { ok: true } | { ok: false; error: string; blocked: boolean };

export async function sendTelegramMessage(chatId: string, text: string): Promise<TelegramSendResult> {
  const { token, apiBase } = telegramConfig();
  if (!token) return { ok: false, error: "Telegram bot is not configured.", blocked: false };
  try {
    const response = await fetch(`${apiBase}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10_000)
    });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
    if (response.ok && payload?.ok) return { ok: true };
    // 403: the student blocked the bot or deleted the chat. Never echo the URL (it contains the token).
    const description = (payload?.description ?? `HTTP ${response.status}`).slice(0, 200);
    return { ok: false, error: description, blocked: response.status === 403 };
  } catch {
    return { ok: false, error: "Telegram did not answer.", blocked: false };
  }
}
