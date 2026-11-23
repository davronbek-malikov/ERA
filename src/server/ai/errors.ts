import { RequestError } from "@/lib/validation";

/**
 * Engine errors. `message` is always safe to show a user: it never contains provider responses, keys,
 * prompts or stack traces. Details for operators go to the server log via `logDetail`.
 */
export type AiErrorCode =
  | "ai-not-configured"
  | "ai-provider-auth"
  | "ai-provider-busy"
  | "ai-provider-unavailable"
  | "ai-refused"
  | "ai-empty-response"
  | "ai-stream-interrupted"
  | "ai-cancelled"
  | "ai-limit-reached";

const SAFE_MESSAGES: Record<AiErrorCode, string> = {
  "ai-not-configured": "The AI assistant isn't set up yet. Please contact the administrator.",
  "ai-provider-auth": "The AI assistant is temporarily unavailable. Please contact the administrator.",
  "ai-provider-busy": "The AI assistant is busy right now. Please try again in a minute.",
  "ai-provider-unavailable": "ERA is temporarily unavailable. Please try again in a moment.",
  "ai-refused": "ERA can't help with that request. Try asking about the lesson in a different way.",
  "ai-empty-response": "ERA couldn't produce an answer. Please try again.",
  "ai-stream-interrupted": "The answer was interrupted and wasn't saved. Please try again.",
  "ai-cancelled": "Stopped. This answer wasn't saved.",
  "ai-limit-reached": "You've reached today's AI usage limit. It resets tomorrow."
};

const STATUS: Record<AiErrorCode, number> = {
  "ai-not-configured": 503,
  "ai-provider-auth": 503,
  "ai-provider-busy": 503,
  "ai-provider-unavailable": 503,
  "ai-refused": 422,
  "ai-empty-response": 502,
  "ai-stream-interrupted": 502,
  "ai-cancelled": 499,
  "ai-limit-reached": 429
};

const RETRYABLE = new Set<AiErrorCode>(["ai-provider-busy", "ai-provider-unavailable", "ai-empty-response", "ai-stream-interrupted"]);

/** Extends the Prompt 07 RequestError, so `toApiErrorResponse` returns its status, code and safe message. */
export class AiError extends RequestError {
  declare readonly code: AiErrorCode;
  readonly retryable: boolean;
  /** Operator-only detail (never sent to clients). */
  readonly logDetail: string | undefined;

  constructor(code: AiErrorCode, logDetail?: string) {
    super(STATUS[code], code, SAFE_MESSAGES[code]);
    this.name = "AiError";
    this.retryable = RETRYABLE.has(code);
    this.logDetail = logDetail;
  }
}

export function isAbortError(error: unknown) {
  return error instanceof Error && (error.name === "AbortError" || error.name === "APIUserAbortError");
}
