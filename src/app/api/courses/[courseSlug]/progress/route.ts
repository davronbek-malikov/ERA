import { PublicationStatus, UserRole } from "@prisma/client";
import { NextRequest } from "next/server";

import { createApiErrorResponse, createApiSuccessResponse } from "@/lib/app-errors";
import { getCurrentUser } from "@/lib/auth";
import { getEnrollmentProgressSummary, syncEnrollmentProgressForUser } from "@/lib/progress";
import { prisma } from "@/lib/prisma";
import { retryOnDatabaseFailure } from "@/lib/server-data";

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
        progressPercent: 0,
        completedLessons: 0,
        totalLessons: course.lessons.length
      });
    }

    const summary = await getEnrollmentProgressSummary(currentUser.id, course.id);
    const completed = await retryOnDatabaseFailure(() =>
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
    );

    return createApiSuccessResponse({
      authenticated: true,
      canTrack: true,
      completedLessonIds: completed.map((entry) => entry.lessonId),
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
    const { lessonId, completed } = (await request.json()) as {
      lessonId?: string;
      completed?: boolean;
    };

    if (!lessonId || typeof completed !== "boolean") {
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

    if (!course.lessons.some((lesson) => lesson.id === lessonId)) {
      return createApiErrorResponse(400, "lesson-not-found", "Lesson not found in this course.");
    }

    if (completed) {
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

    const summary = await syncEnrollmentProgressForUser(currentUser.id, course.id);
    const completedLessonIds = await retryOnDatabaseFailure(() =>
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
    );

    return createApiSuccessResponse({
      authenticated: true,
      canTrack: true,
      completedLessonIds: completedLessonIds.map((entry) => entry.lessonId),
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
