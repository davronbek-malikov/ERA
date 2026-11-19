import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { signForPurpose } from "@/lib/auth";

/*
 * Encryption for a teacher's Telegram login (a full account session). AES-256-GCM with a key that only the
 * server has: TELEGRAM_SESSION_KEY (32 bytes, base64) if set, otherwise derived from AUTH_SECRET for this one
 * purpose. Rotating the key logs every connected teacher out of ERA's Telegram connection (they reconnect).
 */

function key(): Buffer {
  const configured = process.env.TELEGRAM_SESSION_KEY?.trim();
  if (configured) {
    const raw = Buffer.from(configured, "base64");
    if (raw.length === 32) return raw;
  }
  return Buffer.from(signForPurpose("telegram-session-key", "v1"), "base64url");
}

export function encryptSession(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

/** The session, or null when it can't be decrypted (wrong key, tampered, empty). */
export function decryptSession(sealed: string | null | undefined): string | null {
  if (!sealed) return null;
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !body) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
