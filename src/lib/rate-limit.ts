import { headers } from "next/headers";

type RateLimitBucket = {
  count: number;
  windowStart: number;
  cooldownUntil: number;
};

type RateLimitOptions = {
  scope: string;
  maxAttempts: number;
  windowMs: number;
  cooldownMs: number;
  keyParts: string[];
};

const rateLimitStore = new Map<string, RateLimitBucket>();

export class RateLimitError extends Error {
  retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function getStoreKey(scope: string, keyPart: string) {
  return `${scope}:${keyPart}`;
}

function touchBucket(key: string, options: Omit<RateLimitOptions, "scope" | "keyParts">) {
  const now = Date.now();
  const existing = rateLimitStore.get(key);

  if (!existing || now - existing.windowStart > options.windowMs) {
    const bucket: RateLimitBucket = {
      count: 1,
      windowStart: now,
      cooldownUntil: 0
    };
    rateLimitStore.set(key, bucket);
    return bucket;
  }

  existing.count += 1;

  if (existing.count >= options.maxAttempts) {
    existing.cooldownUntil = Math.max(existing.cooldownUntil, now + options.cooldownMs);
  }

  rateLimitStore.set(key, existing);
  return existing;
}

export async function assertRateLimit(options: RateLimitOptions) {
  const now = Date.now();
  const normalizedKeys = options.keyParts
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  for (const keyPart of normalizedKeys) {
    const storeKey = getStoreKey(options.scope, keyPart);
    const bucket = rateLimitStore.get(storeKey);

    if (bucket?.cooldownUntil && bucket.cooldownUntil > now) {
      throw new RateLimitError(
        "Too many attempts. Please wait before trying again.",
        Math.ceil((bucket.cooldownUntil - now) / 1000)
      );
    }
  }

  for (const keyPart of normalizedKeys) {
    const storeKey = getStoreKey(options.scope, keyPart);
    touchBucket(storeKey, options);
  }
}

export function clearRateLimit(scope: string, keyParts: string[]) {
  for (const keyPart of keyParts.map((value) => value.trim().toLowerCase()).filter(Boolean)) {
    rateLimitStore.delete(getStoreKey(scope, keyPart));
  }
}

export async function getRequestRateLimitKeyParts(identifier?: string) {
  const headerStore = await headers();
  const forwardedFor = headerStore.get("x-forwarded-for");
  const realIp = headerStore.get("x-real-ip");
  const ip =
    forwardedFor?.split(",")[0]?.trim() ||
    realIp?.trim() ||
    "unknown-ip";

  return [ip, identifier ?? ""];
}
