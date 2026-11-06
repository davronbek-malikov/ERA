import { Badge } from "@/components/ui/badge";
import type { Locale } from "@/lib/i18n";

/** Matches the PublicationStatus enum in prisma/schema.prisma. */
export type CourseStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

const labels = {
  en: { DRAFT: "Draft", PUBLISHED: "Published", ARCHIVED: "Archived" },
  uz: { DRAFT: "Qoralama", PUBLISHED: "Nashr etilgan", ARCHIVED: "Arxivlangan" }
} as const;

const variants = { DRAFT: "neutral", PUBLISHED: "success", ARCHIVED: "outline" } as const;

export function CourseStatusBadge({ status, locale = "en" }: { status: CourseStatus; locale?: Locale }) {
  return <Badge variant={variants[status]}>{labels[locale][status]}</Badge>;
}

/**
 * User-facing consequences of a status change, shown in the confirmation dialog.
 * Unpublishing and archiving are deliberately different, and neither deletes student
 * progress, submissions or history. Student access after unpublishing follows OD-4,
 * a provisional product decision: confirm it before relying on this copy.
 */
export type CourseStatusChange = "publish" | "unpublish" | "archive" | "restore";

const consequences = {
  en: {
    publish: [
      "The course appears in the catalog.",
      "Students can enroll."
    ],
    unpublish: [
      "The course is hidden from the catalog and new students can't enroll.",
      "Students who are already enrolled keep access.",
      "Nothing is deleted. You can publish again at any time."
    ],
    archive: [
      "The course is removed from the catalog and from your active courses.",
      "Enrolled students can no longer open lessons.",
      "Their progress, submissions and grades are kept and stay visible in their results.",
      "You can restore the course later."
    ],
    restore: [
      "The course returns to your courses as a draft.",
      "Students regain access only when you publish it again."
    ]
  },
  uz: {
    publish: [
      "Kurs katalogda ko'rinadi.",
      "O'quvchilar kursga yozilishi mumkin."
    ],
    unpublish: [
      "Kurs katalogdan yashiriladi va yangi o'quvchilar yozila olmaydi.",
      "Allaqachon yozilgan o'quvchilar kursdan foydalanishda davom etadi.",
      "Hech narsa o'chirilmaydi. Istalgan vaqtda qayta nashr qilishingiz mumkin."
    ],
    archive: [
      "Kurs katalogdan va faol kurslaringizdan olib tashlanadi.",
      "Yozilgan o'quvchilar endi darslarni ocha olmaydi.",
      "Ularning natijalari, topshiriqlari va baholari saqlanadi va natijalar bo'limida ko'rinib turadi.",
      "Kursni keyinroq tiklashingiz mumkin."
    ],
    restore: [
      "Kurs qoralama sifatida kurslaringizga qaytadi.",
      "O'quvchilar faqat qayta nashr qilganingizdan keyin kirish huquqini oladi."
    ]
  }
} as const;

export function CourseStatusConsequences({ change, locale = "en" }: { change: CourseStatusChange; locale?: Locale }) {
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-foreground marker:text-muted-foreground">
      {consequences[locale][change].map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}
