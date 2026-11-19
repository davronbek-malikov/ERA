import type { Locale } from "@/lib/i18n";

export function formatDifficulty(value: string, locale: Locale = "en") {
  const normalized = value.toLowerCase();

  if (locale === "uz") {
    if (normalized === "beginner") {
      return "Boshlang'ich";
    }

    if (normalized === "intermediate") {
      return "O'rta";
    }

    if (normalized === "advanced") {
      return "Ilg'or";
    }
  }

  return value.charAt(0) + value.slice(1).toLowerCase();
}

export function formatLessonSummary(count: number, locale: Locale = "en") {
  if (count === 0) {
    return locale === "uz" ? "Dastur tayyorlanmoqda" : "Curriculum in development";
  }

  if (locale === "uz") {
    return `${count} ta dars`;
  }

  return `${count} lesson${count === 1 ? "" : "s"}`;
}

export function parseDurationToMinutes(value?: string | null) {
  if (!value) {
    return 0;
  }

  const normalized = value.toLowerCase().trim();
  const hourMatch = normalized.match(/(\d+)\s*h/);
  const minuteMatch = normalized.match(/(\d+)\s*m/);

  if (hourMatch || minuteMatch) {
    const hours = hourMatch ? Number(hourMatch[1]) : 0;
    const minutes = minuteMatch ? Number(minuteMatch[1]) : 0;
    return hours * 60 + minutes;
  }

  const fallback = normalized.match(/(\d+)/);
  return fallback ? Number(fallback[1]) : 0;
}

export function formatDurationSummary(totalMinutes: number, locale: Locale = "en") {
  if (totalMinutes <= 0) {
    return locale === "uz" ? "Vaqt taxmini tez orada" : "Time estimate coming soon";
  }

  if (totalMinutes < 60) {
    return locale === "uz" ? `${totalMinutes} daqiqa` : `${totalMinutes} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
}

const relativeUnits: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60]
];

/** "3 days ago" / "3 kun oldin". Falls back to "just now" under a minute. */
export function formatRelativeDate(value: Date | string | null | undefined, locale: Locale = "en") {
  if (!value) {
    return locale === "uz" ? "Hali yo'q" : "Never";
  }
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale === "uz" ? "uz" : "en", { numeric: "auto" });
  for (const [unit, size] of relativeUnits) {
    if (Math.abs(seconds) >= size) {
      return formatter.format(Math.round(seconds / size), unit);
    }
  }
  return locale === "uz" ? "Hozirgina" : "Just now";
}

/** "5 Nov 2026" */
export function formatShortDate(value: Date | string, locale: Locale = "en") {
  return new Intl.DateTimeFormat(locale === "uz" ? "uz" : "en-GB", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(value)
  );
}

/** m:ss or h:mm:ss for a position in a video. */
export function formatClock(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
