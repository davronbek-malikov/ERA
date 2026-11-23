import { ActivityType, PublicationStatus, UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { createApiErrorResponse, createApiSuccessResponse } from "@/lib/app-errors";
import { getCurrentUser } from "@/lib/auth";
import { optionalBoolean, optionalId, readJsonObject } from "@/lib/validation";
import { assertSameOrigin, requireStudentEnrollment, requireStudentUser, toApiErrorResponse } from "@/server/authz";
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

    const isEnrolled = await retryOnDatabaseFailure(() =>
      prisma.enrollment.findUnique({
        where: { userId_courseId: { userId: currentUser.id, courseId: course.id } },
        select: { id: true }
      })
    );

    if (!isEnrolled) {
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

/**
 * Saves the signed-in student's own progress. Requires an existing enrollment (enrollment is created
 * only by the enroll API), and every lesson id must be a published lesson of this course.
 * Completion and resume position are written in one transaction.
 */
export async function POST(request: NextRequest, { params }: RouteProps) {
  try {
    assertSameOrigin(request);
    const currentUser = await requireStudentUser();
    const body = await readJsonObject(request, 4 * 1024);
    const lessonId = optionalId(body.lessonId, "lessonId");
    const currentLessonId = optionalId(body.currentLessonId, "currentLessonId");
    const completed = optionalBoolean(body.completed, "completed");

    if (!lessonId && !currentLessonId) {
      return createApiErrorResponse(400, "invalid-payload", "Invalid progress payload.");
    }
    if (completed !== undefined && !lessonId) {
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
            select: { id: true, title: true, duration: true }
          }
        }
      })
    );

    if (!course) {
      return createApiErrorResponse(404, "course-not-found", "Course not found.");
    }

    await requireStudentEnrollment(currentUser, course.id);

    const lessonsById = new Map(course.lessons.map((lesson) => [lesson.id, lesson]));
    const targetLesson = lessonId ? lessonsById.get(lessonId) : undefined;
    const lessonToResumeId = currentLessonId ?? lessonId ?? null;
    const resumeLesson = lessonToResumeId ? lessonsById.get(lessonToResumeId) : undefined;

    if ((lessonId && !targetLesson) || (lessonToResumeId && !resumeLesson)) {
      return createApiErrorResponse(400, "lesson-not-found", "Lesson not found in this course.");
    }

    await retryOnDatabaseFailure(() =>
      prisma.$transaction(async (tx) => {
        if (targetLesson && completed === true) {
          await tx.lessonCompletion.upsert({
            where: { userId_lessonId: { userId: currentUser.id, lessonId: targetLesson.id } },
            update: { completedAt: new Date() },
            create: { userId: currentUser.id, lessonId: targetLesson.id }
          });
        } else if (targetLesson && completed === false) {
          await tx.lessonCompletion.deleteMany({ where: { userId: currentUser.id, lessonId: targetLesson.id } });
        }

        if (resumeLesson) {
          await tx.enrollment.update({
            where: { userId_courseId: { userId: currentUser.id, courseId: course.id } },
            data: { currentLessonId: resumeLesson.id }
          });
        }
      })
    );

    if (targetLesson && completed === true) {
      await trackUserActivity({
        userId: currentUser.id,
        type: ActivityType.LESSON_COMPLETED,
        message: `Completed lesson: ${targetLesson.title}`,
        context: {
          courseId: course.id,
          lessonId: targetLesson.id,
          estimatedMinutes: parseDurationToMinutes(targetLesson.duration)
        }
      });
    }

    if (resumeLesson) {
      await trackUserActivity({
        userId: currentUser.id,
        type: ActivityType.STUDY_SESSION,
        message: `Opened lesson: ${resumeLesson.title}`,
        context: {
          courseId: course.id,
          lessonId: resumeLesson.id
        }
      });
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
  } catch (error) {
    return toApiErrorResponse(error, {
      code: "service-unavailable",
      message: "Course progress could not be updated.",
      log: "course-progress"
    });
  }
}
