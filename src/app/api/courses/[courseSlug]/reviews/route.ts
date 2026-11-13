import { revalidatePath } from "next/cache";
import { NextRequest } from "next/server";

import { createApiErrorResponse, createApiSuccessResponse } from "@/lib/app-errors";
import { prisma } from "@/lib/prisma";
import { retryOnDatabaseFailure } from "@/lib/server-data";
import { readJsonObject } from "@/lib/validation";
import { assertSameOrigin, requireStudentEnrollment, requireStudentUser, toApiErrorResponse } from "@/server/authz";

const MAX_REVIEW_LENGTH = 2000;

type RouteProps = {
  params: Promise<{
    courseSlug: string;
  }>;
};

/** Reviews come only from students enrolled in the (published) course. One review per student, editable. */
export async function POST(request: NextRequest, { params }: RouteProps) {
  try {
    assertSameOrigin(request);
    const currentUser = await requireStudentUser();
    const { courseSlug } = await params;
    const body = await readJsonObject(request, 16 * 1024);

    const rating = Number(body.rating);
    const comment = typeof body.comment === "string" ? body.comment.trim() : "";

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return createApiErrorResponse(400, "invalid-rating", "Choose a rating from 1 to 5.");
    }

    if (comment.length < 8) {
      return createApiErrorResponse(400, "invalid-comment", "Write a slightly longer review comment.");
    }

    if (comment.length > MAX_REVIEW_LENGTH) {
      return createApiErrorResponse(400, "comment-too-long", `Reviews must be ${MAX_REVIEW_LENGTH} characters or less.`);
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

    await requireStudentEnrollment(currentUser, course.id);

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
  } catch (error) {
    return toApiErrorResponse(error, {
      code: "review-save-failed",
      message: "The review could not be saved right now.",
      log: "course-review"
    });
  }
}
