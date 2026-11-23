import { NextRequest } from "next/server";
import { PublicationStatus } from "@prisma/client";

import { createApiSuccessResponse } from "@/lib/app-errors";
import { prisma } from "@/lib/prisma";
import { assertRateLimit, getRequestRateLimitKeyParts } from "@/lib/rate-limit";
import { retryOnDatabaseFailure } from "@/lib/server-data";

type RouteProps = {
  params: Promise<{
    courseSlug: string;
  }>;
};

/**
 * Public course view counter. Anonymous by design, so it is de-duplicated per client and course
 * (one view per 30 minutes) and no longer triggers a cache revalidation on every call.
 * It always answers 200/202 so the page never shows an error for analytics.
 */
export async function POST(_request: NextRequest, { params }: RouteProps) {
  try {
    const { courseSlug } = await params;
    if (!/^[a-z0-9-]{1,160}$/.test(courseSlug)) {
      return createApiSuccessResponse({ tracked: false }, 200);
    }

    const [ip] = await getRequestRateLimitKeyParts();
    try {
      await assertRateLimit({
        scope: "course-view",
        maxAttempts: 1,
        windowMs: 30 * 60_000,
        cooldownMs: 30 * 60_000,
        keyParts: [`${ip}:${courseSlug}`]
      });
    } catch {
      return createApiSuccessResponse({ tracked: false }, 200);
    }

    const course = await retryOnDatabaseFailure(() =>
      prisma.course.findFirst({
        where: {
          slug: courseSlug,
          status: PublicationStatus.PUBLISHED
        },
        select: {
          id: true
        }
      })
    );

    if (!course) {
      return createApiSuccessResponse({ tracked: false }, 200);
    }

    await retryOnDatabaseFailure(() =>
      prisma.$transaction([
        prisma.course.update({
          where: {
            id: course.id
          },
          data: {
            viewCount: {
              increment: 1
            }
          }
        }),
        prisma.courseViewEvent.create({
          data: {
            courseId: course.id
          }
        })
      ])
    );

    return createApiSuccessResponse({ tracked: true }, 202);
  } catch {
    return createApiSuccessResponse({ tracked: false }, 200);
  }
}
