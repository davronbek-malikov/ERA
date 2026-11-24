import type { NextRequest } from "next/server";

import { createApiSuccessResponse } from "@/lib/app-errors";
import { readJsonObject, requireId } from "@/lib/validation";
import { assertSameOrigin, requireAuthenticatedUser, toApiErrorResponse } from "@/server/authz";
import { setGuidePublished } from "@/server/study/service";

type RouteProps = { params: Promise<{ lessonId: string }> };

/** Publish (students of the course can study it) or take back to draft. */
export async function POST(request: NextRequest, { params }: RouteProps) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const lessonId = requireId((await params).lessonId, "lessonId");
    const body = await readJsonObject(request, 1024);
    await setGuidePublished(user, lessonId, body.publish === true);
    return createApiSuccessResponse({ published: body.publish === true });
  } catch (error) {
    return toApiErrorResponse(error, { code: "publish-failed", message: "That didn't work. Please try again.", log: "study-publish" });
  }
}
