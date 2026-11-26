import type { NextRequest } from "next/server";

import { createApiSuccessResponse } from "@/lib/app-errors";
import { assertRateLimit, getUserRateLimitKeyParts } from "@/lib/rate-limit";
import { invalid, readJsonObject, requireId, requireString } from "@/lib/validation";
import { assertSameOrigin, requireAuthenticatedUser, toApiErrorResponse } from "@/server/authz";
import { isStudyLanguage } from "@/server/study/content";
import { ANNOTATION_COLORS, createAnnotation, type AnnotationColor } from "@/server/study/service";

type RouteProps = { params: Promise<{ lessonId: string }> };

/** A highlight (optionally with a note) on the study guide. Private to the student who made it. */
export async function POST(request: NextRequest, { params }: RouteProps) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const lessonId = requireId((await params).lessonId, "lessonId");
    const body = await readJsonObject(request, 16 * 1024);
    const sectionId = requireString(body.sectionId, "sectionId", { max: 40 });
    const quote = requireString(body.quote, "quote", { min: 1, max: 1000 });
    const start = typeof body.start === "number" && Number.isInteger(body.start) && body.start >= 0 && body.start <= 200_000 ? body.start : null;
    if (start === null) throw invalid("invalid-start", "Select the text again.");
    const color = (ANNOTATION_COLORS as readonly string[]).includes(String(body.color)) ? (body.color as AnnotationColor) : "yellow";
    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 2000) : null;
    const language = isStudyLanguage(body.language) ? body.language : "uz";
    await assertRateLimit({ scope: "study-annotate", maxAttempts: 120, windowMs: 10 * 60_000, cooldownMs: 5 * 60_000, keyParts: getUserRateLimitKeyParts(user.id) });
    return createApiSuccessResponse({ annotation: await createAnnotation(user, lessonId, { language, sectionId, quote, start, color, note }) }, 201);
  } catch (error) {
    return toApiErrorResponse(error, { code: "annotation-failed", message: "The highlight couldn't be saved. Please try again.", log: "study-annotation" });
  }
}
