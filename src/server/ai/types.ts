import type { AiAgent, UserRole } from "@prisma/client";

import type { KnowledgeSource } from "@/server/ai/knowledge";

/*
 * ERA AI Agent Engine — shared types (Prompt 08, docs/ERA_AI_ARCHITECTURE.md).
 * Everything in src/server/ai is server-only: provider keys, prompts and context never reach the browser.
 */

export type ProviderName = "anthropic" | "openai" | "ollama";

export type AgentKind = "student" | "teacher" | "admin";

export const AGENT_ENUM: Record<AgentKind, AiAgent> = {
  student: "STUDENT_TUTOR",
  teacher: "TEACHER_ASSISTANT",
  admin: "ADMIN_ASSISTANT"
};

/** One turn sent to a provider. System instructions travel separately. */
export type EngineMessage = { role: "user" | "assistant"; content: string };

export type ProviderRequest = {
  system: string;
  messages: EngineMessage[];
  maxOutputTokens: number;
  signal: AbortSignal;
};

export type ProviderUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  /** "provider" = reported by the provider; "unavailable" = the provider did not report usage. */
  source: "provider" | "unavailable";
};

export type ProviderEvent =
  | { type: "text"; text: string }
  /** Discard text streamed so far (e.g. Claude's server-side fallback took over mid-answer). */
  | { type: "reset" }
  /** `finalText`, when present, is the provider's authoritative complete answer. */
  | { type: "done"; usage: ProviderUsage; stopReason: string | null; model: string; finalText?: string };

/** Provider adapter contract. Adapters translate; they never decide access or persist anything. */
export interface AiProvider {
  readonly name: ProviderName;
  readonly model: string;
  /** Streams text deltas, then exactly one `done` event. Throws `AiError` on failure or cancellation. */
  stream(request: ProviderRequest): AsyncGenerator<ProviderEvent>;
}

/**
 * The already-authorized execution context the engine receives. Built only by server code after
 * `src/server/authz.ts` checks; nothing in it comes from the request body except the message text.
 */
export type ExecutionContext = {
  user: { id: string; role: UserRole; name: string };
  agent: AgentKind;
  /** What the model receives for this turn. */
  message: string;
  /** What is saved and shown for the user's turn, when it differs (Ask ERA AI selections). */
  storedMessage?: string;
  /** Untrusted reference material the agent may use (lesson notes, course outline, platform stats, KB passages). */
  contextBlocks: ContextBlock[];
  /** Knowledge Base passages included in `contextBlocks` (Prompt 09); returned and saved with the answer. */
  sources?: KnowledgeSource[];
  /** Earlier turns of this conversation (owned by the user, already loaded by the server). */
  history: EngineMessage[];
  /** Where completed turns are saved. */
  thread:
    | { kind: "lesson"; courseId: string; lessonId: string }
    | { kind: "conversation"; conversationId: string | null; courseId: string | null; title: string };
  locale: "uz" | "en" | "ru" | null;
};

/** A labelled block of reference data. Always rendered as data, never as instructions. */
export type ContextBlock = { label: string; content: string };

export type EngineEvent =
  | { type: "start"; conversationId: string | null; provider: ProviderName; model: string }
  | { type: "delta"; text: string }
  | { type: "reset" }
  | {
      type: "done";
      conversationId: string | null;
      messages: Array<{ id: string; role: "USER" | "ASSISTANT"; content: string; createdAt: string; sources?: KnowledgeSource[] }>;
    }
  | { type: "error"; code: string; message: string; retryable: boolean };
