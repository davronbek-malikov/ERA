import { FileText } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Knowledge Base sources under an AI answer (Prompt 09). Each entry is a passage that was actually retrieved and given
 * to the model; entries the answer cites ([S1] …) come first. Titles, pages and course/lesson names only — never
 * storage paths or passage text the user didn't ask to see.
 */
export type SourceView = {
  label: string;
  title: string;
  filename: string;
  pageStart: number | null;
  pageEnd: number | null;
  heading: string | null;
  courseTitle: string | null;
  lessonTitle: string | null;
  cited?: boolean;
};

function pages(source: SourceView) {
  if (source.pageStart === null) return null;
  return source.pageEnd && source.pageEnd !== source.pageStart ? `pages ${source.pageStart}–${source.pageEnd}` : `page ${source.pageStart}`;
}

export function SourceList({ sources, className, heading = "Sources" }: { sources?: SourceView[] | null; className?: string; heading?: string }) {
  if (!sources?.length) return null;
  const ordered = [...sources].sort((a, b) => Number(Boolean(b.cited)) - Number(Boolean(a.cited)));
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <p className="text-xs font-medium text-muted-foreground">{heading}</p>
      <ul className="flex flex-col gap-1" aria-label={heading}>
        {ordered.map((source) => {
          const detail = [
            source.filename !== source.title ? source.filename : null,
            pages(source),
            source.heading,
            source.lessonTitle ? `Lesson: ${source.lessonTitle}` : source.courseTitle ? `Course: ${source.courseTitle}` : null
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <li key={`${source.label}-${source.title}`} className="flex items-start gap-2 rounded-md border border-border px-2 py-1.5 text-xs">
              <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0">
                <span className="font-medium text-foreground">
                  [{source.label}] {source.title}
                </span>
                {detail ? <span className="block text-muted-foreground">{detail}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
