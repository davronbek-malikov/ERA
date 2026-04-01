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
