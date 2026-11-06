import { Eye, ShieldCheck } from "lucide-react";

import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * The three ways a lesson can be shown (docs/ERA_INFORMATION_ARCHITECTURE.md §2.1, §5.2 S5):
 * - "student": Student Lesson Mode. Enrolled student, progress saved, ERA Tutor available. No banner.
 * - "teacher-preview": the owning teacher sees what students see. Not an enrollment:
 *   nothing is saved and the Student ERA Tutor is off.
 * - "admin-inspection": an admin reviewing a course from the Admin Workspace, separate
 *   from the Teacher Workspace.
 *
 * The mode is decided by the server from the user's relationship to the course. The
 * banner only explains it.
 */
export type LessonMode = "student" | "teacher-preview" | "admin-inspection";

const copy = {
  en: {
    "teacher-preview": {
      title: "Teacher preview",
      body: "You're seeing this lesson as your students will. You aren't enrolled, nothing you do here is saved, and ERA Tutor is turned off."
    },
    "admin-inspection": {
      title: "Admin inspection",
      body: "You're viewing this course as an administrator, outside the Teacher Workspace. Changes you make here affect the teacher's live course."
    }
  },
  uz: {
    "teacher-preview": {
      title: "O'qituvchi ko'rinishi",
      body: "Siz bu darsni o'quvchilaringiz ko'radigandek ko'ryapsiz. Siz kursga yozilmagansiz, bu yerdagi harakatlar saqlanmaydi va ERA Tutor o'chirilgan."
    },
    "admin-inspection": {
      title: "Administrator tekshiruvi",
      body: "Siz bu kursni administrator sifatida, O'qituvchi ish maydonidan tashqarida ko'ryapsiz. Bu yerdagi o'zgarishlar o'qituvchining amaldagi kursiga ta'sir qiladi."
    }
  }
} as const;

export function LessonModeBanner({
  mode,
  locale = "en",
  action,
  className
}: {
  mode: LessonMode;
  locale?: Locale;
  /** For example "Exit preview" or "Back to admin". */
  action?: React.ReactNode;
  className?: string;
}) {
  if (mode === "student") {
    return null;
  }

  const t = copy[locale][mode];
  const isPreview = mode === "teacher-preview";

  return (
    <div
      role="status"
      className={cn(
        "flex flex-col gap-3 border-b px-4 py-3 text-sm sm:flex-row sm:items-center md:px-6",
        isPreview ? "border-accent-strong/20 bg-accent text-accent-foreground" : "border-warning/30 bg-warning/10 text-warning-foreground",
        className
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2">
        {isPreview ? (
          <Eye className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        ) : (
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        )}
        <p>
          <span className="font-semibold">{t.title}.</span> {t.body}
        </p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
