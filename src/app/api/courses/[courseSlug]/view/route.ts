import { NextRequest } from "next/server";
import { PublicationStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { createApiSuccessResponse } from "@/lib/app-errors";
import { prisma } from "@/lib/prisma";
import { retryOnDatabaseFailure } from "@/lib/server-data";

type RouteProps = {
  params: Promise<{
    courseSlug: string;
  }>;
};

export async function POST(_request: NextRequest, { params }: RouteProps) {
  try {
    const { courseSlug } = await params;
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

    revalidatePath("/");
    return createApiSuccessResponse({ tracked: true }, 202);
  } catch {
    return createApiSuccessResponse({ tracked: false }, 200);
  }
}
