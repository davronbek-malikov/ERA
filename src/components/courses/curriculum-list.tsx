"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Download, Loader2, PlayCircle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { getMessages, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type CurriculumListProps = {
  courseSlug: string;
  locale: Locale;
  modules?: Array<{
    id: string;
    title: string;
    description?: string | null;
    position: number;
  }>;
  lessons: Array<{
    id: string;
    slug: string;
    title: string;
    description: string | null;
    duration: string | null;
    position: number;
    moduleId?: string | null;
    module?: {
      id: string;
      title: string;
    } | null;
    /** Titles only: files open inside the authorized classroom. */
    materials?: Array<{
      id: string;
      title: string;
    }>;
  }>;
  courseMaterials?: Array<{
    id: string;
    title: string;
  }>;
};

type ProgressState = {
  authenticated: boolean;
  canTrack: boolean;
  completedLessonIds: string[];
  lessonProgressById: Record<string, number>;
  currentLessonId: string | null;
  progressPercent: number;
  completedLessons: number;
  totalLessons: number;
};

const initialProgressState: ProgressState = {
  authenticated: false,
  canTrack: false,
  completedLessonIds: [],
  lessonProgressById: {},
  currentLessonId: null,
  progressPercent: 0,
  completedLessons: 0,
  totalLessons: 0
};

