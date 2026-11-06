import { NextRequest, NextResponse } from "next/server";

import { createApiErrorResponse } from "@/lib/app-errors";
import { prisma } from "@/lib/prisma";
import { assertRateLimit, getUserRateLimitKeyParts } from "@/lib/rate-limit";
import { retryOnDatabaseFailure } from "@/lib/server-data";
import { isValidId } from "@/lib/validation";
import {
  authErrors,
  requireAuthenticatedUser,
  requireCourseAccess,
  requireLessonAccess,
  toApiErrorResponse
} from "@/server/authz";
import { resolveMaterialDownloadUrl } from "@/server/storage";

type RouteProps = {
  params: Promise<{ materialId: string }>;
};

/**
 * Authorized material download. Access follows the lesson (or course, for course-level materials):
 * enrolled students, the owning teacher and admins. Authorized requests are redirected to a signed URL
 * that expires after a few minutes; the permanent storage location is never shown to the browser.
 */
export async function GET(_request: NextRequest, { params }: RouteProps) {
  try {
    const user = await requireAuthenticatedUser();
    const { materialId } = await params;
    if (!isValidId(materialId)) throw authErrors.notFound("Material not found.");

    await assertRateLimit({
      scope: "material-download",
      maxAttempts: 120,
      windowMs: 10 * 60_000,
      cooldownMs: 5 * 60_000,
      keyParts: getUserRateLimitKeyParts(user.id)
    });

    const material = await retryOnDatabaseFailure(() =>
      prisma.courseMaterial.findUnique({
        where: { id: materialId },
        select: { id: true, courseId: true, lessonId: true, fileUrl: true, storagePath: true }
      })
    );
    if (!material) throw authErrors.notFound("Material not found.");

    if (material.lessonId) {
      await requireLessonAccess(user, material.lessonId, { courseId: material.courseId });
    } else {
      await requireCourseAccess(user, material.courseId);
    }

    const target = await resolveMaterialDownloadUrl(material);
    if (!target) {
      return createApiErrorResponse(404, "not-found", "Material not found.");
    }

    const response = NextResponse.redirect(target, 302);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch (error) {
    return toApiErrorResponse(error, {
      code: "download-unavailable",
      message: "This file is temporarily unavailable.",
      log: "material-download"
    });
  }
}
