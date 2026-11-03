import { PublicationStatus } from "@prisma/client";

import { demoCourses, demoEnrollments, demoLessons } from "@/lib/demo-data";
import { parseDurationToMinutes } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { withDatabaseFallback } from "@/lib/server-data";

type AnalyticsCourseProgress = {
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  progressPercent: number;
  completedLessons: number;
  totalLessons: number;
};

type AnalyticsWeakArea = {
  id: string;
  title: string;
  reason: string;
  metricLabel: string;
  metricValue: string;
};

type AnalyticsActivityPoint = {
  label: string;
  minutes: number;
};

export type StudentAnalyticsSummary = {
  totalLearningMinutes: number;
  completedLessons: number;
  activeCourses: number;
  averageProgress: number;
  courseProgress: AnalyticsCourseProgress[];
  weakAreas: AnalyticsWeakArea[];
  weeklyActivity: AnalyticsActivityPoint[];
};

function toDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDayLabel(date: Date) {
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

function buildRecentDaysWindow(days: number) {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - (days - 1));

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return date;
  });
}

function createWeakAreas(args: {
  courseProgress: AnalyticsCourseProgress[];
  failedPracticeByLesson: Map<string, number>;
  lessonMetaById: Map<string, { title: string; courseTitle: string }>;
}) {
  const weakAreas: AnalyticsWeakArea[] = [];

  for (const course of args.courseProgress) {
    if (course.progressPercent < 50) {
      weakAreas.push({
        id: `course-${course.courseId}`,
        title: course.courseTitle,
        reason: "Progress is still below the halfway mark.",
        metricLabel: "Course progress",
        metricValue: `${course.progressPercent}%`
      });
    }
  }

  for (const [lessonId, failedCount] of args.failedPracticeByLesson.entries()) {
    const lesson = args.lessonMetaById.get(lessonId);

    if (!lesson || failedCount <= 0) {
      continue;
    }

    weakAreas.push({
      id: `practice-${lessonId}`,
      title: lesson.title,
      reason: `Practice attempts are still failing in ${lesson.courseTitle}.`,
      metricLabel: "Failed checks",
      metricValue: `${failedCount}`
    });
  }

  return weakAreas.slice(0, 4);
}

