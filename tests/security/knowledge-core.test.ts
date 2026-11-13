/**
 * Knowledge Base core tests (Prompt 09): extraction, cleaning, chunking, embeddings, ingestion, retrieval and the
 * authorization predicate — run directly against the code and the isolated local test database.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import JSZip from "jszip";

import { prisma } from "@/lib/prisma";
import { chunkSections, cleanText } from "@/server/knowledge/chunking";
import {
  embedInBatches,
  EmbeddingError,
  getEmbeddingProvider,
  testEmbedding,
  TEST_EMBEDDING_DIMENSIONS,
  validateVectors,
  type EmbeddingProvider
} from "@/server/knowledge/embeddings";
import { extractDocument, IngestionError, validateDeclaredFile } from "@/server/knowledge/extract";
import { processKnowledgeDocument } from "@/server/knowledge/ingest";
import { retrieveKnowledge, searchKnowledge } from "@/server/knowledge/retrieval";
import type { AuthUser } from "@/server/authz";

const fx = JSON.parse(readFileSync(path.join(process.cwd(), "tests", "security", ".state", "fixtures.json"), "utf8"));
const u = fx.users as Record<string, AuthUser>;
const FAKE = "http://127.0.0.1:3952";
process.env.ERA_EMBEDDING_PROVIDER = "test";
process.env.ERA_ALLOW_TEST_EMBEDDINGS = "1";
after(async () => {
  // Leave the database as the other suites expect: remove this suite's documents (chunks cascade).
  await prisma.knowledgeDocument.deleteMany({ where: { contentHash: { startsWith: "hash-" } } });
  await prisma.$disconnect();
});

// ------------------------------------------------------------------ fixtures: real files
/** Builds a valid multi-page PDF (Helvetica text, correct xref offsets). */
function makePdf(pages: string[]) {
  const objects: string[] = [];
  const pageIds = pages.map((_, i) => 4 + i * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  pages.forEach((text, i) => {
    const pageId = pageIds[i];
    const lines = text.split("\n").map((line, n) => `BT /F1 12 Tf 72 ${720 - n * 16} Td (${line.replace(/[()\\]/g, "")}) Tj ET`).join("\n");
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId + 1} 0 R >>`;
    objects[pageId + 1] = `<< /Length ${Buffer.byteLength(lines)} >>\nstream\n${lines}\nendstream`;
  });
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(out);
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) out += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, "latin1"));
}

/** Builds a minimal DOCX with a heading and paragraphs. */
async function makeDocx(blocks: Array<{ heading?: string; text?: string }>) {
  const body = blocks
    .map((block) =>
      block.heading
        ? `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${block.heading}</w:t></w:r></w:p>`
        : `<w:p><w:r><w:t xml:space="preserve">${block.text}</w:t></w:r></w:p>`
    )
    .join("");
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
  zip.file("_rels/.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file("word/_rels/document.xml.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  zip.file("word/styles.xml", '<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>');
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`);
  return new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
}

const utf8 = (text: string) => new Uint8Array(Buffer.from(text, "utf8"));

// ------------------------------------------------------------------ A. ingestion: extraction
describe("A. Extraction and validation", () => {
  test("PDF: text per page with page numbers", async () => {
    const result = await extractDocument("pdf", makePdf(["Introduction to learning", "Overfitting happens when a model memorizes training data"]));
    assert.equal(result.pageCount, 2);
    assert.equal(result.sections[1].page, 2);
    assert.match(result.sections[1].text, /Overfitting happens/);
  });

  test("DOCX: headings become sections", async () => {
    const result = await extractDocument("docx", await makeDocx([{ heading: "Regularization" }, { text: "Dropout reduces overfitting." }, { text: "Weight decay too." }]));
    assert.equal(result.sections[0].heading, "Regularization");
    assert.match(result.sections[0].text, /Dropout reduces overfitting\.\s+Weight decay too\./);
  });

  test("TXT and Markdown (headings kept, code fences not treated as headings)", async () => {
    assert.match((await extractDocument("txt", utf8("Plain text lesson."))).sections[0].text, /Plain text lesson/);
    const md = await extractDocument("md", utf8(["# Vectors", "A vector has size.", "```", "# not a heading", "```", "## Matrices", "Rows and columns."].join("\n")));
    assert.deepEqual(md.sections.map((section) => section.heading), ["Vectors", "Matrices"]);
    assert.match(md.sections[0].text, /# not a heading/);
  });

  test("invalid documents are rejected with safe codes", async () => {
    const code = async (promise: Promise<unknown>) => promise.then(() => "none", (error) => (error instanceof IngestionError ? error.code : "other"));
    assert.equal(await code(extractDocument("pdf", utf8("just text pretending to be a pdf"))), "mime-mismatch");
    assert.equal(await code(extractDocument("pdf", utf8("%PDF-1.4 garbage that is not a pdf"))), "corrupted-file");
    assert.equal(await code(extractDocument("docx", utf8("PK not really a zip"))), "mime-mismatch");
    assert.equal(await code(extractDocument("docx", new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5]))), "corrupted-file");
    assert.equal(await code(extractDocument("txt", new Uint8Array([0x48, 0x00, 0x49]))), "mime-mismatch");
    assert.equal(await code(extractDocument("txt", new Uint8Array([0xff, 0xfe, 0xfd]))), "corrupted-file");
    assert.equal(await code(extractDocument("txt", new Uint8Array([]))), "empty-file");
  });

  test("declared metadata: type, MIME, size", () => {
    assert.equal(validateDeclaredFile("notes.pdf", "application/pdf", 10), "pdf");
    assert.equal(validateDeclaredFile("notes.markdown", "", 10), "md");
    assert.throws(() => validateDeclaredFile("tool.exe", "application/octet-stream", 10), (e: unknown) => (e as IngestionError).code === "unsupported-type");
    assert.throws(() => validateDeclaredFile("notes.pdf", "text/html", 10), (e: unknown) => (e as IngestionError).code === "mime-mismatch");
    assert.throws(() => validateDeclaredFile("notes.pdf", "application/pdf", 0), (e: unknown) => (e as IngestionError).code === "empty-file");
    assert.throws(() => validateDeclaredFile("notes.pdf", "application/pdf", 21 * 1024 * 1024), (e: unknown) => (e as IngestionError).code === "file-too-large");
  });
});

