/*
 * Knowledge Base: file validation and text extraction (Prompt 09, docs/ERA_KNOWLEDGE_BASE.md §3).
 * Uploaded files are untrusted: the extension, declared MIME type, magic bytes and size must all agree, and every
 * parser error becomes a safe IngestionError (never a crash, never a "completed" document without text).
 */

export type KnowledgeFileType = "pdf" | "docx" | "txt" | "md";

export type ExtractedSection = { text: string; page?: number; heading?: string };
export type ExtractedDocument = { sections: ExtractedSection[]; pageCount: number | null };

export type IngestionErrorCode =
  | "unsupported-type"
  | "mime-mismatch"
  | "file-too-large"
  | "empty-file"
  | "corrupted-file"
  | "no-text"
  | "embedding-failed"
  | "storage-failed"
  | "duplicate";

const SAFE_MESSAGES: Record<IngestionErrorCode, string> = {
  "unsupported-type": "This file type isn't supported. Upload a PDF, DOCX, TXT or Markdown file.",
  "mime-mismatch": "The file content doesn't match its extension.",
  "file-too-large": "The file is larger than the Knowledge Base limit.",
  "empty-file": "The file is empty.",
  "corrupted-file": "The file couldn't be read. It may be damaged, encrypted or password-protected.",
  "no-text": "No readable text was found in this file (scanned PDFs need text recognition first).",
  "embedding-failed": "The text was extracted but couldn't be indexed. Try again later.",
  "storage-failed": "The uploaded file couldn't be read from storage. Try uploading it again.",
  duplicate: "This file has already been added here."
};

export class IngestionError extends Error {
  constructor(
    readonly code: IngestionErrorCode,
    readonly logDetail?: string
  ) {
    super(SAFE_MESSAGES[code]);
    this.name = "IngestionError";
  }
}

export const KNOWLEDGE_FILE_TYPES: Record<KnowledgeFileType, { mimes: string[]; label: string }> = {
  pdf: { mimes: ["application/pdf"], label: "PDF" },
  docx: { mimes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"], label: "DOCX" },
  txt: { mimes: ["text/plain"], label: "Text" },
  // Browsers report .md as text/markdown, text/x-markdown or (often) an empty / plain type.
  md: { mimes: ["text/markdown", "text/x-markdown", "text/plain", ""], label: "Markdown" }
};

export function knowledgeMaxBytes() {
  const megabytes = Number(process.env.ERA_KB_MAX_FILE_MB ?? "20");
  return (Number.isFinite(megabytes) && megabytes > 0 ? megabytes : 20) * 1024 * 1024;
}

export function fileTypeFromName(filename: string): KnowledgeFileType | null {
  const extension = /\.([A-Za-z0-9]{1,8})$/.exec(filename)?.[1]?.toLowerCase();
  if (extension === "markdown") return "md";
  return extension && extension in KNOWLEDGE_FILE_TYPES ? (extension as KnowledgeFileType) : null;
}

/** Checks the declared metadata before upload (extension, MIME type, size). */
export function validateDeclaredFile(filename: string, mimeType: string, size: number): KnowledgeFileType {
  const type = fileTypeFromName(filename);
  if (!type) throw new IngestionError("unsupported-type");
  if (!KNOWLEDGE_FILE_TYPES[type].mimes.includes(mimeType.toLowerCase())) throw new IngestionError("mime-mismatch");
  if (!Number.isFinite(size) || size <= 0) throw new IngestionError("empty-file");
  if (size > knowledgeMaxBytes()) throw new IngestionError("file-too-large");
  return type;
}

/** Checks the actual bytes (signature, size, text encoding) before parsing. */
export function validateFileBytes(type: KnowledgeFileType, bytes: Uint8Array) {
  if (bytes.byteLength === 0) throw new IngestionError("empty-file");
  if (bytes.byteLength > knowledgeMaxBytes()) throw new IngestionError("file-too-large");
  const head = Buffer.from(bytes.subarray(0, 8));
  if (type === "pdf" && head.subarray(0, 5).toString("latin1") !== "%PDF-") throw new IngestionError("mime-mismatch", "missing %PDF- signature");
  if (type === "docx" && !(head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04)) {
    throw new IngestionError("mime-mismatch", "missing ZIP signature");
  }
  if (type === "txt" || type === "md") {
    // Text files must be valid UTF-8 without NUL bytes (binary files renamed to .txt are rejected).
    if (bytes.includes(0)) throw new IngestionError("mime-mismatch", "binary content in text file");
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new IngestionError("corrupted-file", "invalid UTF-8");
    }
  }
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decodeEntities(text: string) {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match);
}

async function extractPdf(bytes: Uint8Array): Promise<ExtractedDocument> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  let pages: string[];
  let totalPages: number;
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const result = await extractText(pdf, { mergePages: false });
    pages = Array.isArray(result.text) ? result.text : [String(result.text)];
    totalPages = result.totalPages;
  } catch (error) {
    throw new IngestionError("corrupted-file", error instanceof Error ? error.message : "pdf parse failed");
  }
  return { sections: pages.map((text, index) => ({ text, page: index + 1 })), pageCount: totalPages };
}

async function extractDocx(bytes: Uint8Array): Promise<ExtractedDocument> {
  const mammoth = (await import("mammoth")).default;
  let html: string;
  try {
    html = (await mammoth.convertToHtml({ buffer: Buffer.from(bytes) })).value;
  } catch (error) {
    throw new IngestionError("corrupted-file", error instanceof Error ? error.message : "docx parse failed");
  }
  // Keep headings as section boundaries; paragraphs, list items and table cells become paragraphs.
  const sections: ExtractedSection[] = [];
  let current: ExtractedSection = { text: "" };
  for (const match of html.matchAll(/<(h[1-6]|p|li|td|th)[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const text = decodeEntities(match[2].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).trim();
    if (!text) continue;
    if (/^h[1-6]$/i.test(match[1])) {
      if (current.text.trim()) sections.push(current);
      current = { heading: text.slice(0, 200), text: "" };
    } else {
      current.text += `${text}\n\n`;
    }
  }
  if (current.text.trim()) sections.push(current);
  return { sections, pageCount: null };
}

function extractMarkdown(text: string): ExtractedDocument {
  const sections: ExtractedSection[] = [];
  let current: ExtractedSection = { text: "" };
  let inFence = false;
  for (const line of text.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const heading = !inFence ? /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line) : null;
    if (heading) {
      if (current.text.trim()) sections.push(current);
      current = { heading: heading[1].slice(0, 200), text: "" };
    } else {
      current.text += `${line}\n`;
    }
  }
  if (current.text.trim()) sections.push(current);
  return { sections, pageCount: null };
}

/** Extracts text with structure (PDF pages, DOCX/Markdown headings). Throws IngestionError on failure. */
export async function extractDocument(type: KnowledgeFileType, bytes: Uint8Array): Promise<ExtractedDocument> {
  validateFileBytes(type, bytes);
  if (type === "pdf") return extractPdf(bytes);
  if (type === "docx") return extractDocx(bytes);
  const text = new TextDecoder("utf-8").decode(bytes);
  return type === "md" ? extractMarkdown(text) : { sections: [{ text }], pageCount: null };
}
