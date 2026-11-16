import { addDays, platformDateTimeToUtc, todayInPlatform } from "@/server/management/time";

/*
 * When each student's message goes out (ERA Assistant → Messages). Sending from a teacher's own number must
 * look like a person writing, so times are random, never on a fixed rhythm:
 *
 *   FAST    one after another with random 45–110 s gaps (urgent messages). Bot-only teachers: all at once
 *           (a bot has no account to protect).
 *   SPREAD  random times between windowStart and windowEnd (e.g. 08:00–17:00, Seoul): the window is cut into
 *           one slice per student and each student gets a random minute inside their slice, at least
 *           MIN_GAP apart. Never at night: after the window closes, sending starts the next morning, and
 *           anything that doesn't fit continues the next day.
 *
 * Pure (inject `random` for tests).
 */

export type Pacing = "FAST" | "SPREAD";

const FAST_GAP_MIN_MS = 45_000;
const FAST_GAP_MAX_MS = 110_000;
const MIN_GAP_MS = 2 * 60_000;
/** Starting with less than this left in today's window waits for tomorrow's window. */
const MIN_REMAINING_MS = 15 * 60_000;

export type PlanInput = {
  count: number;
  pacing: Pacing;
  now: Date;
  windowStart: string;
  windowEnd: string;
  /** Sending from the teacher's own account (paced) or only through the bot (no pacing needed for FAST). */
  accountConnected: boolean;
  random?: () => number;
};

export function windowIsValid(start: string, end: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(start) && /^([01]\d|2[0-3]):[0-5]\d$/.test(end) && end > start;
}

export function planSendTimes(input: PlanInput): Date[] {
  const random = input.random ?? Math.random;
  const now = input.now.getTime();
  if (input.count <= 0) return [];

  if (input.pacing === "FAST") {
    if (!input.accountConnected) return Array.from({ length: input.count }, () => new Date(now));
    const times: Date[] = [];
    let at = now;
    for (let index = 0; index < input.count; index += 1) {
      times.push(new Date(at));
      at += FAST_GAP_MIN_MS + random() * (FAST_GAP_MAX_MS - FAST_GAP_MIN_MS);
    }
    return times;
  }

  // SPREAD: find the first window that still has enough time left.
  let day = todayInPlatform(input.now);
  const windowOf = (date: string) => ({ start: platformDateTimeToUtc(date, input.windowStart).getTime(), end: platformDateTimeToUtc(date, input.windowEnd).getTime() });
  let window = windowOf(day);
  if (now > window.end - MIN_REMAINING_MS) {
    day = addDays(day, 1);
    window = windowOf(day);
  }
  const start = Math.max(now, window.start);
  const slot = Math.max((window.end - start) / input.count, MIN_GAP_MS);

  const times: Date[] = [];
  for (let index = 0; index < input.count; index += 1) {
    // A random minute inside this student's slice, leaving MIN_GAP before the next slice.
    let offset = index * slot + random() * Math.max(0, slot - MIN_GAP_MS);
    let windowStart = start;
    let windowEnd = window.end;
    let current = day;
    // Doesn't fit today: continue in the next day's window (never at night).
    while (windowStart + offset > windowEnd) {
      offset -= windowEnd - windowStart;
      current = addDays(current, 1);
      const next = windowOf(current);
      windowStart = next.start;
      windowEnd = next.end;
    }
    times.push(new Date(Math.round((windowStart + offset) / 1000) * 1000));
  }
  return times.sort((a, b) => a.getTime() - b.getTime());
}

/** Fisher–Yates: the same student isn't always first (or last). */
export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}
