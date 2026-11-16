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

/** Local "YYYY-MM-DD" + "HH:MM" in the platform timezone → the UTC instant. */
export function platformDateTimeToUtc(date: string, time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  const [year, month, day] = date.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, day, hours, minutes);
  // Offset of the zone at that moment (handles zones with daylight saving, too).
  const offsetAt = (instant: number) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: platformTimezone(),
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).formatToParts(new Date(instant));
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute")) - instant;
  };
  const first = guess - offsetAt(guess);
  return new Date(guess - offsetAt(first));
}

/** A UTC instant → local { date, time } in the platform timezone. */
export function utcToPlatform(instant: Date): { date: string; time: string } {
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: platformTimezone(), hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).format(instant);
  return { date: todayInPlatform(instant), time };
}

/** The next instant strictly after `after` that falls on `day` (0 = Sunday) at local `time`. */
export function nextWeekly(day: number, time: string, after: Date = new Date()): Date {
  const today = todayInPlatform(after);
  for (let offset = 0; offset <= 7; offset += 1) {
    const date = addDays(today, offset);
    if (weekday(date) !== day) continue;
    const at = platformDateTimeToUtc(date, time);
    if (at.getTime() > after.getTime()) return at;
  }
  return platformDateTimeToUtc(addDays(today, 7), time);
}
