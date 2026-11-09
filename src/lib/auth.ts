import { createHmac, timingSafeEqual } from "crypto";
import { compare, hash } from "bcryptjs";
import { cookies } from "next/headers";
import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { retryOnDatabaseFailure } from "@/lib/server-data";

const SESSION_COOKIE = "era_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;

type SessionPayload = {
  userId: string;
  role: string;
  name: string;
  exp: number;
};

function getAuthSecret() {
  const secret = process.env.AUTH_SECRET;

  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be configured in production.");
  }

  return "era-dev-secret-change-me";
}

function base64UrlEncode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signValue(value: string) {
  return createHmac("sha256", getAuthSecret()).update(value).digest("base64url");
}

function encodeSession(payload: SessionPayload) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signValue(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function decodeSession(token: string): SessionPayload | null {
  try {
    const [encodedPayload, signature] = token.split(".");
    if (!encodedPayload || !signature) {
      return null;
    }

    const actualSignature = Buffer.from(signature);
    const expectedSignature = Buffer.from(signValue(encodedPayload));
    if (actualSignature.length !== expectedSignature.length) {
      return null;
    }

    const matches = timingSafeEqual(actualSignature, expectedSignature);
    if (!matches) {
      return null;
    }

    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function normalizePhone(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const normalized = trimmed.replace(/[^\d+]/g, "");
  if (normalized.startsWith("+")) {
    return `+${normalized.slice(1).replace(/\+/g, "")}`;
  }

  return normalized;
}

export function sanitizeNextPath(value: string | null | undefined, fallback = "/admin") {
  const trimmed = value?.trim();

  if (!trimmed) {
    return fallback;
  }

  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallback;
  }

  try {
    const parsed = new URL(trimmed, "http://localhost");
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export async function hashPassword(password: string) {
  return hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return compare(password, passwordHash);
}

export async function createUserSession(userId: string, role: string, name: string) {
  const cookieStore = await cookies();
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;
  const token = encodeSession({
    userId,
    role,
    name,
    exp: expiresAt
  });

  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS
  });
}

export async function clearUserSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  return decodeSession(token);
}

export async function getSessionUser() {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    role: user.role,
    name: user.name
  };
}

/**
 * The signed-in user, re-read from the database (so suspensions apply at once). Wrapped in React `cache()`:
 * a page, its layouts and the navigation all ask for the user, but the database is queried once per request.
 * Outside a React render (route handlers, server actions) `cache` doesn't dedupe and simply calls through.
 */
export const getCurrentUser = cache(async function getCurrentUser() {
  const session = await getSession();
  if (!session) {
    return null;
  }

  const user = await retryOnDatabaseFailure(() =>
    prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        image: true,
        role: true,
        status: true
      }
    })
  );

  if (!user || user.status !== "ACTIVE") {
    // Cookies can only be changed in Server Actions and Route Handlers. In Server Components the stale
    // cookie stays until the next action/route clears it; the user is treated as signed out either way.
    try {
      await clearUserSession();
    } catch {
      // ignore
    }
    return null;
  }

  return user;
});
