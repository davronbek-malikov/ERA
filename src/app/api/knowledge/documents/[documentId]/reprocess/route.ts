import { after, NextRequest } from "next/server";

import { createApiErrorResponse, createApiSuccessResponse } from "@/lib/app-errors";
import { prisma } from "@/lib/prisma";
import { retryOnDatabaseFailure } from "@/lib/server-data";
import { isValidId } from "@/lib/validation";
import { assertSameOrigin, authErrors, requireAuthenticatedUser, toApiErrorResponse } from "@/server/authz";
import { requireManageableDocument } from "@/server/knowledge/access";
import { getEmbeddingProvider } from "@/server/knowledge/embeddings";
import { knowledgeDocumentSelect, processKnowledgeDocument } from "@/server/knowledge/ingest";

type RouteProps = { params: Promise<{ documentId: string }> };

/**
 * Retries a FAILED document, or re-indexes a COMPLETED one whose vectors were made by a different embedding model
 * (after a provider change). Processing runs in the background.
 */
export async function POST(request: NextRequest, { params }: RouteProps) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const { documentId } = await params;
    if (!isValidId(documentId)) throw authErrors.notFound("Document not found.");
    const document = await requireManageableDocument(user, documentId);

    const current = await retryOnDatabaseFailure(() =>
      prisma.knowledgeDocument.findUniqueOrThrow({ where: { id: document.id }, select: { status: true, embeddingModel: true } })
    );
    let providerId: string | null = null;
    try {
      providerId = getEmbeddingProvider()?.id ?? null;
    } catch {
      providerId = null;
    }
    const stale = current.status === "COMPLETED" && providerId !== null && current.embeddingModel !== providerId;
    if (current.status !== "FAILED" && !stale) {
      return createApiErrorResponse(409, "not-reprocessable", "Only failed or outdated documents can be processed again.");
    }

    await retryOnDatabaseFailure(() =>
      prisma.knowledgeDocument.update({ where: { id: document.id }, data: { status: "PENDING", errorCode: null, errorMessage: null, attempts: 0 } })
    );
    after(async () => {
      await processKnowledgeDocument(document.id);
    });
    const updated = await retryOnDatabaseFailure(() =>
      prisma.knowledgeDocument.findUniqueOrThrow({ where: { id: document.id }, select: knowledgeDocumentSelect })
    );
    return createApiSuccessResponse({ document: updated }, 202);
  } catch (error) {
    return toApiErrorResponse(error, { code: "knowledge-reprocess-failed", message: "The document couldn't be processed again.", log: "knowledge-reprocess" });
  }
}
