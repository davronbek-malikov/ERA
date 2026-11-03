import { ActivityType, PublicationStatus, UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { createApiErrorResponse, createApiSuccessResponse } from "@/lib/app-errors";
import { getCurrentUser } from "@/lib/auth";
import { parseDurationToMinutes } from "@/lib/format";
import { getEnrollmentProgressSummary, syncEnrollmentProgressForUser } from "@/lib/progress";
import { prisma } from "@/lib/prisma";
import { retryOnDatabaseFailure } from "@/lib/server-data";
import { syncGamificationForUser } from "@/server/gamification";
import { trackUserActivity } from "@/server/activity";
import { syncLearningPathProgressForUser } from "@/server/learning-paths";

type RouteProps = {
  params: Promise<{
    courseSlug: string;
  }>;
};

export async function GET(_request: NextRequest, { params }: RouteProps) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return createApiSuccessResponse({
      authenticated: false,
      canTrack: false,
      completedLessonIds: [],
      lessonProgressById: {},
      currentLessonId: null,
      progressPercent: 0,
      completedLessons: 0,
      totalLessons: 0
    });
  }

  try {
    const { courseSlug } = await params;
    const course = await retryOnDatabaseFailure(() =>
      prisma.course.findFirst({
        where: {
          slug: courseSlug,
          status: PublicationStatus.PUBLISHED
        },
        select: {
          id: true,
          lessons: {
            where: { status: PublicationStatus.PUBLISHED },
            select: { id: true }
          }
        }
      })
    );

    if (!course) {
      return createApiErrorResponse(404, "course-not-found", "Course not found.");
    }

    if (currentUser.role !== UserRole.STUDENT) {
      return createApiSuccessResponse({
        authenticated: true,
        canTrack: false,
        completedLessonIds: [],
        lessonProgressById: Object.fromEntries(course.lessons.map((lesson) => [lesson.id, 0])),
        currentLessonId: null,
        progressPercent: 0,
        completedLessons: 0,
        totalLessons: course.lessons.length
      });
    }

    const summary = await getEnrollmentProgressSummary(currentUser.id, course.id);
    const [completed, enrollment] = await Promise.all([
      retryOnDatabaseFailure(() =>
        prisma.lessonCompletion.findMany({
          where: {
            userId: currentUser.id,
            lesson: {
              courseId: course.id,
              status: PublicationStatus.PUBLISHED
            }
          },
          select: {
            lessonId: true
          }
        })
      ),
      retryOnDatabaseFailure(() =>
        prisma.enrollment.findUnique({
          where: {
            userId_courseId: {
              userId: currentUser.id,
              courseId: course.id
            }
          },
          select: {
            currentLessonId: true
          }
        })
      )
    ]);
    const completedIds = completed.map((entry) => entry.lessonId);

    return createApiSuccessResponse({
      authenticated: true,
      canTrack: true,
      completedLessonIds: completedIds,
      lessonProgressById: Object.fromEntries(
        course.lessons.map((lesson) => [lesson.id, completedIds.includes(lesson.id) ? 100 : 0])
      ),
      currentLessonId: enrollment?.currentLessonId ?? null,
      progressPercent: summary.progress,
      completedLessons: summary.completedLessons,
      totalLessons: summary.totalLessons
    });
  } catch {
    return createApiErrorResponse(
      503,
      "service-unavailable",
      "Course progress is temporarily unavailable.",
      { retryable: true }
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteProps) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return createApiErrorResponse(401, "auth-required", "Sign in to save progress.");
  }

  if (currentUser.role !== UserRole.STUDENT) {
    return createApiErrorResponse(
      403,
      "student-only",
      "Only student accounts can track lesson progress."
    );
  }

  try {
    const { lessonId, completed, currentLessonId } = (await request.json()) as {
      lessonId?: string;
      completed?: boolean;
      currentLessonId?: string;
    };

    if (!lessonId && !currentLessonId) {
      return createApiErrorResponse(400, "invalid-payload", "Invalid progress payload.");
    }

    const { courseSlug } = await params;
    const course = await retryOnDatabaseFailure(() =>
      prisma.course.findFirst({
        where: {
          slug: courseSlug,
          status: PublicationStatus.PUBLISHED
        },
        select: {
          id: true,
          lessons: {
            where: { status: PublicationStatus.PUBLISHED },
            select: { id: true }
          }
        }
      })
    );

    if (!course) {
      return createApiErrorResponse(404, "course-not-found", "Course not found.");
    }

    if (lessonId && !course.lessons.some((lesson) => lesson.id === lessonId)) {
      return createApiErrorResponse(400, "lesson-not-found", "Lesson not found in this course.");
    }

    if (lessonId && typeof completed === "boolean") {
      if (completed) {
        const completedLesson = await retryOnDatabaseFailure(() =>
          prisma.lesson.findUnique({
            where: {
              id: lessonId
            },
            select: {
              id: true,
              title: true,
              duration: true
            }
          })
        );

        await retryOnDatabaseFailure(() =>
          prisma.lessonCompletion.upsert({
            where: {
              userId_lessonId: {
                userId: currentUser.id,
                lessonId
              }
            },
            update: {
              completedAt: new Date()
            },
            create: {
              userId: currentUser.id,
              lessonId
            }
          })
        );

        if (completedLesson) {
          await trackUserActivity({
            userId: currentUser.id,
            type: ActivityType.LESSON_COMPLETED,
            message: `Completed lesson: ${completedLesson.title}`,
            context: {
              courseId: course.id,
              lessonId: completedLesson.id,
              estimatedMinutes: parseDurationToMinutes(completedLesson.duration)
            }
          });
        }
      } else {
        await retryOnDatabaseFailure(() =>
          prisma.lessonCompletion.deleteMany({
            where: {
              userId: currentUser.id,
              lessonId
            }
          })
        );
      }
    }

    const lessonToResume = currentLessonId ?? lessonId ?? null;

    if (lessonToResume) {
      const activeLesson = await retryOnDatabaseFailure(() =>
        prisma.lesson.findUnique({
          where: {
            id: lessonToResume
          },
          select: {
            id: true,
            title: true
          }
        })
      );

      await retryOnDatabaseFailure(() =>
        prisma.enrollment.upsert({
          where: {
            userId_courseId: {
              userId: currentUser.id,
              courseId: course.id
            }
          },
          update: {
            currentLessonId: lessonToResume
          },
          create: {
            userId: currentUser.id,
            courseId: course.id,
            currentLessonId: lessonToResume
          }
        })
      );

      if (activeLesson) {
        await trackUserActivity({
          userId: currentUser.id,
          type: ActivityType.STUDY_SESSION,
          message: `Opened lesson: ${activeLesson.title}`,
          context: {
            courseId: course.id,
            lessonId: activeLesson.id
          }
        });
      }
    }

    const summary = await syncEnrollmentProgressForUser(currentUser.id, course.id);
    await syncGamificationForUser(currentUser.id);
    await syncLearningPathProgressForUser(currentUser.id);
    const [completedLessonIds, enrollment] = await Promise.all([
      retryOnDatabaseFailure(() =>
        prisma.lessonCompletion.findMany({
          where: {
            userId: currentUser.id,
            lesson: {
              courseId: course.id,
              status: PublicationStatus.PUBLISHED
            }
          },
          select: {
            lessonId: true
          }
        })
      ),
      retryOnDatabaseFailure(() =>
        prisma.enrollment.findUnique({
          where: {
            userId_courseId: {
              userId: currentUser.id,
              courseId: course.id
            }
          },
          select: {
            currentLessonId: true
          }
        })
      )
    ]);
    const completedIds = completedLessonIds.map((entry) => entry.lessonId);
    revalidatePath("/my-learning");
    revalidatePath("/learning-paths");

    return createApiSuccessResponse({
      authenticated: true,
      canTrack: true,
      completedLessonIds: completedIds,
      lessonProgressById: Object.fromEntries(
        course.lessons.map((lesson) => [lesson.id, completedIds.includes(lesson.id) ? 100 : 0])
      ),
      currentLessonId: enrollment?.currentLessonId ?? null,
      progressPercent: summary.progress,
      completedLessons: summary.completedLessons,
      totalLessons: summary.totalLessons
    });
  } catch {
    return createApiErrorResponse(
      503,
      "service-unavailable",
      "Course progress could not be updated.",
      { retryable: true }
    );
  }
}
