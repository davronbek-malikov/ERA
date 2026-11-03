"use client";

import { useEffect } from "react";

type LessonResumeTrackerProps = {
  courseSlug: string;
  lessonId: string;
};

export function LessonResumeTracker({ courseSlug, lessonId }: LessonResumeTrackerProps) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetch(`/api/courses/${courseSlug}/progress`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          currentLessonId: lessonId
        }),
        keepalive: true
      });
    }, 1200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [courseSlug, lessonId]);

  return null;
}
