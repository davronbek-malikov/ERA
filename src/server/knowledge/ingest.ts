import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getSupabaseStorageConfig } from "@/lib/storage";
import { chunkOptionsFromEnv, chunkSections } from "@/server/knowledge/chunking";
import { embedInBatches, EmbeddingError, getEmbeddingProvider, toVectorLiteral } from "@/server/knowledge/embeddings";
import { extractDocument, IngestionError, type KnowledgeFileType } from "@/server/knowledge/extract";

/*
 * Document ingestion pipeline (Prompt 09, docs/ERA_KNOWLEDGE_BASE.md §3):
 *
 *   PENDING ─► PROCESSING ─► download ─► validate ─► extract ─► clean+chunk ─► embed (batches) ─► store ─► COMPLETED
 *                                    └──────────────────── any failure ────────────────────────────────► FAILED
 *
 * - The PENDING→PROCESSING claim is a conditional update, so a document is never processed twice at once.
 * - Chunks are replaced in ONE transaction together with the COMPLETED status: a failed run leaves no partial or
 *   orphaned vectors, and a document is never "completed" without its chunks.
 * - Errors are stored as a safe code + message; details go to the server log only.
 */

const MAX_ATTEMPTS = 5;

/** Reads a stored Knowledge Base file from the private bucket with the server key. */
export async function downloadKnowledgeObject(path: string): Promise<Uint8Array> {
  const { supabaseUrl, serviceRoleKey, bucket } = getSupabaseStorageConfig();
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/storage/v1/object/authenticated/${bucket}/${encoded}`, {
      headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
      cache: "no-store"
    });
  } catch {
    throw new IngestionError("storage-failed", "storage connection error");
  }
  if (!response.ok) throw new IngestionError("storage-failed", `storage HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

export type ProcessResult = { status: "COMPLETED" | "FAILED" | "SKIPPED"; chunkCount?: number; errorCode?: string };

/**
 * Processes one document. Safe to call from a background task: it claims the document first and records the outcome.
 * `loadBytes` is injectable for tests; production reads the private storage object.
 */
export async function processKnowledgeDocument(documentId: string, loadBytes: (path: string) => Promise<Uint8Array> = downloadKnowledgeObject): Promise<ProcessResult> {
  const claimed = await prisma.knowledgeDocument.updateMany({
    where: { id: documentId, status: { in: ["PENDING", "FAILED"] }, attempts: { lt: MAX_ATTEMPTS } },
    data: { status: "PROCESSING", processingStartedAt: new Date(), errorCode: null, errorMessage: null, attempts: { increment: 1 } }
  });
  if (claimed.count !== 1) return { status: "SKIPPED" };

  const document = await prisma.knowledgeDocument.findUniqueOrThrow({
    where: { id: documentId },
    select: { id: true, fileType: true, storagePath: true }
  });

  try {
    const provider = getEmbeddingProvider();
    if (!provider) throw new EmbeddingError("embedding-not-configured", "ERA_EMBEDDING_PROVIDER is not set");

    const bytes = await loadBytes(document.storagePath);
    const extracted = await extractDocument(document.fileType as KnowledgeFileType, bytes);
    const chunks = chunkSections(extracted.sections, chunkOptionsFromEnv());
    if (chunks.length === 0) throw new IngestionError("no-text");

    // Embed with the heading as extra context; the stored content stays the original passage.
    const vectors = await embedInBatches(
      provider,
      chunks.map((chunk) => (chunk.heading ? `${chunk.heading}\n${chunk.content}` : chunk.content)),
      "document"
    );
    const dimensions = vectors[0].length;

    await prisma.$transaction(
      async (tx) => {
        await tx.knowledgeChunk.deleteMany({ where: { documentId } });
        for (const [i, chunk] of chunks.entries()) {
          await tx.$executeRaw`
            INSERT INTO "knowledge_chunks" ("id", "document_id", "chunk_index", "content", "heading", "page_start", "page_end", "char_count", "embedding_model", "embedding")
            VALUES (${`${documentId}_${chunk.index}`}, ${documentId}, ${chunk.index}, ${chunk.content}, ${chunk.heading}, ${chunk.pageStart}, ${chunk.pageEnd},
                    ${chunk.content.length}, ${provider.id}, ${toVectorLiteral(vectors[i])}::vector)`;
        }
        await tx.knowledgeDocument.update({
          where: { id: documentId },
          data: {
            status: "COMPLETED",
            chunkCount: chunks.length,
            pageCount: extracted.pageCount,
            sectionCount: extracted.sections.length,
            embeddingModel: provider.id,
            embeddingDimensions: dimensions,
            processedAt: new Date()
          }
        });
      },
      { timeout: 120_000, maxWait: 30_000 }
    );
    return { status: "COMPLETED", chunkCount: chunks.length };
  } catch (error) {
    const failure =
      error instanceof IngestionError
        ? error
        : error instanceof EmbeddingError
          ? new IngestionError("embedding-failed", `${error.code}: ${error.message}`)
          : new IngestionError("corrupted-file", error instanceof Error ? `${error.name}: ${error.message}` : "unknown");
    console.error(`[knowledge] document ${documentId} failed: ${failure.code}${failure.logDetail ? ` (${failure.logDetail})` : ""}`);
    await prisma.$transaction([
      prisma.knowledgeChunk.deleteMany({ where: { documentId } }),
      prisma.knowledgeDocument.update({
        where: { id: documentId },
        data: { status: "FAILED", chunkCount: 0, errorCode: failure.code, errorMessage: failure.message, processedAt: new Date() }
      })
    ]);
    return { status: "FAILED", errorCode: failure.code };
  }
}

/** Shape used by API responses (no storage path, no hash). */
export const knowledgeDocumentSelect = {
  id: true,
  title: true,
  originalFilename: true,
  fileType: true,
  fileSize: true,
  scope: true,
  visibility: true,
  courseId: true,
  lessonId: true,
  status: true,
  errorCode: true,
  errorMessage: true,
  pageCount: true,
  sectionCount: true,
  chunkCount: true,
  embeddingModel: true,
  attempts: true,
  createdAt: true,
  processedAt: true,
  uploadedBy: { select: { name: true } },
  course: { select: { title: true } },
  lesson: { select: { title: true } }
} satisfies Prisma.KnowledgeDocumentSelect;