// ------------------------------------------------------------------ A. ingestion: cleaning + chunking
describe("A. Cleaning and chunking", () => {
  test("cleaning removes control characters, joins hyphenation, keeps paragraphs", () => {
    const cleaned = cleanText("Machine lear-\nning is   great.\u0007\n\n\n\nNew  paragraph.");
    assert.equal(cleaned, "Machine learning is great.\n\nNew paragraph.");
  });

  test("chunk size, overlap, heading boundaries and page ranges", () => {
    const paragraph = (n: number) => `Paragraph ${n} ` + "word ".repeat(40);
    const chunks = chunkSections(
      [
        { page: 1, heading: "Part A", text: [1, 2, 3].map(paragraph).join("\n\n") },
        { page: 2, heading: "Part A", text: [4, 5].map(paragraph).join("\n\n") },
        { page: 3, heading: "Part B", text: paragraph(6) }
      ],
      { size: 500, overlap: 60 }
    );
    assert.ok(chunks.length >= 3);
    assert.ok(chunks.every((chunk) => chunk.content.length <= 500 + 60 + 2), "size respected (plus overlap)");
    assert.deepEqual(chunks.map((chunk) => chunk.index), chunks.map((_, i) => i));
    const partB = chunks.filter((chunk) => chunk.heading === "Part B");
    assert.equal(partB.length, 1);
    assert.equal(partB[0].pageStart, 3);
    assert.ok(!partB[0].content.includes("Paragraph 5"), "no overlap carried across headings");
    const spanning = chunks.find((chunk) => chunk.pageStart === 1 && chunk.pageEnd === 2) ?? chunks.find((chunk) => chunk.pageStart === 2);
    assert.ok(spanning, "page numbers preserved");
    const second = chunks[1];
    assert.ok(second.content.startsWith("word") || second.content.includes("word word"), "overlap prefix present");
  });

  test("over-long text without paragraph breaks is split", () => {
    const chunks = chunkSections([{ text: "Sentence number one. ".repeat(200) }], { size: 400, overlap: 0 });
    assert.ok(chunks.length > 5);
    assert.ok(chunks.every((chunk) => chunk.content.length <= 400));
  });
});

