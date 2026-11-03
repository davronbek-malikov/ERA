import { revalidatePath } from "next/cache";
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

export async function POST(request: NextRequest, { params }: RouteProps) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return createApiErrorResponse(401, "auth-required", "Sign in to leave a review.");
  }

  try {
    const { courseSlug } = await params;
    const body = (await request.json()) as {
      rating?: number;
      comment?: string;
    };

    const rating = Number(body.rating);
    const comment = body.comment?.trim() ?? "";

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return createApiErrorResponse(400, "invalid-rating", "Choose a rating from 1 to 5.");
    }

    if (comment.length < 8) {
      return createApiErrorResponse(400, "invalid-comment", "Write a slightly longer review comment.");
    }

    const course = await retryOnDatabaseFailure(() =>
      prisma.course.findUnique({
        where: {
          slug: courseSlug
        },
        select: {
          id: true
        }
      })
    );

    if (!course) {
      return createApiErrorResponse(404, "course-not-found", "Course not found.");
    }

    const review = await retryOnDatabaseFailure(() =>
      prisma.courseReview.upsert({
        where: {
          userId_courseId: {
            userId: currentUser.id,
            courseId: course.id
          }
        },
        update: {
          rating,
          comment
        },
        create: {
          userId: currentUser.id,
          courseId: course.id,
          rating,
          comment
        },
        include: {
          user: {
            select: {
              id: true,
              name: true
            }
          }
        }
      })
    );

    const aggregate = await retryOnDatabaseFailure(() =>
      prisma.courseReview.aggregate({
        where: {
          courseId: course.id
        },
        _avg: {
          rating: true
        },
        _count: {
          _all: true
        }
      })
    );

    revalidatePath("/courses");
    revalidatePath("/");
    revalidatePath(`/courses/${courseSlug}`);

    return createApiSuccessResponse({
      review: {
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt.toISOString(),
        updatedAt: review.updatedAt.toISOString(),
        user: review.user
      },
      averageRating: aggregate._avg.rating ?? null,
      reviewCount: aggregate._count._all
    });
  } catch {
    return createApiErrorResponse(503, "review-save-failed", "The review could not be saved right now.");
  }
}
