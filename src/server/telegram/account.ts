import { assertRateLimit, getUserRateLimitKeyParts } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { retryOnDatabaseFailure } from "@/lib/server-data";
import { invalid, requireString } from "@/lib/validation";
import { authErrors } from "@/server/authz";
import type { ManagementActor } from "@/server/management/actor";
import { writeAudit } from "@/server/management/audit";
import { conflict } from "@/server/management/enrollments";
import { accountConfig, logoutAccount, startLogin, TelegramAccountError, verifyCode, verifyPassword, type AccountUser } from "@/server/telegram/account-client";
import { decryptSession, encryptSession } from "@/server/telegram/session-crypto";

/*
 * Connecting a teacher's own Telegram account (ERA Assistant → Messages → "Connect my Telegram").
 * Phone → login code → (two-step password) → CONNECTED. Only the teacher themself can connect or disconnect
 * their account; the encrypted session never leaves the server. Login attempts are rate limited.
 */

const LOGIN_MESSAGES: Record<string, string> = {
  PHONE_NUMBER_INVALID: "That phone number isn't valid for Telegram. Use the international format, e.g. +998901234567.",
  PHONE_NUMBER_BANNED: "Telegram has banned this phone number.",
  PHONE_NUMBER_UNOCCUPIED: "There is no Telegram account with this phone number.",
  PHONE_CODE_INVALID: "The code is wrong. Check the code Telegram sent you and try again.",
  PHONE_CODE_EXPIRED: "The code has expired. Start again to get a new code.",
  PHONE_CODE_EMPTY: "Enter the code Telegram sent you.",
  PASSWORD_HASH_INVALID: "The two-step verification password is wrong.",
  FLOOD_WAIT: "Telegram asks to wait before trying again ({seconds} seconds).",
  TIMEOUT: "Telegram did not answer in time. Try again.",
  NOT_CONFIGURED: "Sending from your own number isn't set up yet (TELEGRAM_API_ID / TELEGRAM_API_HASH)."
};

function loginError(error: unknown): never {
  if (error instanceof TelegramAccountError) {
    const message = (LOGIN_MESSAGES[error.code] ?? "Telegram refused the login ({code}). Try again.").replace("{seconds}", String(error.seconds ?? 60)).replace("{code}", error.code);
    throw invalid(`telegram-${error.code.toLowerCase()}`, message);
  }
  throw error;
}

function requireInstructor(actor: ManagementActor) {
  if (!actor.instructorId) throw authErrors.forbidden("Only teachers can connect a Telegram account.");
  return actor.instructorId;
}

export function parsePhone(value: unknown): string {
  const text = requireString(value, "phone", { max: 30 }).replace(/[\s()-]/g, "");
  const phone = text.startsWith("+") ? text : `+${text}`;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw invalid("invalid-phone", "Enter your phone number in international format, e.g. +998901234567.");
  return phone;
}

export function maskPhone(phone: string) {
  return phone.length > 6 ? `${phone.slice(0, 4)} •••• ${phone.slice(-3)}` : phone;
}

async function limit(actor: ManagementActor) {
  await assertRateLimit({ scope: "telegram-login", maxAttempts: 8, windowMs: 15 * 60_000, cooldownMs: 15 * 60_000, keyParts: getUserRateLimitKeyParts(actor.user.id) });
}

async function audit(actor: ManagementActor, instructorId: string, action: string, after?: unknown) {
  await prisma.$transaction((tx) => writeAudit(tx, { actorId: actor.user.id, action, entityType: "message", entityId: `telegram-account:${instructorId}`, after, source: "MANUAL" }));
}

async function saveConnected(actor: ManagementActor, instructorId: string, session: string, user: AccountUser) {
  await prisma.telegramAccount.update({
    where: { instructorId },
    data: {
      status: "CONNECTED",
      sessionEnc: encryptSession(session),
      phoneCodeHash: null,
      telegramUserId: user.id,
      displayName: user.name,
      username: user.username,
      limitedUntil: null,
      lastError: null,
      connectedAt: new Date()
    }
  });
  await audit(actor, instructorId, "telegram.account.connect", { username: user.username });
  return { status: "CONNECTED" as const, name: user.name, username: user.username };
}

