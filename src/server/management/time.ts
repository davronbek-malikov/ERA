import { invalid } from "@/lib/validation";

/*
 * Dates in Student Management (docs/ERA_STUDENT_MANAGEMENT.md, "Dates and time").
 *
 * - Business dates (course start/end, payment dates, due dates, exam dates) are CALENDAR dates in the platform
 *   timezone. They are stored in PostgreSQL `date` columns; Prisma returns them as Date objects at 00:00 UTC.
 *   In code they travel as "YYYY-MM-DD" strings, so no timezone shift can ever move a date by a day.
 * - Exam times are local "HH:MM" strings in the platform timezone.
 * - Audit timestamps (createdAt, reviewedAt, ...) are ordinary UTC instants.
 *
 * The platform timezone is ERA_TIMEZONE (default Asia/Seoul).
 */

export const DEFAULT_TIMEZONE = "Asia/Seoul";

export function platformTimezone() {
  const configured = process.env.ERA_TIMEZONE?.trim();
  if (configured) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: configured });
      return configured;
    } catch {
      // Unknown zone: fall back rather than fail every page.
    }
  }
  return DEFAULT_TIMEZONE;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isDateString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function requireDateString(value: unknown, field: string): string {
  const trimmed = typeof value === "string" ? value.trim() : value;
  if (!isDateString(trimmed)) throw invalid(`invalid-${field}`, `${field} must be a date (YYYY-MM-DD).`);
  return trimmed;
}

export function optionalDateString(value: unknown, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return requireDateString(value, field);
}

export function requireTimeString(value: unknown, field: string): string {
  const trimmed = typeof value === "string" ? value.trim() : value;
  if (typeof trimmed !== "string" || !TIME_PATTERN.test(trimmed)) throw invalid(`invalid-${field}`, `${field} must be a time (HH:MM, 24-hour).`);
  return trimmed;
}

/** "YYYY-MM-DD" → the Date Prisma stores in a `date` column. */
export function toDbDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** A `date` column value → "YYYY-MM-DD". */
export function fromDbDate(value: Date): string;
export function fromDbDate(value: Date | null | undefined): string | null;
export function fromDbDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/** Today's calendar date in the platform timezone. */
export function todayInPlatform(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: platformTimezone(), year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDays(date: string, days: number): string {
  const value = toDbDate(date);
  value.setUTCDate(value.getUTCDate() + days);
  return fromDbDate(value);
}

/** 0 = Sunday … 6 = Saturday, for a calendar date. */
export function weekday(date: string): number {
  return toDbDate(date).getUTCDay();
}

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Monday-based week containing `date`: [monday, sunday]. */
export function weekRange(date: string): [string, string] {
  const offset = (weekday(date) + 6) % 7;
  const start = addDays(date, -offset);
  return [start, addDays(start, 6)];
}

/** Calendar month containing `date`: [first, last]. */
export function monthRange(date: string): [string, string] {
  const [year, month] = date.split("-").map(Number);
  const first = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
  const last = fromDbDate(new Date(Date.UTC(year, month, 0)));
  return [first, last];
}

/** Human date, e.g. "12 Nov 2026" (no timezone conversion: it is already a calendar date). */
export function formatCalendarDate(date: string | null | undefined, options: { weekday?: boolean } = {}): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(options.weekday ? { weekday: "short" } : {})
  }).format(toDbDate(date));
}