export function CurriculumList({
  courseSlug,
  locale,
  modules = [],
  lessons,
  courseMaterials = []
}: CurriculumListProps) {
  const t = getMessages(locale);
  const progressLoadErrorMessage = t.courseDetail.couldNotLoadProgress;
  const progressUpdateErrorMessage = t.courseDetail.couldNotUpdateProgress;
  const [progress, setProgress] = useState<ProgressState>(initialProgressState);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingLessonId, setPendingLessonId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let isCancelled = false;

    async function loadProgress() {
      try {
        const response = await fetch(`/api/courses/${courseSlug}/progress`, {
          cache: "no-store"
        });
        const payload = (await response.json()) as ProgressState | { error: string };

        if (!response.ok || "error" in payload) {
          throw new Error(progressLoadErrorMessage);
        }

        if (!isCancelled) {
          setProgress(payload);
          setLoadError(null);
        }
      } catch (error) {
        if (!isCancelled) {
          setLoadError(
            error instanceof Error ? error.message : progressLoadErrorMessage
          );
        }
      }
    }

    loadProgress();

    return () => {
      isCancelled = true;
    };
  }, [courseSlug, progressLoadErrorMessage]);

  function handleToggleLesson(lessonId: string) {
    const isCompleted = progress.completedLessonIds.includes(lessonId);
    setPendingLessonId(lessonId);

    startTransition(() => {
      void (async () => {
        try {
          const response = await fetch(`/api/courses/${courseSlug}/progress`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              lessonId,
              completed: !isCompleted
            })
          });

          const payload = (await response.json()) as ProgressState | { error: string };

          if (!response.ok || "error" in payload) {
            throw new Error(
              "error" in payload ? payload.error : progressUpdateErrorMessage
            );
          }

          setProgress(payload);
          setLoadError(null);
        } catch (error) {
          setLoadError(
            error instanceof Error ? error.message : progressUpdateErrorMessage
          );
        } finally {
          setPendingLessonId(null);
        }
      })();
    });
  }

  const lessonGroups =
    modules.length > 0
      ? modules.map((module) => ({
          id: module.id,
          title: module.title,
          description: module.description ?? null,
          lessons: lessons.filter((lesson) => lesson.moduleId === module.id)
        }))
      : [
          {
            id: "all-lessons",
            title: locale === "uz" ? "Barcha darslar" : "All lessons",
            description: null,
            lessons
          }
        ];

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle className="text-3xl">{t.courseDetail.curriculum}</CardTitle>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              {t.courseDetail.curriculumDescription}
            </p>
          </div>
          <div className="min-w-[220px] rounded-xl border border-border/70 bg-secondary/35 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {t.courseDetail.progress}
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {progress.progressPercent}{t.courseDetail.completeSuffix}
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-card">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300"
                style={{ width: `${Math.max(progress.progressPercent, 0)}%` }}
              />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {progress.completedLessons} / {progress.totalLessons || lessons.length}{" "}
              {t.courseDetail.lessonsCompleted}
            </p>
          </div>
        </div>

        {!progress.authenticated ? (
          <div className="rounded-xl border border-border/70 bg-card/80 px-4 py-4 text-sm leading-7 text-muted-foreground">
            {t.courseDetail.signInToSave}
            <Link
              href={`/sign-in?next=/courses/${courseSlug}`}
              className={cn(buttonVariants({ size: "sm", variant: "outline" }), "ml-3 h-9 px-3")}
            >
              {locale === "uz" ? "Kirish" : "Sign in"}
            </Link>
          </div>
        ) : progress.canTrack ? null : (
          <div className="status-warning rounded-xl border px-4 py-4 text-sm leading-7">
            {locale === "uz"
              ? "Progressni belgilash faqat talaba akkauntlari uchun mavjud."
              : "Progress tracking is available for student accounts only."}
          </div>
        )}

        {loadError ? (
          <div className="status-error rounded-xl border px-4 py-3 text-sm">
            {loadError}
          </div>
        ) : null}

        {courseMaterials.length > 0 ? (
          <div className="rounded-xl border border-border/70 bg-card/85 p-4">
            <p className="text-sm font-medium text-foreground">{t.courseDetail.courseMaterials}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {/* Titles only: the files open inside the authorized classroom after enrolling. */}
              {courseMaterials.map((material) => (
                <span
                  key={material.id}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm text-foreground"
                >
                  <Download className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  {material.title}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {lessonGroups.map((group) => (
          <div key={group.id} className="space-y-4">
            <div className="rounded-xl border border-border/70 bg-card/80 px-4 py-4">
              <p className="eyebrow-label text-muted-foreground">{group.title}</p>
              {group.description ? (
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{group.description}</p>
              ) : null}
            </div>
            {group.lessons.map((lesson) => {
              const absoluteIndex = lessons.findIndex((item) => item.id === lesson.id);
              const previousLesson = absoluteIndex > 0 ? lessons[absoluteIndex - 1] : null;
              const isCompleted = progress.completedLessonIds.includes(lesson.id);
              const isUpdating = isPending && pendingLessonId === lesson.id;
              const isLocked =
                Boolean(previousLesson) && !progress.completedLessonIds.includes(previousLesson!.id);
              const isCurrent = progress.currentLessonId === lesson.id && !isCompleted;
              const badgeLabel = isCompleted
                ? locale === "uz"
                  ? "Bajarildi"
                  : "Completed"
                : isLocked
                  ? locale === "uz"
                    ? "Yopiq"
                    : "Locked"
                  : isCurrent
                    ? locale === "uz"
                      ? "Davom etmoqda"
                      : "In progress"
                    : locale === "uz"
                      ? "Tayyor"
                      : "Ready";

              return (
                <div
                  key={lesson.id}
                  className={cn(
                    "rounded-xl border p-4",
                    isCompleted
                      ? "border-success/20 bg-success/5"
                      : isCurrent
                        ? "border-primary/20 bg-accent/55"
                        : "border-border/70 bg-secondary/35"
                  )}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-card">
                        {isCompleted ? (
                          <CheckCircle2 className="h-5 w-5 text-success" />
                        ) : (
                          <PlayCircle className="h-5 w-5 text-primary" />
                        )}
                      </div>
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
                            {t.courseDetail.lessonLabel} {lesson.position}
                          </p>
                          <span className="rounded-full bg-card px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                            {badgeLabel}
                          </span>
                        </div>
                        <h3 className="text-lg font-medium">{lesson.title}</h3>
                        {lesson.description ? (
                          <p className="text-sm leading-7 text-muted-foreground">{lesson.description}</p>
                        ) : null}
                        <div className="max-w-xs">
                          <div className="h-2 overflow-hidden rounded-full bg-card">
                            <div
                              className="h-full rounded-full bg-primary transition-[width] duration-300"
                              style={{ width: `${progress.lessonProgressById[lesson.id] ?? 0}%` }}
                            />
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {progress.lessonProgressById[lesson.id] ?? 0}%
                          </p>
                        </div>
                        {lesson.materials && lesson.materials.length > 0 ? (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {lesson.materials.map((material) => (
                              <span
                                key={material.id}
                                className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-surface px-3 text-xs text-foreground"
                              >
                                <Download className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                                {material.title}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
                      <span className="text-sm text-muted-foreground">
                        {lesson.duration ?? (locale === "uz" ? "Video" : "Video")}
                      </span>
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={isLocked ? "#" : `/courses/${courseSlug}/lessons/${lesson.slug}`}
                          className={cn(
                            buttonVariants({ variant: "outline" }),
                            "h-9 px-3 text-xs",
                            isLocked && "pointer-events-none opacity-60"
                          )}
                        >
                          {locale === "uz" ? "Darsni ochish" : "Open lesson"}
                        </Link>
                        {progress.authenticated && progress.canTrack ? (
                          <Button
                            type="button"
                            size="sm"
                            variant={isCompleted ? "outline" : "default"}
                            onClick={() => handleToggleLesson(lesson.id)}
                            disabled={isUpdating || isLocked}
                            className="h-9 px-3 text-xs"
                          >
                            {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            {isCompleted ? t.courseDetail.completed : t.courseDetail.markComplete}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