export async function startAccountLogin(actor: ManagementActor, rawPhone: unknown) {
  const instructorId = requireInstructor(actor);
  if (!accountConfig().configured && process.env.ERA_SECURITY_TEST !== "1") throw conflict("telegram-account-not-configured", LOGIN_MESSAGES.NOT_CONFIGURED);
  const phone = parsePhone(rawPhone);
  await limit(actor);
  const existing = await prisma.telegramAccount.findUnique({ where: { instructorId } });
  if (existing?.status === "CONNECTED") throw conflict("telegram-already-connected", "Your Telegram account is already connected. Disconnect it first.");
  const { session, phoneCodeHash } = await startLogin(phone).catch(loginError);
  const data = { status: "CODE_SENT", phone, sessionEnc: encryptSession(session), phoneCodeHash, lastError: null };
  await prisma.telegramAccount.upsert({ where: { instructorId }, create: { instructorId, ...data }, update: data });
  return { status: "CODE_SENT" as const, phone: maskPhone(phone) };
}

export async function submitAccountCode(actor: ManagementActor, rawCode: unknown) {
  const instructorId = requireInstructor(actor);
  const code = requireString(rawCode, "code", { max: 10 }).replace(/\D/g, "");
  if (code.length < 4) throw invalid("invalid-code", "Enter the code Telegram sent you.");
  await limit(actor);
  const account = await prisma.telegramAccount.findUnique({ where: { instructorId } });
  const session = decryptSession(account?.sessionEnc);
  if (!account || account.status !== "CODE_SENT" || !session || !account.phoneCodeHash) throw conflict("telegram-no-login", "Start again: enter your phone number first.");
  const result = await verifyCode(session, account.phone, account.phoneCodeHash, code).catch(loginError);
  if (result.status === "PASSWORD_NEEDED") {
    await prisma.telegramAccount.update({ where: { instructorId }, data: { status: "PASSWORD_NEEDED", sessionEnc: encryptSession(result.session) } });
    return { status: "PASSWORD_NEEDED" as const };
  }
  return saveConnected(actor, instructorId, result.session, result.user);
}

export async function submitAccountPassword(actor: ManagementActor, rawPassword: unknown) {
  const instructorId = requireInstructor(actor);
  const password = requireString(rawPassword, "password", { min: 1, max: 256 });
  await limit(actor);
  const account = await prisma.telegramAccount.findUnique({ where: { instructorId } });
  const session = decryptSession(account?.sessionEnc);
  if (!account || account.status !== "PASSWORD_NEEDED" || !session) throw conflict("telegram-no-login", "Start again: enter your phone number first.");
  const result = await verifyPassword(session, password).catch(loginError);
  return saveConnected(actor, instructorId, result.session, result.user);
}

/** Disconnect: log ERA out on Telegram and forget the session. Messages fall back to the bot. */
export async function disconnectAccount(actor: ManagementActor) {
  const instructorId = requireInstructor(actor);
  const account = await prisma.telegramAccount.findUnique({ where: { instructorId } });
  if (!account) return { status: "DISCONNECTED" as const };
  const session = decryptSession(account.sessionEnc);
  if (session && account.status === "CONNECTED") await logoutAccount(session);
  await prisma.telegramAccount.delete({ where: { instructorId } });
  await audit(actor, instructorId, "telegram.account.disconnect");
  return { status: "DISCONNECTED" as const };
}

/** What the page shows (never the session). */
export async function getAccountStatus(actor: ManagementActor) {
  const configured = accountConfig().configured || process.env.ERA_SECURITY_TEST === "1";
  if (!actor.instructorId) return { configured, status: "NONE" as const };
  const account = await retryOnDatabaseFailure(() => prisma.telegramAccount.findUnique({ where: { instructorId: actor.instructorId! } }));
  if (!account) return { configured, status: "NONE" as const };
  return {
    configured,
    status: account.status as "CODE_SENT" | "PASSWORD_NEEDED" | "CONNECTED" | "DISCONNECTED",
    phone: maskPhone(account.phone),
    name: account.displayName,
    username: account.username,
    limitedUntil: account.limitedUntil && account.limitedUntil.getTime() > Date.now() ? account.limitedUntil.toISOString() : null,
    lastError: account.lastError
  };
}
