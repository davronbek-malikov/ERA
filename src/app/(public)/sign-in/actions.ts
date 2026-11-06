"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createUserSession,
  normalizePhone,
  sanitizeNextPath,
  verifyPassword
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertRateLimit, clearRateLimit, getRequestRateLimitKeyParts, RateLimitError } from "@/lib/rate-limit";
import { isDatabaseOfflineError, retryOnDatabaseFailure } from "@/lib/server-data";
import { getOnboardingGateStatus } from "@/server/onboarding";

function asString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

async function findUserForSignIn(identifier: string, normalizedPhone: string) {
  if (identifier.includes("@")) {
    return prisma.user.findUnique({
      where: { email: identifier }
    });
  }

  if (normalizedPhone) {
    return prisma.user.findUnique({
      where: { phone: normalizedPhone }
    });
  }

  return prisma.user.findFirst({
    where: {
      OR: [{ email: identifier }, { phone: normalizedPhone || "__no_phone__" }]
    }
  });
}

export async function signInAction(formData: FormData) {
  const identifier = asString(formData, "identifier");
  const password = asString(formData, "password");
  const nextPath = sanitizeNextPath(asString(formData, "next"), "/admin");
  const normalizedIdentifier = identifier.toLowerCase();

  if (!identifier || !password) {
    redirect(`/sign-in?error=missing-fields&next=${encodeURIComponent(nextPath)}`);
  }

  const normalizedPhone = normalizePhone(identifier);
  const authLookupIdentifier = normalizedPhone || normalizedIdentifier;
  const rateLimitKeyParts = await getRequestRateLimitKeyParts(authLookupIdentifier);

  try {
    await assertRateLimit({
      scope: "sign-in",
      maxAttempts: 5,
      windowMs: 10 * 60 * 1000,
      cooldownMs: 15 * 60 * 1000,
      keyParts: rateLimitKeyParts
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      redirect(`/sign-in?error=rate-limited&next=${encodeURIComponent(nextPath)}`);
    }

    throw error;
  }

  let user;
  try {
    user = await retryOnDatabaseFailure(() =>
      Promise.race([
        findUserForSignIn(authLookupIdentifier, normalizedPhone),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("database auth query timed out")), 8000)
      )
      ])
    );
  } catch (error) {
    if (
      isDatabaseOfflineError(error) ||
      (error instanceof Error && error.message === "database auth query timed out")
    ) {
      redirect(`/sign-in?error=service-unavailable&next=${encodeURIComponent(nextPath)}`);
    }

    throw error;
  }

  if (!user?.passwordHash) {
    redirect(`/sign-in?error=invalid-credentials&next=${encodeURIComponent(nextPath)}`);
  }

  if (user.status !== "ACTIVE") {
    redirect(`/sign-in?error=inactive-account&next=${encodeURIComponent(nextPath)}`);
  }

  const validPassword = await verifyPassword(password, user.passwordHash);
  if (!validPassword) {
    redirect(`/sign-in?error=invalid-credentials&next=${encodeURIComponent(nextPath)}`);
  }

  await createUserSession(user.id, user.role, user.name);
  clearRateLimit("sign-in", rateLimitKeyParts);
  revalidatePath("/", "layout");
  revalidatePath("/admin");
  revalidatePath("/my-learning");
  revalidatePath("/courses");

  if (user.role === "ADMIN") {
    const target = nextPath.startsWith("/admin") ? nextPath : "/admin";
    redirect(`${target}${target.includes("?") ? "&" : "?"}signedIn=1`);
  }

  if (user.role === "INSTRUCTOR") {
    // Teachers land in the Teacher Workspace, or on a studio editor they may use. Admin-only pages would only
    // bounce them, so they are never a sign-in destination (Prompt 09 acceptance audit).
    const studio = /^\/admin\/(courses|lessons|materials|progress|settings)(\/|\?|$)/;
    const target = nextPath.startsWith("/teacher") || studio.test(nextPath) ? nextPath : "/teacher";
    redirect(`${target}${target.includes("?") ? "&" : "?"}signedIn=1`);
  }

  if (await getOnboardingGateStatus(user.id)) {
    redirect("/onboarding?returning=1");
  }

  const target = nextPath === "/admin" ? "/my-learning" : nextPath;
  redirect(`${target}${target.includes("?") ? "&" : "?"}signedIn=1`);
}

export async function signOutAction() {
  const { clearUserSession } = await import("@/lib/auth");
  await clearUserSession();
  revalidatePath("/", "layout");
  revalidatePath("/admin");
  revalidatePath("/my-learning");
  revalidatePath("/courses");
  redirect("/sign-in?signedOut=1");
}
