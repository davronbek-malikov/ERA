import { createHash } from "node:crypto";

/*
 * Embedding infrastructure (Prompt 09, docs/ERA_KNOWLEDGE_BASE.md §4).
 *
 * One interface, several providers. Document chunks and user questions MUST be embedded by the same model:
 * every stored chunk records `embeddingModel` (provider:model:dimensions) and retrieval only compares vectors with
 * the same identifier.
 *
 * Providers:
 *  - voyage  (recommended; Anthropic's recommended embeddings partner)  VOYAGE_API_KEY
 *  - openai                                                              OPENAI_API_KEY
 *  - ollama  (local development)                                         OLLAMA_BASE_URL
 *  - test    deterministic hashing embedder for automated tests ONLY. It captures word overlap, not meaning, and
 *            refuses to run in production unless ERA_ALLOW_TEST_EMBEDDINGS=1 (set by the isolated test runner).
 */

export type EmbeddingPurpose = "document" | "query";

export interface EmbeddingProvider {
  /** Stable identifier stored with every vector, e.g. "voyage:voyage-3.5:1024". */
  readonly id: string;
  readonly dimensions: number | null;
  embed(texts: string[], purpose: EmbeddingPurpose): Promise<number[][]>;
}

export class EmbeddingError extends Error {
  constructor(
    readonly code: "embedding-not-configured" | "embedding-provider-failed" | "embedding-invalid-response",
    detail: string,
    readonly retryable = false
  ) {
    super(detail);
    this.name = "EmbeddingError";
  }
}

function env(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function intEnv(name: string, fallback: number) {
  const parsed = Number(env(name));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** Validates a provider response: one finite vector per input, all of the same (expected) length. */
export function validateVectors(vectors: unknown, expectedCount: number, expectedDimensions: number | null): number[][] {
  if (!Array.isArray(vectors) || vectors.length !== expectedCount) {
    throw new EmbeddingError("embedding-invalid-response", `expected ${expectedCount} vectors`);
  }
  const length = expectedDimensions ?? (Array.isArray(vectors[0]) ? vectors[0].length : 0);
  if (!length) throw new EmbeddingError("embedding-invalid-response", "empty vector");
  for (const vector of vectors) {
    if (!Array.isArray(vector) || vector.length !== length || !vector.every((value) => typeof value === "number" && Number.isFinite(value))) {
      throw new EmbeddingError("embedding-invalid-response", `vector dimension mismatch (expected ${length})`);
    }
  }
  return vectors as number[][];
}

/** POST with retries on 429/5xx/network errors (exponential backoff). */
async function postJson(url: string, body: unknown, headers: Record<string, string>, provider: string) {
  const attempts = intEnv("ERA_EMBEDDING_RETRIES", 2) + 1;
  let lastError: EmbeddingError | null = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** (attempt - 1)));
    let response: Response;
    try {
      response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), cache: "no-store" });
    } catch {
      lastError = new EmbeddingError("embedding-provider-failed", `${provider} connection error`, true);
      continue;
    }
    if (response.ok) return response.json();
    lastError = new EmbeddingError("embedding-provider-failed", `${provider} HTTP ${response.status}`, response.status === 429 || response.status >= 500);
    if (!lastError.retryable) break;
  }
  throw lastError ?? new EmbeddingError("embedding-provider-failed", `${provider} failed`);
}

function voyageProvider(): EmbeddingProvider {
  const apiKey = env("VOYAGE_API_KEY");
  if (!apiKey) throw new EmbeddingError("embedding-not-configured", "VOYAGE_API_KEY is not set");
  const model = env("ERA_EMBEDDING_MODEL") ?? "voyage-3.5";
  const dimensions = intEnv("ERA_EMBEDDING_DIMENSIONS", 1024);
  const baseUrl = (env("VOYAGE_BASE_URL") ?? "https://api.voyageai.com/v1").replace(/\/+$/, "");
  return {
    id: `voyage:${model}:${dimensions}`,
    dimensions,
    async embed(texts, purpose) {
      const payload = (await postJson(
        `${baseUrl}/embeddings`,
        { input: texts, model, input_type: purpose, output_dimension: dimensions },
        { Authorization: `Bearer ${apiKey}` },
        "voyage"
      )) as { data?: Array<{ embedding: number[]; index: number }> };
      const ordered = [...(payload.data ?? [])].sort((a, b) => a.index - b.index).map((item) => item.embedding);
      return validateVectors(ordered, texts.length, dimensions);
    }
  };
}

