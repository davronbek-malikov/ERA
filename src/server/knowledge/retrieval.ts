import { Prisma, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getEmbeddingProvider, toVectorLiteral, type EmbeddingProvider } from "@/server/knowledge/embeddings";
import { getInstructorIdForUser, type AuthUser } from "@/server/authz";

/*
 * Retrieval engine (Prompt 09, docs/ERA_KNOWLEDGE_BASE.md §6).
 *
 * Authorization is enforced INSIDE the SQL query (the database boundary), never in the UI or the prompt:
 *
 *   Student : status COMPLETED AND visibility STUDENTS AND (
 *               PLATFORM
 *             | COURSE  of a PUBLISHED course the student is ENROLLED in (joined against "Enrollment")
 *             | LESSON  whose lesson AND course are PUBLISHED and the student is ENROLLED )
 *             — never TEACHER_PRIVATE, never TEACHERS_ONLY (answer keys, assessments, teacher notes)
 *   Teacher : PLATFORM | COURSE/LESSON of a course whose instructorId is the teacher's profile
 *             | TEACHER_PRIVATE uploaded by the teacher            (no profile → PLATFORM + own private only)
 *   Admin   : PLATFORM | COURSE | LESSON                            (teacher-private notes are not retrieved)
 *
 * Optional focus filters (course, lesson, documents) only NARROW the authorized set. Vectors are compared only
 * with vectors from the same embedding model.
 */

export type RetrievalAgent = "student" | "teacher" | "admin";

export type RetrievalOptions = {
  agent: RetrievalAgent;
  courseId?: string | null;
  lessonId?: string | null;
  documentIds?: string[];
  topK?: number;
  minScore?: number;
};

export type RetrievedPassage = {
  chunkId: string;
  documentId: string;
  title: string;
  originalFilename: string;
  chunkIndex: number;
  heading: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  content: string;
  score: number;
  scope: string;
  courseId: string | null;
  courseTitle: string | null;
  lessonId: string | null;
  lessonTitle: string | null;
};

export function retrievalDefaults() {
  const topK = Number(process.env.ERA_KB_TOP_K ?? "5");
  const minScore = Number(process.env.ERA_KB_MIN_SCORE ?? "0.25");
  return {
    topK: Number.isInteger(topK) && topK >= 1 && topK <= 20 ? topK : 5,
    minScore: Number.isFinite(minScore) && minScore >= -1 && minScore < 1 ? minScore : 0.25
  };
}

/** The permission predicate for this user, as a parameterized SQL fragment over d = knowledge_documents. */
async function authorizationPredicate(user: AuthUser, agent: RetrievalAgent): Promise<Prisma.Sql> {
  if (agent === "student") {
    if (user.role !== UserRole.STUDENT) return Prisma.sql`FALSE`;
    return Prisma.sql`(
      d."visibility" = 'STUDENTS' AND (
        d."scope" = 'PLATFORM'
        OR (d."scope" = 'COURSE' AND EXISTS (
              SELECT 1 FROM "Enrollment" e JOIN "Course" co ON co."id" = e."courseId"
              WHERE e."userId" = ${user.id} AND e."courseId" = d."course_id" AND co."status" = 'PUBLISHED'))
        OR (d."scope" = 'LESSON' AND EXISTS (
              SELECT 1 FROM "Lesson" l
              JOIN "Course" co ON co."id" = l."courseId"
              JOIN "Enrollment" e ON e."courseId" = co."id"
              WHERE l."id" = d."lesson_id" AND l."status" = 'PUBLISHED' AND co."status" = 'PUBLISHED' AND e."userId" = ${user.id}))
      ))`;
  }

  if (agent === "teacher") {
    if (user.role !== UserRole.INSTRUCTOR && user.role !== UserRole.ADMIN) return Prisma.sql`FALSE`;
    const instructorId = await getInstructorIdForUser(user);
    const owned = instructorId
      ? Prisma.sql`OR (d."scope" IN ('COURSE', 'LESSON') AND d."course_id" IN (SELECT co."id" FROM "Course" co WHERE co."instructorId" = ${instructorId}))`
      : Prisma.empty;
    return Prisma.sql`(
      d."scope" = 'PLATFORM'
      ${owned}
      OR (d."scope" = 'TEACHER_PRIVATE' AND d."uploaded_by_id" = ${user.id})
    )`;
  }

  if (user.role !== UserRole.ADMIN) return Prisma.sql`FALSE`;
  return Prisma.sql`d."scope" IN ('PLATFORM', 'COURSE', 'LESSON')`;
}

