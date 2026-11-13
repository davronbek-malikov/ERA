"use client";

import { CheckCircle2 } from "lucide-react";

import { CourseEnrollmentButton } from "@/components/courses/course-enrollment-button";
import { getMessages, type Locale } from "@/lib/i18n";

type CourseEnrollmentPanelProps = {
  courseSlug: string;
  locale: Locale;
};

export function CourseEnrollmentPanel({ courseSlug, locale }: CourseEnrollmentPanelProps) {
  const t = getMessages(locale);
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border/70 bg-secondary/35 px-4 py-4 text-sm text-muted-foreground">
        {t.courseDetail.addDescription}
      </div>
      <CourseEnrollmentButton
        courseSlug={courseSlug}
        size="lg"
        fullWidth
        enrolledLabel={t.courseDetail.goToMyLearning}
        enrollLabel={t.courseDetail.addCta}
      />
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {t.courseDetail.selectedSeparate}
      </p>
    </div>
  );
}
