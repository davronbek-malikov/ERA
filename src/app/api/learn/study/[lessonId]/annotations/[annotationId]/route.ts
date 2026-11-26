import type { NextRequest } from "next/server";

import { createApiSuccessResponse } from "@/lib/app-errors";
import { readJsonObject, requireId } from "@/lib/validation";
import { assertSameOrigin, requireAuthenticatedUser, toApiErrorResponse } from "@/server/authz";
import { ANNOTATION_COLORS, deleteAnnotation, updateAnnotation, type AnnotationColor } from "@/server/study/service";

type RouteProps = { params: Promise<{ lessonId: string; annotationId: string }> };

/** Change the color or the note of one's own highlight. */
export async function PATCH(request: NextRequest, { params }: RouteProps) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const { lessonId, annotationId } = await params;
    const body = await readJsonObject(request, 8 * 1024);
    const color = (ANNOTATION_COLORS as readonly string[]).includes(String(body.color)) ? (body.color as AnnotationColor) : undefined;
    const note = body.note === undefined ? undefined : typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 2000) : null;
    const annotation = await updateAnnotation(user, requireId(lessonId, "lessonId"), requireId(annotationId, "annotationId"), { color, note });
    return createApiSuccessResponse({ annotation });
  } catch (error) {
    return toApiErrorResponse(error, { code: "annotation-failed", message: "The highlight couldn't be changed.", log: "study-annotation" });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteProps) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const { lessonId, annotationId } = await params;
    await deleteAnnotation(user, requireId(lessonId, "lessonId"), requireId(annotationId, "annotationId"));
    return createApiSuccessResponse({ deleted: true });
  } catch (error) {
    return toApiErrorResponse(error, { code: "annotation-failed", message: "The highlight couldn't be deleted.", log: "study-annotation" });
  }
}
