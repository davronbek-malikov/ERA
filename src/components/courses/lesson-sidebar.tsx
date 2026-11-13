"use client";

import { memo, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, CirclePlay, Lock } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type LessonSidebarProps = {
  courseSlug: string;
  currentLessonId: string;
  currentLessonSlug: string;
  locale: "en" | "uz";
  lessons: Array<{
    id: string;
    slug: string;
    title: string;
    position: number;
    moduleId: string | null;
    module: {
      id: string;
      title: string;
    } | null;
  }>;
  progress?: ProgressPayload | null;
};

type ProgressPayload = {
  authenticated: boolean;
  completedLessonIds: string[];
  currentLessonId: string | null;
  progressPercent?: number;
  completedLessons?: number;
  totalLessons?: number;
};

function LessonSidebarComponent({
  courseSlug,
  currentLessonId,
  currentLessonSlug,
  locale,
  lessons,
  progress: controlledProgress
}: LessonSidebarProps) {
  const [progress, setProgress] = useState<ProgressPayload>({
    authenticated: false,
    completedLessonIds: [],
    currentLessonId: currentLessonId
  });
  const activeProgress = controlledProgress ?? progress;

  useEffect(() => {
    if (controlledProgress) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(`/api/courses/${courseSlug}/progress`, {
          cache: "no-store"
        });
        const payload = (await response.json()) as ProgressPayload;

        if (!response.ok || cancelled) {
          return;
        }

        setProgress({
          authenticated: payload.authenticated,
          completedLessonIds: payload.completedLessonIds ?? [],
          currentLessonId: payload.currentLessonId ?? currentLessonId
        });
      } catch {
        if (!cancelled) {
          setProgress((current) => ({
            ...current,
            currentLessonId
          }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [controlledProgress, courseSlug, currentLessonId]);

  const groupedLessons = useMemo(() => {
    const groups = new Map<string, { title: string; lessons: typeof lessons }>();

    for (const lesson of lessons) {
      const key = lesson.module?.id ?? "ungrouped";
      const title =
        lesson.module?.title ?? (locale === "uz" ? "Asosiy darslar" : "Core lessons");

      if (!groups.has(key)) {
        groups.set(key, { title, lessons: [] });
      }

      groups.get(key)!.lessons.push(lesson);
    }

    return Array.from(groups.values());
  }, [lessons, locale]);

  return (
    <Card className="overflow-hidden border-border/70 bg-card">
      <CardContent className="space-y-5 p-5">
        {groupedLessons.map((group) => (
          <div key={group.title} className="space-y-3">
            <p className="eyebrow-label text-muted-foreground">{group.title}</p>
            <div className="space-y-2">
              {group.lessons.map((lesson, index) => {
                const absoluteIndex = lessons.findIndex((item) => item.id === lesson.id);
                const previousLessonId = absoluteIndex > 0 ? lessons[absoluteIndex - 1]?.id : null;
                const isCompleted = activeProgress.completedLessonIds.includes(lesson.id);
                const isActive = lesson.id === currentLessonId || lesson.slug === currentLessonSlug;
                const isLocked =
                  Boolean(previousLessonId) &&
                  !activeProgress.completedLessonIds.includes(previousLessonId!) &&
                  !isActive;
                const badgeLabel = isCompleted
                  ? locale === "uz"
                    ? "Bajarildi"
                    : "Completed"
                  : isLocked
                    ? locale === "uz"
                      ? "Yopiq"
                      : "Locked"
                    : isActive || activeProgress.currentLessonId === lesson.id
                      ? locale === "uz"
                        ? "Davom etmoqda"
                        : "In progress"
                      : locale === "uz"
                        ? "Tayyor"
                        : "Ready";

                return (
                  <Link
                    key={lesson.id}
                    href={isLocked ? "#" : `/courses/${courseSlug}/lessons/${lesson.slug}`}
                    className={cn(
                      "block rounded-lg border px-4 py-3 transition-colors",
                      isCompleted
                        ? "border-success/20 bg-success/5"
                        : isActive
                          ? "border-primary/25 bg-accent/60"
                          : "border-border/70 bg-secondary/25 hover:border-primary/20 hover:bg-accent/40",
                      isLocked && "pointer-events-none opacity-70"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                          {locale === "uz" ? "Dars" : "Lesson"} {lesson.position}
                        </p>
                        <p className="mt-1 text-sm font-medium text-foreground">{lesson.title}</p>
                      </div>
                      <div className="mt-0.5 shrink-0">
                        {isCompleted ? (
                          <CheckCircle2 className="h-4 w-4 text-success" />
                        ) : isLocked ? (
                          <Lock className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <CirclePlay className="h-4 w-4 text-primary" />
                        )}
                      </div>
                    </div>
                    <div className="mt-3 inline-flex rounded-full bg-card px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {badgeLabel}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export const LessonSidebar = memo(LessonSidebarComponent);
