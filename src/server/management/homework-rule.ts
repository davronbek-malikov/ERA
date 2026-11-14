import { addDays, todayInPlatform } from "@/server/management/time";

/*
 * Weekly homework rule. Each student's course calendar is split into 7-day weeks counted from their own
 * start date (week 1 = start … start+6). In every finished week the student must hand in at least
 * `perWeek` homeworks (fewer if fewer are left). The teacher sees:
 *   - "exam-ready" (green): every lesson's homework is checked as done;
 *   - "behind" (red): the last finished week had fewer hand-ins than required;
 *   - "on-track": otherwise, with this week's progress.
 * Teachers can switch the rule off (Instructor.homeworkRuleEnabled); exam-ready is always shown.
 * Pure function: no database access, easy to test.
 */

export type HomeworkPace = {
  state: "exam-ready" | "behind" | "on-track" | "off";
  /** Current week number (1-based) of the student's course, or null before the start / after the end. */
  week: number | null;
  /** The last finished week (the one that is judged). */
  lastWeek: { number: number; from: string; to: string; count: number; required: number } | null;
  /** The week in progress. */
  thisWeek: { number: number; from: string; to: string; count: number; required: number } | null;
  perWeek: number;
};

export type PaceInput = {
  startDate: string | null;
  endDate: string | null;
  status: string;
  today?: string;
  ruleEnabled: boolean;
  perWeek: number;
  totalLessons: number;
  doneLessons: number;
  /** When each homework was handed in (any time zone; converted to the platform calendar date). */
  submittedAt: Array<Date | string | null>;
};

function dayDiff(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function computeHomeworkPace(input: PaceInput): HomeworkPace {
  const today = input.today ?? todayInPlatform();
  const perWeek = Math.max(1, Math.min(50, Math.trunc(input.perWeek) || 3));
  const base = { week: null, lastWeek: null, thisWeek: null, perWeek };

  if (input.totalLessons > 0 && input.doneLessons >= input.totalLessons) return { ...base, state: "exam-ready" };
  if (!input.ruleEnabled || input.status !== "ACTIVE" || !input.startDate) return { ...base, state: "off" };

  const days = dayDiff(input.startDate, today);
  if (days < 0) return { ...base, state: "on-track" };

  const dates = input.submittedAt
    .filter((value): value is Date | string => Boolean(value))
    .map((value) => todayInPlatform(typeof value === "string" ? new Date(value) : value))
    .sort();
  const between = (from: string, to: string) => dates.filter((date) => date >= from && date <= to).length;
  const before = (date: string) => dates.filter((value) => value < date).length;
  const requiredFrom = (weekStart: string) => Math.max(0, Math.min(perWeek, input.totalLessons - before(weekStart)));

  // Weeks run until the course end date; after it there is no week in progress.
  const lastDay = input.endDate && input.endDate >= input.startDate ? input.endDate : null;
  const ended = lastDay !== null && today > lastDay;

  const currentIndex = Math.floor(days / 7);
  const thisFrom = addDays(input.startDate, currentIndex * 7);
  const thisTo = addDays(thisFrom, 6);
  const thisWeek = ended ? null : { number: currentIndex + 1, from: thisFrom, to: lastDay && lastDay < thisTo ? lastDay : thisTo, count: between(thisFrom, thisTo), required: requiredFrom(thisFrom) };

  // The last finished week: the one before this week, or the final week once the course has ended.
  let lastWeek: HomeworkPace["lastWeek"] = null;
  const lastIndex = ended ? Math.floor(dayDiff(input.startDate, lastDay!) / 7) : currentIndex - 1;
  if (lastIndex >= 0) {
    const from = addDays(input.startDate, lastIndex * 7);
    const fullTo = addDays(from, 6);
    const to = lastDay && lastDay < fullTo ? lastDay : fullTo;
    lastWeek = { number: lastIndex + 1, from, to, count: between(from, to), required: requiredFrom(from) };
  }

  const behind = lastWeek !== null && lastWeek.count < lastWeek.required;
  return { state: behind ? "behind" : "on-track", week: ended ? null : currentIndex + 1, lastWeek, thisWeek, perWeek };
}