// ------------------------------------------------------------------ B. embeddings
describe("B. Embeddings", () => {
  test("test embedder is deterministic, normalized and lexical", () => {
    const a = testEmbedding("overfitting training data");
    assert.deepEqual(a, testEmbedding("overfitting training data"));
    assert.equal(a.length, TEST_EMBEDDING_DIMENSIONS);
    assert.ok(Math.abs(Math.hypot(...a) - 1) < 1e-9);
    const cos = (x: number[], y: number[]) => x.reduce((sum, value, i) => sum + value * y[i], 0);
    assert.ok(cos(a, testEmbedding("what is overfitting in training")) > cos(a, testEmbedding("photosynthesis in plants")));
  });

  test("batch processing preserves order and size", async () => {
    process.env.ERA_EMBEDDING_BATCH_SIZE = "3";
    const calls: number[] = [];
    const provider: EmbeddingProvider = { id: "spy", dimensions: 4, embed: async (texts) => (calls.push(texts.length), texts.map((t) => [t.length, 0, 0, 1])) };
    const vectors = await embedInBatches(provider, ["a", "bb", "ccc", "dddd", "eeeee", "ffffff", "g"], "document");
    delete process.env.ERA_EMBEDDING_BATCH_SIZE;
    assert.deepEqual(calls, [3, 3, 1]);
    assert.deepEqual(vectors.map((v) => v[0]), [1, 2, 3, 4, 5, 6, 1]);
  });

  test("dimension validation", () => {
    assert.throws(() => validateVectors([[1, 2], [1, 2, 3]], 2, null), EmbeddingError);
    assert.throws(() => validateVectors([[1, 2]], 2, null), EmbeddingError);
    assert.throws(() => validateVectors([[1, Number.NaN]], 1, null), EmbeddingError);
    assert.throws(() => validateVectors([[1, 2, 3]], 1, 4), EmbeddingError);
    assert.deepEqual(validateVectors([[1, 2, 3]], 1, 3), [[1, 2, 3]]);
  });

  test("Voyage adapter against the fake: batching, dimensions, retries on 500, no retry on 401", async () => {
    const saved = { ...process.env };
    Object.assign(process.env, { ERA_EMBEDDING_PROVIDER: "voyage", VOYAGE_API_KEY: "test-voyage", VOYAGE_BASE_URL: `${FAKE}/v1`, ERA_EMBEDDING_DIMENSIONS: "12", ERA_EMBEDDING_RETRIES: "2" });
    try {
      const provider = getEmbeddingProvider()!;
      assert.equal(provider.id, "voyage:voyage-3.5:12");
      const vectors = await provider.embed(["one", "two"], "document");
      assert.equal(vectors.length, 2);
      assert.equal(vectors[0].length, 12);
      const before = (await (await fetch("http://127.0.0.1:3951/__log")).json()).length;
      await assert.rejects(provider.embed(["FAIL_EMBED_500"], "query"), (e: unknown) => (e as EmbeddingError).code === "embedding-provider-failed");
      const afterFail = await (await fetch("http://127.0.0.1:3951/__log")).json();
      assert.equal(afterFail.slice(before).filter((entry: { path: string }) => entry.path === "embed:/v1/embeddings").length, 3, "1 try + 2 retries");
      const before401 = afterFail.length;
      await assert.rejects(provider.embed(["FAIL_EMBED_401"], "query"));
      const after401 = await (await fetch("http://127.0.0.1:3951/__log")).json();
      assert.equal(after401.slice(before401).length, 1, "no retry on 401");
      await assert.rejects(provider.embed(["WRONG_DIMENSIONS"], "query"), (e: unknown) => (e as EmbeddingError).code === "embedding-invalid-response");
    } finally {
      process.env = saved;
    }
  });

  test("OpenAI and Ollama adapters against the fake", async () => {
    const saved = { ...process.env };
    try {
      Object.assign(process.env, { ERA_EMBEDDING_PROVIDER: "openai", OPENAI_API_KEY: "k", OPENAI_BASE_URL: `${FAKE}/v1`, ERA_EMBEDDING_DIMENSIONS: "16" });
      assert.equal((await getEmbeddingProvider()!.embed(["x"], "document"))[0].length, 16);
      Object.assign(process.env, { ERA_EMBEDDING_PROVIDER: "ollama", OLLAMA_BASE_URL: FAKE, ERA_EMBEDDING_MODEL: "nomic", ERA_EMBEDDING_DIMENSIONS: "" });
      assert.equal((await getEmbeddingProvider()!.embed(["x", "y"], "document")).length, 2);
    } finally {
      process.env = saved;
    }
  });

  test("configuration: missing keys and the production guard for test embeddings", () => {
    const saved = { ...process.env };
    try {
      Object.assign(process.env, { ERA_EMBEDDING_PROVIDER: "voyage", VOYAGE_API_KEY: "" });
      assert.throws(() => getEmbeddingProvider(), (e: unknown) => (e as EmbeddingError).code === "embedding-not-configured");
      Object.assign(process.env, { ERA_EMBEDDING_PROVIDER: "test", NODE_ENV: "production", ERA_ALLOW_TEST_EMBEDDINGS: "" });
      assert.throws(() => getEmbeddingProvider(), /disabled in production/);
      Object.assign(process.env, { ERA_EMBEDDING_PROVIDER: "" });
      assert.equal(getEmbeddingProvider(), null);
    } finally {
      process.env = saved;
    }
  });
});

