import type { NextRequest } from "next/server";

import { createApiSuccessResponse } from "@/lib/app-errors";
import { invalid, readJsonObject, requireId } from "@/lib/validation";
import { assertSameOrigin, requireAuthenticatedUser, toApiErrorResponse } from "@/server/authz";
import { isStudyLanguage } from "@/server/study/content";
import { saveGuide } from "@/server/study/service";

type RouteProps = { params: Promise<{ lessonId: string }> };

/** Saves the teacher's edits of one language. The guide becomes a draft until it is published again. */
export async function PUT(request: NextRequest, { params }: RouteProps) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const lessonId = requireId((await params).lessonId, "lessonId");
    const body = await readJsonObject(request, 1024 * 1024);
    if (!isStudyLanguage(body.language)) throw invalid("invalid-language", "Choose Uzbek or English.");
    await saveGuide(user, lessonId, body.language, body.content);
    return createApiSuccessResponse({ saved: true });
  } catch (error) {
    return toApiErrorResponse(error, { code: "guide-save-failed", message: "The changes couldn't be saved.", log: "study-guide-save" });
  }
}
