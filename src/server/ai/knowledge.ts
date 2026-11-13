import type { AuthUser } from "@/server/authz";
import { retrieveKnowledge, type RetrievalOptions, type RetrievedPassage } from "@/server/knowledge/retrieval";
import type { ContextBlock } from "@/server/ai/types";

/*
 * RAG integration for the shared AI engine (Prompt 09, docs/ERA_KNOWLEDGE_BASE.md §8). One pipeline for all agents:
 *
 *   question ─► (route: authentication, role, course/lesson access) ─► retrieveKnowledge (authorization in SQL)
 *            ─► context assembly ([S1] … [Sn] passages) ─► shared engine ─► answer + sources
 *
 * Sources are the passages that were actually retrieved and given to the model — never invented.
 */

export type KnowledgeSource = {
  /** Citation label used in the prompt and the answer, e.g. "S1". */
  label: string;
  documentId: string;
  title: string;
  filename: string;
  pageStart: number | null;
  pageEnd: number | null;
  heading: string | null;
  chunkIndex: number;
  courseTitle: string | null;
  lessonTitle: string | null;
  score: number;
  /** True when the answer cites this label. */
  cited?: boolean;
};

export type KnowledgeContext = {
  status: "grounded" | "no-match" | "disabled" | "unavailable";
  blocks: ContextBlock[];
  sources: KnowledgeSource[];
};

const PASSAGE_MAX_CHARS = 2400;

function describe(passage: RetrievedPassage) {
  const pages =
    passage.pageStart === null ? "" : passage.pageEnd && passage.pageEnd !== passage.pageStart ? `, pages ${passage.pageStart}-${passage.pageEnd}` : `, page ${passage.pageStart}`;
  const where = passage.lessonTitle ? `, lesson: ${passage.lessonTitle}` : passage.courseTitle ? `, course: ${passage.courseTitle}` : "";
  return `${passage.title} (${passage.originalFilename}${pages}${where}${passage.heading ? `, section: ${passage.heading}` : ""})`;
}

/** Retrieves authorized passages for a question and turns them into prompt blocks plus source records. */
export async function buildKnowledgeContext(user: AuthUser, query: string, options: RetrievalOptions): Promise<KnowledgeContext> {
  const result = await retrieveKnowledge(user, query, options);
  if (result.status === "disabled") return { status: "disabled", blocks: [], sources: [] };
  if (result.status === "error") return { status: "unavailable", blocks: [], sources: [] };

  if (result.passages.length === 0) {
    return {
      status: "no-match",
      sources: [],
      blocks: [
        {
          label: "ERA knowledge base",
          content:
            "No passages in the ERA knowledge base matched this question. If you answer, say clearly that the answer is general knowledge, not taken from the course materials, and do not cite sources."
        }
      ]
    };
  }

  const sources: KnowledgeSource[] = result.passages.map((passage, index) => ({
    label: `S${index + 1}`,
    documentId: passage.documentId,
    title: passage.title,
    filename: passage.originalFilename,
    pageStart: passage.pageStart,
    pageEnd: passage.pageEnd,
    heading: passage.heading,
    chunkIndex: passage.chunkIndex,
    courseTitle: passage.courseTitle,
    lessonTitle: passage.lessonTitle,
    score: Math.round(passage.score * 1000) / 1000
  }));

  const content = [
    "Passages retrieved from the ERA knowledge base for this question. Ground the answer in them and cite the labels you used, like [S1]. Cite only labels listed here.",
    ...result.passages.map(
      (passage, index) =>
        `[S${index + 1}] ${describe(passage)}\n${passage.content.length > PASSAGE_MAX_CHARS ? `${passage.content.slice(0, PASSAGE_MAX_CHARS)} […]` : passage.content}`
    )
  ].join("\n\n");

  return { status: "grounded", sources, blocks: [{ label: "ERA knowledge base", content }] };
}

/** Marks which sources the answer actually cites ([S1], [S2] …). Unknown labels in the answer are ignored. */
export function markCitedSources(sources: KnowledgeSource[], answer: string): KnowledgeSource[] {
  const cited = new Set([...answer.matchAll(/\[S(\d{1,2})\]/g)].map((match) => `S${match[1]}`));
  return sources.map((source) => ({ ...source, cited: cited.has(source.label) }));
}
