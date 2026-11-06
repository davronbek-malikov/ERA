"use client";

import * as React from "react";

import { Progress } from "@/components/ui/feedback";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const copy = {
  en: { show: "Show email", hide: "Hide email", progress: "Course progress" },
  uz: { show: "Emailni ko'rsatish", hide: "Emailni yashirish", progress: "Kurs bo'yicha natija" }
} as const;

/**
 * What a teacher may see about a student. There is deliberately no phone field:
 * phone numbers are never shown to teachers (docs/ERA_INFORMATION_ARCHITECTURE.md §2.3).
 */
export type TeacherVisibleStudent = {
  id: string;
  name: string;
  /**
   * Only pass this when the server policy allows the teacher to see it (OD-3). The
   * component still keeps it hidden until the teacher asks to see it.
   */
  email?: string;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function StudentIdentity({
  student,
  locale = "en",
  className
}: {
  student: TeacherVisibleStudent;
  locale?: Locale;
  className?: string;
}) {
  const [showEmail, setShowEmail] = React.useState(false);
  const t = copy[locale];

  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground"
        aria-hidden="true"
      >
        {initials(student.name)}
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium text-foreground">{student.name}</span>
        {student.email ? (
          showEmail ? (
            <span className="truncate text-xs text-muted-foreground">
              {student.email}{" "}
              <button type="button" className="min-h-6 underline-offset-2 hover:underline" onClick={() => setShowEmail(false)}>
                {t.hide}
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="min-h-6 self-start text-left text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              onClick={() => setShowEmail(true)}
            >
              {t.show}
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}

/** Course-specific progress for one student: always scoped to a single course. */
export function CourseProgressCell({
  value,
  completedLessons,
  totalLessons,
  locale = "en"
}: {
  value: number;
  completedLessons: number;
  totalLessons: number;
  locale?: Locale;
}) {
  return (
    <div className="flex min-w-[8rem] flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium tabular-nums text-foreground">{Math.round(value)}%</span>
        <span className="tabular-nums text-muted-foreground">
          {completedLessons}/{totalLessons}
        </span>
      </div>
      <Progress value={value} label={copy[locale].progress} tone={value >= 100 ? "success" : "primary"} />
    </div>
  );
}