export async function getStudentAnalyticsSummary(userId: string): Promise<StudentAnalyticsSummary> {
  return withDatabaseFallback(
    async () => {
      const [enrollments, completions, practiceSubmissions, activityLogs] = await Promise.all([
        prisma.enrollment.findMany({
          where: {
            userId
          },
          orderBy: [{ updatedAt: "desc" }],
          include: {
            course: {
              select: {
                id: true,
                slug: true,
                title: true,
                lessons: {
                  where: {
                    status: PublicationStatus.PUBLISHED
                  },
                  select: {
                    id: true
                  }
                }
              }
            }
          }
        }),
        prisma.lessonCompletion.findMany({
          where: {
            userId,
            lesson: {
              status: PublicationStatus.PUBLISHED
            }
          },
          select: {
            completedAt: true,
            lesson: {
              select: {
                id: true,
                title: true,
                duration: true,
                course: {
                  select: {
                    id: true,
                    title: true
                  }
                }
              }
            }
          }
        }),
        prisma.practiceSubmission.findMany({
          where: {
            userId
          },
          select: {
            status: true,
            exercise: {
              select: {
                lesson: {
                  select: {
                    id: true,
                    title: true,
                    course: {
                      select: {
                        title: true
                      }
                    }
                  }
                }
              }
            }
          }
        }),
        prisma.activityLog.findMany({
          where: {
            userId
          },
          orderBy: [{ createdAt: "desc" }],
          take: 200,
          select: {
            type: true,
            context: true,
            createdAt: true
          }
        })
      ]);

      const completionCountsByCourseId = new Map<string, number>();
      const lessonMetaById = new Map<string, { title: string; courseTitle: string }>();

      for (const completion of completions) {
        completionCountsByCourseId.set(
          completion.lesson.course.id,
          (completionCountsByCourseId.get(completion.lesson.course.id) ?? 0) + 1
        );
        lessonMetaById.set(completion.lesson.id, {
          title: completion.lesson.title,
          courseTitle: completion.lesson.course.title
        });
      }

      for (const submission of practiceSubmissions) {
        lessonMetaById.set(submission.exercise.lesson.id, {
          title: submission.exercise.lesson.title,
          courseTitle: submission.exercise.lesson.course.title
        });
      }

      const courseProgress = enrollments.map((enrollment) => ({
        courseId: enrollment.course.id,
        courseTitle: enrollment.course.title,
        courseSlug: enrollment.course.slug,
        progressPercent: enrollment.progress,
        completedLessons: completionCountsByCourseId.get(enrollment.course.id) ?? 0,
        totalLessons: enrollment.course.lessons.length
      }));

      const averageProgress =
        courseProgress.length > 0
          ? Math.round(
              courseProgress.reduce((sum, course) => sum + course.progressPercent, 0) /
                courseProgress.length
            )
          : 0;

      const failedPracticeByLesson = new Map<string, number>();

      for (const submission of practiceSubmissions) {
        if (submission.status === "FAILED") {
          const lessonId = submission.exercise.lesson.id;
          failedPracticeByLesson.set(lessonId, (failedPracticeByLesson.get(lessonId) ?? 0) + 1);
        }
      }

      const weeklyWindow = buildRecentDaysWindow(7);
      const minutesByDay = new Map(weeklyWindow.map((date) => [toDayKey(date), 0]));

      for (const activity of activityLogs) {
        const key = toDayKey(activity.createdAt);

        if (!minutesByDay.has(key)) {
          continue;
        }

        const context =
          activity.context && typeof activity.context === "object" && !Array.isArray(activity.context)
            ? (activity.context as { estimatedMinutes?: unknown })
            : null;
        const minutes =
          typeof context?.estimatedMinutes === "number"
            ? context.estimatedMinutes
            : activity.type === "PRACTICE_SUBMITTED"
              ? 10
              : activity.type === "STUDY_SESSION"
                ? 5
                : 0;

        minutesByDay.set(key, (minutesByDay.get(key) ?? 0) + minutes);
      }

      const completionMinutes = completions.reduce(
        (sum, completion) => sum + parseDurationToMinutes(completion.lesson.duration),
        0
      );
      const loggedMinutes = Array.from(minutesByDay.values()).reduce((sum, value) => sum + value, 0);

      return {
        totalLearningMinutes: Math.max(completionMinutes, loggedMinutes),
        completedLessons: completions.length,
        activeCourses: enrollments.length,
        averageProgress,
        courseProgress,
        weakAreas: createWeakAreas({
          courseProgress,
          failedPracticeByLesson,
          lessonMetaById
        }),
        weeklyActivity: weeklyWindow.map((date) => ({
          label: formatDayLabel(date),
          minutes: minutesByDay.get(toDayKey(date)) ?? 0
        }))
      };
    },
    () => {
      const enrollments = demoEnrollments.filter((entry) => entry.userId === userId);
      const courseProgress = enrollments.map((enrollment) => {
        const course = demoCourses.find((item) => item.id === enrollment.courseId)!;
        const lessons = demoLessons.filter((lesson) => lesson.courseId === course.id);
        return {
          courseId: course.id,
          courseTitle: course.title,
          courseSlug: course.slug,
          progressPercent: enrollment.progress,
          completedLessons: Math.round((enrollment.progress / 100) * lessons.length),
          totalLessons: lessons.length
        };
      });

      return {
        totalLearningMinutes: courseProgress.reduce((sum, course) => {
          const lessons = demoLessons.filter((lesson) => lesson.courseId === course.courseId);
          return (
            sum +
            lessons
              .slice(0, course.completedLessons)
              .reduce((lessonSum, lesson) => lessonSum + parseDurationToMinutes(lesson.duration), 0)
          );
        }, 0),
        completedLessons: courseProgress.reduce((sum, course) => sum + course.completedLessons, 0),
        activeCourses: courseProgress.length,
        averageProgress:
          courseProgress.length > 0
            ? Math.round(
                courseProgress.reduce((sum, course) => sum + course.progressPercent, 0) /
                  courseProgress.length
              )
            : 0,
        courseProgress,
        weakAreas: courseProgress
          .filter((course) => course.progressPercent < 50)
          .map((course) => ({
            id: `demo-${course.courseId}`,
            title: course.courseTitle,
            reason: "Progress is still below the halfway mark.",
            metricLabel: "Course progress",
            metricValue: `${course.progressPercent}%`
          }))
          .slice(0, 3),
        weeklyActivity: [
          { label: "Mon", minutes: 20 },
          { label: "Tue", minutes: 35 },
          { label: "Wed", minutes: 15 },
          { label: "Thu", minutes: 45 },
          { label: "Fri", minutes: 25 },
          { label: "Sat", minutes: 40 },
          { label: "Sun", minutes: 30 }
        ]
      };
    },
    { context: "student-analytics-summary" }
  );
}
