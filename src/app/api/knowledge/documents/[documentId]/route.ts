import { NextRequest } from "next/server";

import { createApiSuccessResponse } from "@/lib/app-errors";
import { prisma } from "@/lib/prisma";
import { retryOnDatabaseFailure } from "@/lib/server-data";
import { isValidId } from "@/lib/validation";
import { assertSameOrigin, authErrors, requireAuthenticatedUser, toApiErrorResponse } from "@/server/authz";
import { manageableDocumentsWhere, requireManageableDocument } from "@/server/knowledge/access";
import { knowledgeDocumentSelect } from "@/server/knowledge/ingest";
import { bucketForStoragePath, deleteStorageObject } from "@/server/storage";

type RouteProps = { params: Promise<{ documentId: string }> };

/** One document's metadata and processing status (managers only). */
export async function GET(_request: NextRequest, { params }: RouteProps) {
  try {
    const user = await requireAuthenticatedUser();
    const { documentId } = await params;
    if (!isValidId(documentId)) throw authErrors.notFound("Document not found.");
    const where = await manageableDocumentsWhere(user);
    const document = await retryOnDatabaseFailure(() =>
      prisma.knowledgeDocument.findFirst({ where: { AND: [where, { id: documentId }] }, select: knowledgeDocumentSelect })
    );
    if (!document) throw authErrors.notFound("Document not found.");
    return createApiSuccessResponse({ document });
  } catch (error) {
    return toApiErrorResponse(error, { code: "knowledge-unavailable", message: "The Knowledge Base is temporarily unavailable.", log: "knowledge-get" });
  }
}

/** Deletes a document, its chunks and vectors (cascade) and then its stored file. */
export async function DELETE(request: NextRequest, { params }: RouteProps) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const { documentId } = await params;
    if (!isValidId(documentId)) throw authErrors.notFound("Document not found.");
    const document = await requireManageableDocument(user, documentId);

    await retryOnDatabaseFailure(() => prisma.knowledgeDocument.delete({ where: { id: document.id } }));
    try {
      await deleteStorageObject(bucketForStoragePath(document.storagePath), document.storagePath);
    } catch (error) {
      // The record and its vectors are gone; an orphaned file is logged for cleanup, not shown to the user.
      console.error(`[knowledge] could not delete stored file for ${document.id}: ${error instanceof Error ? error.message : "unknown"}`);
    }
    return createApiSuccessResponse({ deleted: true });
  } catch (error) {
    return toApiErrorResponse(error, { code: "knowledge-delete-failed", message: "The document couldn't be deleted. Please try again.", log: "knowledge-delete" });
  }
}
