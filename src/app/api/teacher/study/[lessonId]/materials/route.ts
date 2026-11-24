import type { NextRequest } from "next/server";

import { createApiErrorResponse, createApiSuccessResponse } from "@/lib/app-errors";
import { assertRateLimit, getUserRateLimitKeyParts } from "@/lib/rate-limit";
import { getUserStoragePrefix, isSafeStoragePath, storagePathFolder } from "@/lib/storage";
import { invalid, readJsonObject, requireId, requireString } from "@/lib/validation";
import { assertSameOrigin, requireAuthenticatedUser, toApiErrorResponse } from "@/server/authz";
import { extractDocument, IngestionError, validateDeclaredFile, validateFileBytes } from "@/server/knowledge/extract";
import { downloadKnowledgeObject } from "@/server/knowledge/ingest";
import { addStudyMaterial, requireTeacherLesson } from "@/server/study/service";

type RouteProps = { params: Promise<{ lessonId: string }> };

export const maxDuration = 60;

/**
 * Adds a lesson material for the study guide. The file was uploaded first through /api/admin/storage/upload
 * (folder "knowledge-documents", the teacher's own folder). Only its extracted text is kept.
 */
export async function POST(request: NextRequest, { params }: RouteProps) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const lessonId = requireId((await params).lessonId, "lessonId");
    await requireTeacherLesson(user, lessonId);
    const body = await readJsonObject(request, 8 * 1024);
    const filename = requireString(body.filename, "filename", { max: 180 });
    const mimeType = typeof body.mimeType === "string" ? body.mimeType.trim().toLowerCase() : "";
    const fileSize = typeof body.fileSize === "number" ? body.fileSize : Number.NaN;
    const storagePath = requireString(body.storagePath, "storagePath", { max: 512 });
    const fileType = validateDeclaredFile(filename, mimeType, fileSize);
    if (!isSafeStoragePath(storagePath) || storagePathFolder(storagePath) !== "knowledge-documents" || !storagePath.startsWith(getUserStoragePrefix(user.id))) {
      throw invalid("invalid-storagePath", "Upload the file first.");
    }
    await assertRateLimit({ scope: "study-material", maxAttempts: 30, windowMs: 60 * 60_000, cooldownMs: 10 * 60_000, keyParts: getUserRateLimitKeyParts(user.id) });
    const bytes = await downloadKnowledgeObject(storagePath);
    validateFileBytes(fileType, bytes);
    const extracted = await extractDocument(fileType, bytes);
    const text = extracted.sections.map((section) => (section.heading ? `## ${section.heading}\n${section.text}` : section.text)).join("\n\n");
    const material = await addStudyMaterial(user, lessonId, { filename, fileType, pageCount: extracted.pageCount, text });
    return createApiSuccessResponse({ material }, 201);
  } catch (error) {
    if (error instanceof IngestionError) return createApiErrorResponse(422, error.code, error.message);
    return toApiErrorResponse(error, { code: "material-failed", message: "The file couldn't be added. Please try again.", log: "study-material" });
  }
}
