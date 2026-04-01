import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";

import { createApiErrorResponse, createApiSuccessResponse } from "@/lib/app-errors";
import { getCurrentUser } from "@/lib/auth";
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
    return createApiSuccessResponse({ authenticated: false, enrolled: false, canEnroll: false });
  }

  if (currentUser.role !== UserRole.STUDENT) {
    return createApiSuccessResponse({ authenticated: true, enrolled: false, canEnroll: false });
  }

  try {
    const { courseSlug } = await params;
    const course = await retryOnDatabaseFailure(() =>
      prisma.course.findFirst({
        where: {
          slug: courseSlug,
          status: "PUBLISHED"
        },
        select: {
          id: true
        }
      })
    );

    if (!course) {
      return createApiErrorResponse(404, "course-not-found", "Course not found.");
    }

    const enrollment = await retryOnDatabaseFailure(() =>
      prisma.enrollment.findUnique({
        where: {
          userId_courseId: {
            userId: currentUser.id,
            courseId: course.id
          }
        },
        select: {
          id: true
        }
      })
    );

    return createApiSuccessResponse({
      authenticated: true,
      enrolled: Boolean(enrollment),
      canEnroll: true
    });
  } catch {
    return createApiErrorResponse(
      503,
      "service-unavailable",
      "Enrollment status is temporarily unavailable.",
      { retryable: true }
    );
  }
}

export async function POST(_request: NextRequest, { params }: RouteProps) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return createApiErrorResponse(401, "auth-required", "Sign in to add courses to My Learning.");
  }

  if (currentUser.role !== UserRole.STUDENT) {
    return createApiErrorResponse(
      403,
      "student-only",
      "Only student accounts can add courses to My Learning."
    );
  }

  try {
    const { courseSlug } = await params;
    const course = await retryOnDatabaseFailure(() =>
      prisma.course.findFirst({
        where: {
          slug: courseSlug,
          status: "PUBLISHED"
        },
        select: {
          id: true
        }
      })
    );

    if (!course) {
      return createApiErrorResponse(404, "course-not-found", "Course not found.");
    }

    await retryOnDatabaseFailure(() =>
      prisma.enrollment.upsert({
        where: {
          userId_courseId: {
            userId: currentUser.id,
            courseId: course.id
          }
        },
        update: {},
        create: {
          userId: currentUser.id,
          courseId: course.id,
          progress: 0
        }
      })
    );

    return createApiSuccessResponse({
      authenticated: true,
      enrolled: true,
      canEnroll: true
    });
  } catch {
    return createApiErrorResponse(
      503,
      "service-unavailable",
      "Enrollment is temporarily unavailable.",
      { retryable: true }
    );
  }
}
