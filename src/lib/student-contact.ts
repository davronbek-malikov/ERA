/*
 * Student contact details for teachers (docs/ERA_TEACHER_HOMEWORK.md). Students added by a teacher may have no
 * email: their account gets a hidden internal address (never shown, never emailed) because accounts need one.
 */

export const PLACEHOLDER_EMAIL_DOMAIN = "no-email.eraacademy.local";

export function isPlaceholderEmail(email: string | null | undefined) {
  return Boolean(email && email.toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`));
}

/** The email to show, or null when the student has none. */
export function visibleEmail(email: string | null | undefined) {
  return email && !isPlaceholderEmail(email) ? email : null;
}

/** A t.me link for a Telegram username ("@name"); null for phone numbers. */
export function telegramUrl(telegram: string | null | undefined) {
  const value = telegram?.trim();
  if (!value || !/^@[A-Za-z][A-Za-z0-9_]{3,31}$/.test(value)) return null;
  return `https://t.me/${value.slice(1)}`;
}
