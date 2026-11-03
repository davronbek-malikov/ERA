"use client";

import { useEffect } from "react";

type CourseViewTrackerProps = {
  courseSlug: string;
};

const VIEW_TTL_MS = 30 * 60 * 1000;

export function CourseViewTracker({ courseSlug }: CourseViewTrackerProps) {
  useEffect(() => {
    const storageKey = `era-course-view:${courseSlug}`;
    const lastTrackedAt = window.sessionStorage.getItem(storageKey);

    if (lastTrackedAt && Date.now() - Number(lastTrackedAt) < VIEW_TTL_MS) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const url = `/api/courses/${courseSlug}/view`;
      const payload = JSON.stringify({ source: "course-page" });

      try {
        if (navigator.sendBeacon) {
          const blob = new Blob([payload], { type: "application/json" });
          navigator.sendBeacon(url, blob);
        } else {
          fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: payload,
            keepalive: true
          }).catch(() => undefined);
        }

        window.sessionStorage.setItem(storageKey, String(Date.now()));
      } catch {
        // Ignore tracking failures so page viewing never breaks.
      }
    }, 1500);

    return () => window.clearTimeout(timeoutId);
  }, [courseSlug]);

  return null;
}
