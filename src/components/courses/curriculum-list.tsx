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
  lessons: Array<{
    id: string;
    title: string;
    description: string | null;
    duration: string | null;
    position: number;
    videoUrl?: string | null;
    materials?: Array<{
      id: string;
      title: string;
      fileUrl: string;
    }>;
  }>;
  courseMaterials?: Array<{
    id: string;
    title: string;
    fileUrl: string;
  }>;
};

type ProgressState = {
  authenticated: boolean;
  canTrack: boolean;
  completedLessonIds: string[];
  progressPercent: number;
  completedLessons: number;
  totalLessons: number;
};

const initialProgressState: ProgressState = {
  authenticated: false,
  canTrack: false,
  completedLessonIds: [],
  progressPercent: 0,
  completedLessons: 0,
  totalLessons: 0
};

export function CurriculumList({
  courseSlug,
  locale,
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
          <div className="min-w-[220px] rounded-[1.5rem] border border-border/70 bg-secondary/35 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {t.courseDetail.progress}
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {progress.progressPercent}{t.courseDetail.completeSuffix}
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
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
          <div className="rounded-[1.5rem] border border-border/70 bg-white/80 px-4 py-4 text-sm leading-7 text-muted-foreground">
            {t.courseDetail.signInToSave}
            <Link
              href={`/sign-in?next=/courses/${courseSlug}`}
              className={cn(buttonVariants({ size: "sm", variant: "outline" }), "ml-3 h-9 px-3")}
            >
              {locale === "uz" ? "Kirish" : "Sign in"}
            </Link>
          </div>
        ) : progress.canTrack ? null : (
          <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-7 text-amber-800">
            {locale === "uz"
              ? "Progressni belgilash faqat talaba akkauntlari uchun mavjud."
              : "Progress tracking is available for student accounts only."}
          </div>
        )}

        {loadError ? (
          <div className="rounded-[1.5rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {loadError}
          </div>
        ) : null}

        {courseMaterials.length > 0 ? (
          <div className="rounded-[1.5rem] border border-border/70 bg-white/85 p-4">
            <p className="text-sm font-medium text-foreground">{t.courseDetail.courseMaterials}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {courseMaterials.map((material) => (
                <Link
                  key={material.id}
                  href={material.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9 px-3")}
                >
                  <Download className="h-4 w-4" />
                  {material.title}
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {lessons.map((lesson) => {
          const isCompleted = progress.completedLessonIds.includes(lesson.id);
          const isUpdating = isPending && pendingLessonId === lesson.id;

          return (
            <div
              key={lesson.id}
              className="rounded-[1.5rem] border border-border/70 bg-secondary/35 p-4"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white">
                    {isCompleted ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    ) : (
                      <PlayCircle className="h-5 w-5 text-primary" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
                      {t.courseDetail.lessonLabel} {lesson.position}
                    </p>
                    <h3 className="text-lg font-medium">{lesson.title}</h3>
                    {lesson.description ? (
                      <p className="text-sm leading-7 text-muted-foreground">{lesson.description}</p>
                    ) : null}
                    {lesson.materials && lesson.materials.length > 0 ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {lesson.materials.map((material) => (
                          <Link
                            key={material.id}
                            href={material.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className={cn(
                              buttonVariants({ variant: "outline", size: "sm" }),
                              "h-8 px-3 text-xs"
                            )}
                          >
                            <Download className="h-3.5 w-3.5" />
                            {material.title}
                          </Link>
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
                    {lesson.videoUrl ? (
                      <Link
                        href={lesson.videoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={cn(buttonVariants({ variant: "outline" }), "h-9 px-3 text-xs")}
                      >
                        {t.courseDetail.watchLesson}
                      </Link>
                    ) : null}
                    {progress.authenticated && progress.canTrack ? (
                      <Button
                        type="button"
                        size="sm"
                        variant={isCompleted ? "outline" : "default"}
                        onClick={() => handleToggleLesson(lesson.id)}
                        disabled={isUpdating}
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
      </CardContent>
    </Card>
  );
}
