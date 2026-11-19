import { ActivityType, Prisma, UserRole } from "@prisma/client";

import { hashPassword, normalizePhone } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { retryOnDatabaseFailure } from "@/lib/server-data";

/*
 * Student self-registration (Prompt 01).
 *
 * - The role is ALWAYS STUDENT and the status is ALWAYS PENDING: nothing from the form can change either, so a
 *   visitor can never register as a teacher or admin, and nobody gets in without approval.
 * - A PENDING account gets no session. `getCurrentUser` only accepts ACTIVE accounts, so every protected page
 *   and API (lessons, materials, the AI tutor, quizzes) already refuses it.
 * - Passwords are hashed with bcrypt; nothing about them is ever returned or logged.
 */

export const PENDING_STATUS = "PENDING";
export const REGISTRATION_LANGUAGES = ["uz", "en"] as const;
export type RegistrationLanguage = (typeof REGISTRATION_LANGUAGES)[number];

export type RegistrationError =
  | "missing-fields"
  | "invalid-name"
  | "invalid-email"
  | "invalid-phone"
  | "invalid-language"
  | "password-too-short"
  | "password-too-long"
  | "password-mismatch"
  | "email-exists"
  | "phone-exists";

export type RegistrationInput = {
  name: string;
  email: string;
  phone: string | null;
  password: string;
  preferredLanguage: RegistrationLanguage;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validates the form. Returns the clean input or the first error code (shown on the form). */
export function parseRegistration(raw: {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  password?: unknown;
  confirmPassword?: unknown;
  preferredLanguage?: unknown;
}): { ok: true; input: RegistrationInput } | { ok: false; error: RegistrationError } {
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const name = text(raw.name).trim().replace(/\s+/g, " ");
  const email = text(raw.email).trim().toLowerCase();
  const rawPhone = text(raw.phone).trim();
  const password = text(raw.password);
  const confirmPassword = text(raw.confirmPassword);
  const language = text(raw.preferredLanguage).trim() || "uz";

  if (!name || !email || !password || !confirmPassword) return { ok: false, error: "missing-fields" };
  if (name.length < 2 || name.length > 100 || /[<>]/.test(name)) return { ok: false, error: "invalid-name" };
  if (email.length > 254 || !EMAIL.test(email)) return { ok: false, error: "invalid-email" };

  let phone: string | null = null;
  if (rawPhone) {
    phone = normalizePhone(rawPhone) || null;
    const digits = (phone ?? "").replace(/\D/g, "");
    if (!phone || digits.length < 10 || digits.length > 15) return { ok: false, error: "invalid-phone" };
  }

  if (!(REGISTRATION_LANGUAGES as readonly string[]).includes(language)) return { ok: false, error: "invalid-language" };
  if (password.length < 8) return { ok: false, error: "password-too-short" };
  // bcrypt only uses the first 72 bytes; refuse longer passwords instead of silently ignoring the rest.
  if (Buffer.byteLength(password, "utf8") > 72) return { ok: false, error: "password-too-long" };
  if (password !== confirmPassword) return { ok: false, error: "password-mismatch" };

  return { ok: true, input: { name, email, phone, password, preferredLanguage: language as RegistrationLanguage } };
}

/** Creates the PENDING student account. Duplicate email/phone (also under a race) → a clear error code. */
export async function registerStudent(input: RegistrationInput): Promise<{ ok: true; userId: string } | { ok: false; error: RegistrationError }> {
  const existing = await retryOnDatabaseFailure(() =>
    prisma.user.findFirst({
      where: { OR: input.phone ? [{ email: { equals: input.email, mode: "insensitive" } }, { phone: input.phone }] : [{ email: { equals: input.email, mode: "insensitive" } }] },
      select: { email: true, phone: true }
    })
  );
  if (existing && existing.email.toLowerCase() === input.email) return { ok: false, error: "email-exists" };
  if (existing && input.phone && existing.phone === input.phone) return { ok: false, error: "phone-exists" };

  const passwordHash = await hashPassword(input.password);
  try {
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        passwordHash,
        // Fixed on purpose: never taken from the request.
        role: UserRole.STUDENT,
        status: PENDING_STATUS,
        preferredLanguage: input.preferredLanguage
      },
      select: { id: true }
    });
    await prisma.activityLog
      .create({ data: { type: ActivityType.USER_CREATED, message: "Student registered and is waiting for approval", userId: user.id, context: { source: "self-registration", status: PENDING_STATUS } } })
      .catch(() => undefined);
    return { ok: true, userId: user.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = String((error.meta as { target?: unknown } | undefined)?.target ?? "");
      return { ok: false, error: target.includes("phone") ? "phone-exists" : "email-exists" };
    }
    throw error;
  }
}