function openAiProvider(): EmbeddingProvider {
  const apiKey = env("OPENAI_API_KEY") ?? env("ERA_API_KEY");
  if (!apiKey) throw new EmbeddingError("embedding-not-configured", "OPENAI_API_KEY is not set");
  const model = env("ERA_EMBEDDING_MODEL") ?? "text-embedding-3-small";
  const dimensions = intEnv("ERA_EMBEDDING_DIMENSIONS", 1536);
  const baseUrl = (env("OPENAI_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  return {
    id: `openai:${model}:${dimensions}`,
    dimensions,
    async embed(texts) {
      const payload = (await postJson(
        `${baseUrl}/embeddings`,
        { input: texts, model, dimensions },
        { Authorization: `Bearer ${apiKey}` },
        "openai"
      )) as { data?: Array<{ embedding: number[]; index: number }> };
      const ordered = [...(payload.data ?? [])].sort((a, b) => a.index - b.index).map((item) => item.embedding);
      return validateVectors(ordered, texts.length, dimensions);
    }
  };
}

function ollamaProvider(): EmbeddingProvider {
  const model = env("ERA_EMBEDDING_MODEL");
  if (!model) throw new EmbeddingError("embedding-not-configured", "ERA_EMBEDDING_MODEL is required for ollama");
  const baseUrl = (env("OLLAMA_BASE_URL") ?? "http://127.0.0.1:11434").replace(/\/+$/, "");
  const configured = env("ERA_EMBEDDING_DIMENSIONS") ? intEnv("ERA_EMBEDDING_DIMENSIONS", 0) : null;
  return {
    id: `ollama:${model}${configured ? `:${configured}` : ""}`,
    dimensions: configured,
    async embed(texts) {
      const payload = (await postJson(`${baseUrl}/api/embed`, { model, input: texts }, {}, "ollama")) as { embeddings?: number[][] };
      return validateVectors(payload.embeddings, texts.length, configured);
    }
  };
}

export const TEST_EMBEDDING_DIMENSIONS = 256;

/** Lower-case word tokens (letters/digits in any script) — shared by the test embedder. */
function tokens(text: string) {
  return text.toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}]+/gu) ?? [];
}

/**
 * Deterministic feature-hashing embedder for automated tests. Identical text → identical vector; texts sharing
 * words → higher cosine similarity. It is NOT semantic and must never back production retrieval.
 */
export function testEmbedding(text: string, dimensions = TEST_EMBEDDING_DIMENSIONS) {
  const vector = new Array<number>(dimensions).fill(0);
  for (const token of tokens(text)) {
    if (token.length < 2) continue;
    const digest = createHash("sha256").update(token).digest();
    const index = digest.readUInt32BE(0) % dimensions;
    vector[index] += digest[4] & 1 ? 1 : -1;
  }
  const norm = Math.hypot(...vector);
  return norm === 0 ? vector.map((_, i) => (i === 0 ? 1 : 0)) : vector.map((value) => value / norm);
}

function testProvider(): EmbeddingProvider {
  if (process.env.NODE_ENV === "production" && env("ERA_ALLOW_TEST_EMBEDDINGS") !== "1") {
    throw new EmbeddingError("embedding-not-configured", "the test embedder is disabled in production");
  }
  return {
    id: `test:hashing:${TEST_EMBEDDING_DIMENSIONS}`,
    dimensions: TEST_EMBEDDING_DIMENSIONS,
    async embed(texts) {
      if (texts.some((text) => text.includes("FORCE_EMBEDDING_FAILURE"))) {
        throw new EmbeddingError("embedding-provider-failed", "test provider failure", true);
      }
      return texts.map((text) => testEmbedding(text));
    }
  };
}

/** The configured provider, or null when the Knowledge Base has no embedding provider (retrieval then disabled). */
export function getEmbeddingProvider(): EmbeddingProvider | null {
  const name = env("ERA_EMBEDDING_PROVIDER")?.toLowerCase();
  if (!name) return null;
  switch (name) {
    case "voyage":
      return voyageProvider();
    case "openai":
      return openAiProvider();
    case "ollama":
      return ollamaProvider();
    case "test":
      return testProvider();
    default:
      throw new EmbeddingError("embedding-not-configured", `ERA_EMBEDDING_PROVIDER "${name}" is not supported`);
  }
}

/** Embeds in batches (ERA_EMBEDDING_BATCH_SIZE, default 64), preserving order. */
export async function embedInBatches(provider: EmbeddingProvider, texts: string[], purpose: EmbeddingPurpose) {
  const batchSize = intEnv("ERA_EMBEDDING_BATCH_SIZE", 64);
  const vectors: number[][] = [];
  for (let start = 0; start < texts.length; start += batchSize) {
    const batch = texts.slice(start, start + batchSize);
    vectors.push(...(await provider.embed(batch, purpose)));
  }
  return validateVectors(vectors, texts.length, provider.dimensions);
}

/** pgvector text literal for a parameter: "[0.1,0.2,...]". Only finite numbers ever reach SQL. */
export function toVectorLiteral(vector: number[]) {
  if (!vector.every((value) => Number.isFinite(value))) throw new EmbeddingError("embedding-invalid-response", "non-finite value");
  return `[${vector.join(",")}]`;
}

/** True when an embedding provider is configured and usable (for UI notices). Never throws. */
export function isKnowledgeSearchConfigured() {
  try {
    return getEmbeddingProvider() !== null;
  } catch {
    return false;
  }
}