function focusPredicate(options: RetrievalOptions): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  if (options.courseId) parts.push(Prisma.sql`(d."scope" IN ('PLATFORM', 'TEACHER_PRIVATE') OR d."course_id" = ${options.courseId})`);
  if (options.lessonId) parts.push(Prisma.sql`(d."scope" <> 'LESSON' OR d."lesson_id" = ${options.lessonId})`);
  if (options.documentIds?.length) parts.push(Prisma.sql`d."id" IN (${Prisma.join(options.documentIds)})`);
  return parts.length ? Prisma.sql`AND ${Prisma.join(parts, " AND ")}` : Prisma.empty;
}

/** Searches with a precomputed query vector. Exposed for tests; normal callers use `retrieveKnowledge`. */
export async function searchKnowledge(user: AuthUser, vector: number[], embeddingModel: string, options: RetrievalOptions): Promise<RetrievedPassage[]> {
  const { topK, minScore } = { ...retrievalDefaults(), ...definedOnly({ topK: options.topK, minScore: options.minScore }) };
  const literal = toVectorLiteral(vector);
  const rows = await prisma.$queryRaw<Array<RetrievedPassage & { score: number }>>`
    SELECT c."id" AS "chunkId", d."id" AS "documentId", d."title", d."original_filename" AS "originalFilename",
           c."chunk_index" AS "chunkIndex", c."heading", c."page_start" AS "pageStart", c."page_end" AS "pageEnd",
           c."content", (1 - (c."embedding" <=> ${literal}::vector))::float8 AS "score",
           d."scope"::text AS "scope", d."course_id" AS "courseId", co."title" AS "courseTitle",
           d."lesson_id" AS "lessonId", le."title" AS "lessonTitle"
    FROM "knowledge_chunks" c
    JOIN "knowledge_documents" d ON d."id" = c."document_id"
    LEFT JOIN "Course" co ON co."id" = d."course_id"
    LEFT JOIN "Lesson" le ON le."id" = d."lesson_id"
    WHERE d."status" = 'COMPLETED'
      AND c."embedding_model" = ${embeddingModel}
      AND c."embedding" IS NOT NULL
      AND ${await authorizationPredicate(user, options.agent)}
      ${focusPredicate(options)}
      AND (1 - (c."embedding" <=> ${literal}::vector)) >= ${minScore}
    ORDER BY c."embedding" <=> ${literal}::vector ASC, d."id", c."chunk_index"
    LIMIT ${topK}`;
  return rows.map((row) => ({ ...row, score: Number(row.score) }));
}

function definedOnly<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== null)) as Partial<T>;
}

export type RetrievalResult =
  | { status: "ok"; passages: RetrievedPassage[]; embeddingModel: string }
  | { status: "disabled" }
  | { status: "error"; reason: string };

/**
 * Full retrieval: embed the question with the configured provider, then search the authorized scope.
 * Never throws: a disabled or failing Knowledge Base must not take the assistant down.
 */
export async function retrieveKnowledge(user: AuthUser, query: string, options: RetrievalOptions, provider?: EmbeddingProvider | null): Promise<RetrievalResult> {
  let embedder: EmbeddingProvider | null;
  try {
    embedder = provider === undefined ? getEmbeddingProvider() : provider;
  } catch (error) {
    console.error(`[knowledge] retrieval disabled: ${error instanceof Error ? error.message : "unknown"}`);
    return { status: "disabled" };
  }
  if (!embedder) return { status: "disabled" };
  try {
    const [vector] = await embedder.embed([query.slice(0, 4000)], "query");
    const passages = await searchKnowledge(user, vector, embedder.id, options);
    return { status: "ok", passages, embeddingModel: embedder.id };
  } catch (error) {
    console.error(`[knowledge] retrieval failed: ${error instanceof Error ? `${error.name}: ${error.message}` : "unknown"}`);
    return { status: "error", reason: "retrieval-failed" };
  }
}
