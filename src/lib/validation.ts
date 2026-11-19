/**
 * Small, dependency-free validators for API input (Prompt 07).
 * Every route handler reads its body through `readJsonObject` and its fields through these helpers,
 * so malformed input becomes a 400 with a fixed message instead of an exception.
 */

/** An error that is safe to show to the client: status, machine code and a fixed human message. */
export class RequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "RequestError";
    this.status = status;
    this.code = code;
  }
}

export function invalid(code: string, message: string) {
  return new RequestError(400, code, message);
}

const DEFAULT_MAX_BODY_BYTES = 64 * 1024;

/** Reads a JSON object body with a size cap. Arrays, primitives and invalid JSON are rejected. */
export async function readJsonObject(request: Request, maxBytes = DEFAULT_MAX_BODY_BYTES): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new RequestError(413, "payload-too-large", "The request is too large.");
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    throw invalid("invalid-json", "The request body could not be read.");
  }

  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new RequestError(413, "payload-too-large", "The request is too large.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw invalid("invalid-json", "The request body must be valid JSON.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw invalid("invalid-payload", "The request body must be a JSON object.");
  }

  return parsed as Record<string, unknown>;
}

/** Database IDs are cuids (or seed slugs-as-ids): short, URL-safe tokens. */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

export function requireId(value: unknown, field: string): string {
  const trimmed = typeof value === "string" ? value.trim() : value;
  if (!isValidId(trimmed)) {
    throw invalid(`invalid-${field}`, `A valid ${field} is required.`);
  }
  return trimmed;
}

export function optionalId(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requireId(value, field);
}

export function requireString(value: unknown, field: string, options: { min?: number; max: number }): string {
  if (typeof value !== "string") {
    throw invalid(`invalid-${field}`, `${field} must be text.`);
  }
  const trimmed = value.trim();
  const min = options.min ?? 1;
  if (trimmed.length < min) {
    throw invalid(`invalid-${field}`, min <= 1 ? `${field} is required.` : `${field} must be at least ${min} characters.`);
  }
  if (trimmed.length > options.max) {
    throw invalid(`${field}-too-long`, `${field} must be ${options.max} characters or less.`);
  }
  return trimmed;
}

export function optionalInteger(value: unknown, field: string, options: { min: number; max: number }): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < options.min || value > options.max) {
    throw invalid(`invalid-${field}`, `${field} must be a whole number between ${options.min} and ${options.max}.`);
  }
  return value;
}

export function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") {
    throw invalid(`invalid-${field}`, `${field} must be true or false.`);
  }
  return value;
}

/** Only absolute http(s) URLs. Rejects `javascript:`, `data:`, protocol-relative and relative URLs. */
export function isSafeHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
