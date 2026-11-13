import { createHash } from "node:crypto";

import { after, NextRequest } from "next/server";
import type { KnowledgeScope, KnowledgeVisibility } from "@prisma/client";

import { createApiErrorResponse, createApiSuccessResponse } from "@/lib/app-errors";
import { prisma } from "@/lib/prisma";
import { assertRateLimit, getUserRateLimitKeyParts } from "@/lib/rate-limit";
import { retryOnDatabaseFailure } from "@/lib/server-data";
import { getUserStoragePrefix, isSafeStoragePath, storagePathFolder } from "@/lib/storage";
import { invalid, optionalId, readJsonObject, requireString } from "@/lib/validation";
import { assertSameOrigin, requireAuthenticatedUser, toApiErrorResponse } from "@/server/authz";
import { assertCanManageKnowledge, manageableDocumentsWhere, resolveUploadTarget } from "@/server/knowledge/access";
import { IngestionError, validateDeclaredFile, validateFileBytes } from "@/server/knowledge/extract";
import { downloadKnowledgeObject, knowledgeDocumentSelect, processKnowledgeDocument } from "@/server/knowledge/ingest";

const SCOPES: KnowledgeScope[] = ["PLATFORM", "COURSE", "LESSON", "TEACHER_PRIVATE"];
const VISIBILITIES: KnowledgeVisibility[] = ["STUDENTS", "TEACHERS_ONLY"];

/** Knowledge Base documents this user may manage (metadata only — never storage paths or text). */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser();
    const where = await manageableDocumentsWhere(user);
    const courseId = optionalId(request.nextUrl.searchParams.get("courseId") ?? undefined, "courseId");
    const documents = await retryOnDatabaseFailure(() =>
      prisma.knowledgeDocument.findMany({
        where: { AND: [where, ...(courseId ? [{ courseId }] : [])] },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: knowledgeDocumentSelect
      })
    );
    return createApiSuccessResponse({ documents });
  } catch (error) {
    return toApiErrorResponse(error, { code: "knowledge-unavailable", message: "The Knowledge Base is temporarily unavailable.", log: "knowledge-list" });
  }
}

/**
 * Registers a file that the user already uploaded through /api/admin/storage/upload (folder "knowledge-documents"),
 * validates it, and queues it for processing. Processing runs after the response is sent.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    assertCanManageKnowledge(user);
    const body = await readJsonObject(request, 8 * 1024);

    const filename = requireString(body.filename, "filename", { max: 180 });
    const mimeType = typeof body.mimeType === "string" ? body.mimeType.trim().toLowerCase() : "";
    const fileSize = typeof body.fileSize === "number" ? body.fileSize : Number.NaN;
    const storagePath = requireString(body.storagePath, "storagePath", { max: 512 });
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 200) : filename.replace(/\.[^.]+$/, "");
    const scope = body.scope as KnowledgeScope;
    const visibility = (body.visibility ?? "STUDENTS") as KnowledgeVisibility;
    if (!SCOPES.includes(scope)) throw invalid("invalid-scope", "Choose who this document is for.");
    if (!VISIBILITIES.includes(visibility)) throw invalid("invalid-visibility", "Choose who may see answers from this document.");

    const fileType = validateDeclaredFile(filename, mimeType, fileSize);

    // The object must be the caller's own upload in the Knowledge Base folder (no path tricks, no other users' files).
    if (!isSafeStoragePath(storagePath) || storagePathFolder(storagePath) !== "knowledge-documents" || !storagePath.startsWith(getUserStoragePrefix(user.id))) {
      throw invalid("invalid-storagePath", "Upload the file first.");
    }

    const target = await resolveUploadTarget(user, {
      scope,
      visibility,
      courseId: optionalId(body.courseId, "courseId"),
      lessonId: optionalId(body.lessonId, "lessonId")
    });

    await assertRateLimit({ scope: "knowledge-upload", maxAttempts: 30, windowMs: 60 * 60_000, cooldownMs: 10 * 60_000, keyParts: getUserRateLimitKeyParts(user.id) });

    // Read the stored bytes now: real size, real signature and a content hash for duplicate detection.
    const bytes = await downloadKnowledgeObject(storagePath);
    validateFileBytes(fileType, bytes);
    const contentHash = createHash("sha256").update(bytes).digest("hex");

    const duplicate = await retryOnDatabaseFailure(() =>
      prisma.knowledgeDocument.findFirst({
        where: {
          contentHash,
          scope: target.scope,
          courseId: target.courseId,
          lessonId: target.lessonId,
          ...(target.scope === "TEACHER_PRIVATE" ? { uploadedById: user.id } : {}),
          status: { not: "FAILED" }
        },
        select: { id: true }
      })
    );
    if (duplicate) {
      return createApiErrorResponse(409, "duplicate", new IngestionError("duplicate").message);
    }

    const document = await retryOnDatabaseFailure(() =>
      prisma.knowledgeDocument.create({
        data: {
          title,
          originalFilename: filename,
          fileType,
          mimeType: mimeType || "text/markdown",
          fileSize: bytes.byteLength,
          storagePath,
          contentHash,
          ...target,
          uploadedById: user.id
        },
        select: knowledgeDocumentSelect
      })
    );

    // Background processing: the response returns immediately with status PENDING.
    after(async () => {
      await processKnowledgeDocument(document.id, async () => bytes);
    });

    return createApiSuccessResponse({ document }, 202);
  } catch (error) {
    if (error instanceof IngestionError) {
      return createApiErrorResponse(error.code === "file-too-large" ? 413 : 400, error.code, error.message);
    }
    return toApiErrorResponse(error, { code: "knowledge-upload-failed", message: "The document couldn't be added. Please try again.", log: "knowledge-upload" });
  }
}
