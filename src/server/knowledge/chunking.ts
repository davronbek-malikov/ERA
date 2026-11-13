import type { ExtractedSection } from "@/server/knowledge/extract";

/*
 * Text cleaning and chunking (Prompt 09, docs/ERA_KNOWLEDGE_BASE.md §3). Chunks follow paragraph boundaries, never
 * cross a heading, keep the PDF page range they came from, and overlap by a configurable number of characters so
 * that an idea split between two chunks is still retrievable.
 */

export type ChunkOptions = { size: number; overlap: number };

export type TextChunk = {
  index: number;
  content: string;
  heading: string | null;
  pageStart: number | null;
  pageEnd: number | null;
};

export function chunkOptionsFromEnv(): ChunkOptions {
  const size = Number(process.env.ERA_KB_CHUNK_SIZE ?? "1200");
  const overlap = Number(process.env.ERA_KB_CHUNK_OVERLAP ?? "200");
  const safeSize = Number.isInteger(size) && size >= 200 && size <= 8000 ? size : 1200;
  const safeOverlap = Number.isInteger(overlap) && overlap >= 0 && overlap < safeSize / 2 ? overlap : 200;
  return { size: safeSize, overlap: safeOverlap };
}

/** Removes control characters, joins hyphenated line breaks, normalizes whitespace; keeps paragraph breaks. */
export function cleanText(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/­/g, "")
    .replace(/(\p{L})-\n(\p{Ll})/gu, "$1$2")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type Unit = { text: string; heading: string | null; page: number | null };

/** Splits an over-long paragraph at sentence boundaries, then at word boundaries. */
function splitLong(text: string, size: number): string[] {
  if (text.length <= size) return [text];
  const sentences = text.match(/[^.!?。\n]+[.!?。]*\s*/g) ?? [text];
  const out: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if ((current + sentence).length > size && current) {
      out.push(current.trim());
      current = "";
    }
    if (sentence.length > size) {
      for (let start = 0; start < sentence.length; start += size) {
        let end = Math.min(start + size, sentence.length);
        const space = sentence.lastIndexOf(" ", end);
        if (end < sentence.length && space > start + size / 2) end = space;
        out.push(sentence.slice(start, end).trim());
        start = end - size;
      }
    } else {
      current += sentence;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out.filter(Boolean);
}

function overlapTail(text: string, overlap: number) {
  if (overlap <= 0 || text.length <= overlap) return overlap > 0 ? text : "";
  const tail = text.slice(-overlap);
  const space = tail.indexOf(" ");
  return space >= 0 ? tail.slice(space + 1) : tail;
}

export function chunkSections(sections: ExtractedSection[], options: ChunkOptions): TextChunk[] {
  const units: Unit[] = [];
  for (const section of sections) {
    const cleaned = cleanText(section.text);
    for (const paragraph of cleaned.split(/\n{2,}/)) {
      const text = paragraph.replace(/\n/g, " ").trim();
      if (!text) continue;
      for (const piece of splitLong(text, options.size)) {
        units.push({ text: piece, heading: section.heading ?? null, page: section.page ?? null });
      }
    }
  }

  const chunks: TextChunk[] = [];
  let parts: Unit[] = [];
  let carry = "";

  const flush = () => {
    if (parts.length === 0) return;
    const body = parts.map((part) => part.text).join("\n\n");
    const content = carry ? `${carry} ${body}` : body;
    const pages = parts.map((part) => part.page).filter((page): page is number => page !== null);
    chunks.push({
      index: chunks.length,
      content,
      heading: parts[0].heading,
      pageStart: pages.length ? Math.min(...pages) : null,
      pageEnd: pages.length ? Math.max(...pages) : null
    });
    carry = overlapTail(body, options.overlap);
    parts = [];
  };

  for (const unit of units) {
    const headingChanged = parts.length > 0 && unit.heading !== parts[0].heading;
    if (headingChanged) {
      flush();
      carry = ""; // never carry text across a heading
    }
    const length = parts.reduce((sum, part) => sum + part.text.length + 2, carry.length);
    if (parts.length > 0 && length + unit.text.length > options.size) flush();
    parts.push(unit);
  }
  flush();
  return chunks;
}
