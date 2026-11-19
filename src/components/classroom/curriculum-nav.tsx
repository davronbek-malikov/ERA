import Link from "next/link";
import { CheckCircle2, Circle, PlayCircle } from "lucide-react";

import { Progress } from "@/components/ui/feedback";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type CurriculumGroup = {
  id: string;
  title: string;
  lessons: Array<{ id: string; slug: string; title: string; duration: string | null; completed: boolean }>;
};

const copy = {
  en: { progress: (done: number, total: number) => `${done} of ${total} lessons completed`, label: "Course lessons", completed: "completed", current: "current lesson", lessons: "Lessons" },
  uz: { progress: (done: number, total: number) => `${total} ta darsdan ${done} tasi tugatildi`, label: "Kurs darslari", completed: "tugatilgan", current: "joriy dars", lessons: "Darslar" }
};

export function CurriculumNav({
  courseTitle,
  courseSlug,
  groups,
  currentSlug,
  completedCount,
  totalCount,
  locale,
  onNavigate
}: {
  courseTitle: string;
  courseSlug: string;
  groups: CurriculumGroup[];
  currentSlug: string;
  completedCount: number;
  totalCount: number;
  locale: Locale;
  onNavigate?: () => void;
}) {
  const t = copy[locale];
  const percent = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  return (
    <nav aria-label={t.label} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Link href={`/learn/courses/${courseSlug}`} className="card-title hover:text-primary" onClick={onNavigate}>
          {courseTitle}
        </Link>
        <Progress value={percent} label={t.progress(completedCount, totalCount)} />
        <p className="text-xs text-muted-foreground">{t.progress(completedCount, totalCount)}</p>
      </div>
      {groups.map((group) => (
        <div key={group.id} className="flex flex-col gap-1">
          <p className="px-2 text-xs font-medium text-muted-foreground">{group.title || t.lessons}</p>
          <ol className="flex flex-col gap-0.5">
            {group.lessons.map((lesson) => {
              const current = lesson.slug === currentSlug;
              return (
                <li key={lesson.id}>
                  <Link
                    href={`/learn/courses/${courseSlug}/lessons/${lesson.slug}`}
                    onClick={onNavigate}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "flex items-start gap-2 rounded-lg px-2 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      current ? "bg-primary/10 font-medium text-primary" : "text-foreground hover:bg-muted"
                    )}
                  >
                    {lesson.completed ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                    ) : current ? (
                      <PlayCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    ) : (
                      <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    )}
                    <span className="min-w-0 flex-1">
                      {lesson.title}
                      <span className="sr-only">
                        {lesson.completed ? `, ${t.completed}` : ""}
                        {current ? `, ${t.current}` : ""}
                      </span>
                    </span>
                    {lesson.duration ? <span className="shrink-0 text-xs text-muted-foreground">{lesson.duration}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </nav>
  );
}