// ------------------------------------------------------------------ ingestion pipeline + retrieval + authorization
describe("C/D. Ingestion pipeline, retrieval and authorization (database)", () => {
  const docs: Record<string, string> = {};
  const make = async (key: string, data: Record<string, unknown>, text: string, type = "txt") => {
    const document = await prisma.knowledgeDocument.create({
      data: {
        title: key,
        originalFilename: `${key}.${type}`,
        fileType: type,
        mimeType: type === "pdf" ? "application/pdf" : "text/plain",
        fileSize: text.length,
        storagePath: `users/x/knowledge-documents/2026-11/${key}.${type}`,
        contentHash: `hash-${key}`,
        uploadedById: u.teacherA.id,
        scope: "COURSE",
        ...data
      } as never
    });
    docs[key] = document.id;
    const bytes = type === "pdf" ? makePdf(text.split("|")) : utf8(text);
    const result = await processKnowledgeDocument(document.id, async () => bytes);
    return result;
  };

  before(async () => {
    await prisma.knowledgeDocument.deleteMany({ where: { contentHash: { startsWith: "hash-" } } });
    const A = fx.courses.courseA.id;
    const B = fx.courses.courseB.id;
    await make("courseA", { courseId: A }, "Intro page|Overfitting happens when a model memorizes the training data and fails on new data.", "pdf");
    await make("lessonA1", { scope: "LESSON", courseId: A, lessonId: fx.lessons.lessonA1.id }, "Gradient descent lowers the loss step by step overfitting check.");
    await make("lessonA2draft", { scope: "LESSON", courseId: A, lessonId: fx.lessons.lessonA2Draft.id }, "Draft lesson overfitting notes CORE_SECRET_DRAFT.");
    await make("answerKey", { courseId: A, visibility: "TEACHERS_ONLY" }, "Answer key overfitting question answer is B CORE_SECRET_KEY.");
    await make("privateA", { scope: "TEACHER_PRIVATE", visibility: "TEACHERS_ONLY" }, "My private overfitting teaching note CORE_SECRET_PRIVATE.");
    await make("courseB", { courseId: B, uploadedById: u.teacherB.id }, "Course B overfitting explanation CORE_SECRET_B.");
    await make("platform", { scope: "PLATFORM", uploadedById: u.admin.id }, "Platform glossary overfitting definition for everyone.");
    await make("platformStaff", { scope: "PLATFORM", visibility: "TEACHERS_ONLY", uploadedById: u.admin.id }, "Staff grading policy overfitting CORE_SECRET_STAFF.");
  });

  const titlesFor = async (user: AuthUser, agent: "student" | "teacher" | "admin", extra: Record<string, unknown> = {}) => {
    const result = await retrieveKnowledge(user, "overfitting", { agent, topK: 20, minScore: -1, ...extra });
    assert.equal(result.status, "ok");
    return new Set((result.status === "ok" ? result.passages : []).map((passage) => passage.title));
  };

  test("pipeline: COMPLETED with chunks, pages, model and dimensions", async () => {
    const document = await prisma.knowledgeDocument.findUniqueOrThrow({ where: { id: docs.courseA } });
    assert.equal(document.status, "COMPLETED");
    assert.equal(document.pageCount, 2);
    assert.ok(document.chunkCount >= 1);
    assert.equal(document.embeddingModel, `test:hashing:${TEST_EMBEDDING_DIMENSIONS}`);
    assert.equal(document.embeddingDimensions, TEST_EMBEDDING_DIMENSIONS);
    const rows = await prisma.$queryRaw<Array<{ dims: number; page_start: number | null; page_end: number | null; content: string }>>`SELECT vector_dims("embedding") AS dims, "page_start", "page_end", "content" FROM "knowledge_chunks" WHERE "document_id" = ${docs.courseA}`;
    assert.ok(rows.every((row) => Number(row.dims) === TEST_EMBEDDING_DIMENSIONS));
    // The chunk holding the page-2 sentence records a page range that includes page 2.
    const overfitting = rows.find((row) => row.content.includes("Overfitting happens"));
    assert.ok(overfitting && overfitting.page_start !== null && overfitting.page_end === 2 && overfitting.page_start <= 2, JSON.stringify(rows.map((r) => [r.page_start, r.page_end])));
  });

  test("processing failures: FAILED with a safe code and no orphaned chunks; never COMPLETED", async () => {
    const broken = await prisma.knowledgeDocument.create({
      data: { title: "broken", originalFilename: "broken.pdf", fileType: "pdf", mimeType: "application/pdf", fileSize: 10, storagePath: "users/x/knowledge-documents/2026-11/b.pdf", contentHash: "hash-broken", uploadedById: u.teacherA.id, scope: "COURSE", courseId: fx.courses.courseA.id }
    });
    assert.deepEqual(await processKnowledgeDocument(broken.id, async () => utf8("%PDF-1.4 not really")), { status: "FAILED", errorCode: "corrupted-file" });
    const empty = await prisma.knowledgeDocument.create({
      data: { title: "blank", originalFilename: "blank.txt", fileType: "txt", mimeType: "text/plain", fileSize: 3, storagePath: "users/x/knowledge-documents/2026-11/c.txt", contentHash: "hash-blank", uploadedById: u.teacherA.id, scope: "COURSE", courseId: fx.courses.courseA.id }
    });
    assert.deepEqual(await processKnowledgeDocument(empty.id, async () => utf8("   \n\n  ")), { status: "FAILED", errorCode: "no-text" });
    const embedFail = await prisma.knowledgeDocument.create({
      data: { title: "embedfail", originalFilename: "e.txt", fileType: "txt", mimeType: "text/plain", fileSize: 3, storagePath: "users/x/knowledge-documents/2026-11/e.txt", contentHash: "hash-embedfail", uploadedById: u.teacherA.id, scope: "COURSE", courseId: fx.courses.courseA.id }
    });
    assert.deepEqual(await processKnowledgeDocument(embedFail.id, async () => utf8("text FORCE_EMBEDDING_FAILURE")), { status: "FAILED", errorCode: "embedding-failed" });
    for (const id of [broken.id, empty.id, embedFail.id]) {
      const row = await prisma.knowledgeDocument.findUniqueOrThrow({ where: { id } });
      assert.equal(row.status, "FAILED");
      assert.equal(row.chunkCount, 0);
      assert.ok(row.errorMessage && !/stack|at \w+ \(/.test(row.errorMessage));
      assert.equal(await prisma.knowledgeChunk.count({ where: { documentId: id } }), 0);
    }
    // A document already being processed is not processed twice.
    assert.deepEqual(await processKnowledgeDocument(docs.courseA, async () => utf8("x")), { status: "SKIPPED" });
  });

  test("student (enrolled in A): course A + own published lesson + platform; nothing restricted", async () => {
    const titles = await titlesFor(u.studentA, "student");
    for (const allowed of ["courseA", "lessonA1", "platform"]) assert.ok(titles.has(allowed), allowed);
    for (const denied of ["lessonA2draft", "answerKey", "privateA", "courseB", "platformStaff"]) assert.ok(!titles.has(denied), denied);
  });

  test("student not enrolled: only platform knowledge", async () => {
    await prisma.enrollment.deleteMany({ where: { userId: u.studentC.id, courseId: fx.courses.courseB.id } });
    const titles = await titlesFor(u.studentC, "student");
    assert.deepEqual([...titles], ["platform"]);
  });

  test("teacher A: own courses (incl. teachers-only and drafts), own private, platform; not course B", async () => {
    const titles = await titlesFor(u.teacherA, "teacher");
    for (const allowed of ["courseA", "lessonA1", "lessonA2draft", "answerKey", "privateA", "platform", "platformStaff"]) assert.ok(titles.has(allowed), allowed);
    assert.ok(!titles.has("courseB"));
  });

  test("teacher B: course B and platform; never teacher A's documents", async () => {
    const titles = await titlesFor(u.teacherB, "teacher");
    assert.ok(titles.has("courseB") && titles.has("platform"));
    for (const denied of ["courseA", "lessonA1", "answerKey", "privateA"]) assert.ok(!titles.has(denied), denied);
  });

  test("teacher without a profile: platform only (plus their own private uploads, none here)", async () => {
    const titles = await titlesFor(u.teacherNoProfile, "teacher");
    assert.ok([...titles].every((title) => title === "platform" || title === "platformStaff"));
  });

  test("admin: platform + all courses; teacher-private notes excluded", async () => {
    const titles = await titlesFor(u.admin, "admin");
    for (const allowed of ["courseA", "courseB", "lessonA1", "answerKey", "platform", "platformStaff"]) assert.ok(titles.has(allowed), allowed);
    assert.ok(!titles.has("privateA"));
  });

  test("role/agent mismatch fails closed (e.g. a teacher using the student agent)", async () => {
    const result = await retrieveKnowledge(u.teacherA, "overfitting", { agent: "student", minScore: -1 });
    assert.deepEqual(result.status === "ok" ? result.passages : null, []);
    const admin = await retrieveKnowledge(u.teacherA, "overfitting", { agent: "admin", minScore: -1 });
    assert.deepEqual(admin.status === "ok" ? admin.passages : null, []);
  });

  test("C. semantic ranking, top-K, thresholds and filters", async () => {
    const ranked = await retrieveKnowledge(u.teacherA, "what does gradient descent do to the loss", { agent: "teacher", topK: 3, minScore: -1 });
    assert.equal(ranked.status, "ok");
    const passages = ranked.status === "ok" ? ranked.passages : [];
    assert.equal(passages.length, 3, "top-K respected");
    assert.equal(passages[0].title, "lessonA1", "best match first");
    assert.ok(passages[0].score >= passages[1].score && passages[1].score >= passages[2].score);

    const course = await titlesFor(u.teacherA, "teacher", { courseId: fx.courses.courseB.id });
    assert.ok(!course.has("courseA") && !course.has("lessonA1"), "course filter narrows");
    const lesson = await titlesFor(u.studentA, "student", { courseId: fx.courses.courseA.id, lessonId: fx.lessons.lessonA1.id });
    assert.ok(lesson.has("lessonA1") && lesson.has("courseA"));
    const otherLesson = await titlesFor(u.teacherA, "teacher", { lessonId: fx.lessons.lessonA2Draft.id });
    assert.ok(!otherLesson.has("lessonA1") && otherLesson.has("lessonA2draft"), "lesson filter narrows lesson documents");
    const onlyDoc = await titlesFor(u.teacherA, "teacher", { documentIds: [docs.platform] });
    assert.deepEqual([...onlyDoc], ["platform"]);

    const strict = await retrieveKnowledge(u.studentA, "zebra photosynthesis volcano", { agent: "student", minScore: 0.5 });
    assert.deepEqual(strict.status === "ok" ? strict.passages : null, [], "empty result above the threshold");
  });

  test("vectors from another embedding model are never compared", async () => {
    const results = await searchKnowledge(u.admin, testEmbedding("overfitting"), "voyage:voyage-3.5:1024", { agent: "admin", minScore: -1 });
    assert.deepEqual(results, []);
  });

  test("retrieval never throws: provider failure → status error; no provider → disabled", async () => {
    const failing = await retrieveKnowledge(u.studentA, "FORCE_EMBEDDING_FAILURE", { agent: "student" });
    assert.equal(failing.status, "error");
    const disabled = await retrieveKnowledge(u.studentA, "overfitting", { agent: "student" }, null);
    assert.equal(disabled.status, "disabled");
  });
});
