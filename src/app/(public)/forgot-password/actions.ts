"use server";

import { redirect } from "next/navigation";

import { hashPassword } from "@/lib/auth";
import { getActionErrorRedirectPath } from "@/lib/app-errors";
import { isEmailConfigured, sendMail } from "@/lib/mailer";
import {
  generatePasswordResetCode,
  getPasswordResetEmailContent,
  getPasswordResetExpiry,
  hashPasswordResetCode
} from "@/lib/password-reset";
import { prisma } from "@/lib/prisma";
import { assertRateLimit, getRequestRateLimitKeyParts, RateLimitError } from "@/lib/rate-limit";
import { retryOnDatabaseFailure } from "@/lib/server-data";

function asString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function requestPasswordResetCodeAction(formData: FormData) {
  const email = asString(formData, "email").toLowerCase();

  if (!email) {
    redirect("/forgot-password?error=missing-email");
  }

  if (!isEmailConfigured()) {
    redirect(`/forgot-password?error=email-not-configured&email=${encodeURIComponent(email)}`);
  }

  try {
    await assertRateLimit({
      scope: "password-reset-request",
      maxAttempts: 3,
      windowMs: 15 * 60 * 1000,
      cooldownMs: 20 * 60 * 1000,
      keyParts: await getRequestRateLimitKeyParts(email)
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      redirect(`/forgot-password?error=rate-limited&email=${encodeURIComponent(email)}`);
    }

    throw error;
  }

  const user = await retryOnDatabaseFailure(() =>
    prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true }
    })
  ).catch((error) => {
    redirect(getActionErrorRedirectPath(`/forgot-password?email=${encodeURIComponent(email)}`, error, "service-unavailable"));
  });

  if (user) {
    const code = generatePasswordResetCode();

    await retryOnDatabaseFailure(() =>
      prisma.passwordResetCode.create({
        data: {
          userId: user.id,
          email: user.email,
          codeHash: hashPasswordResetCode(code),
          expiresAt: getPasswordResetExpiry()
        }
      })
    ).catch((error) => {
      redirect(getActionErrorRedirectPath(`/forgot-password?email=${encodeURIComponent(email)}`, error, "service-unavailable"));
    });

    const message = getPasswordResetEmailContent(code);
    await sendMail({
      to: user.email,
      subject: message.subject,
      text: message.text,
      html: message.html
    });
  }

  redirect(`/forgot-password?sent=1&email=${encodeURIComponent(email)}`);
}

export async function resetPasswordWithCodeAction(formData: FormData) {
  const email = asString(formData, "email").toLowerCase();
  const code = asString(formData, "code");
  const password = asString(formData, "password");
  const confirmPassword = asString(formData, "confirmPassword");

  if (!email || !code || !password || !confirmPassword) {
    redirect(`/forgot-password?error=missing-reset-fields&email=${encodeURIComponent(email)}`);
  }

  if (password.length < 8) {
    redirect(`/forgot-password?error=password-too-short&email=${encodeURIComponent(email)}`);
  }

  if (password !== confirmPassword) {
    redirect(`/forgot-password?error=password-mismatch&email=${encodeURIComponent(email)}`);
  }

  try {
    await assertRateLimit({
      scope: "password-reset-submit",
      maxAttempts: 5,
      windowMs: 15 * 60 * 1000,
      cooldownMs: 20 * 60 * 1000,
      keyParts: await getRequestRateLimitKeyParts(email)
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      redirect(`/forgot-password?error=rate-limited&email=${encodeURIComponent(email)}`);
    }

    throw error;
  }

  const user = await retryOnDatabaseFailure(() =>
    prisma.user.findUnique({
      where: { email },
      select: { id: true }
    })
  ).catch((error) => {
    redirect(getActionErrorRedirectPath(`/forgot-password?email=${encodeURIComponent(email)}`, error, "service-unavailable"));
  });

  if (!user) {
    redirect(`/forgot-password?error=invalid-code&email=${encodeURIComponent(email)}`);
  }

  const resetCode = await retryOnDatabaseFailure(() =>
    prisma.passwordResetCode.findFirst({
      where: {
        userId: user.id,
        email,
        usedAt: null,
        expiresAt: {
          gt: new Date()
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    })
  ).catch((error) => {
    redirect(getActionErrorRedirectPath(`/forgot-password?email=${encodeURIComponent(email)}`, error, "service-unavailable"));
  });

  if (!resetCode || resetCode.codeHash !== hashPasswordResetCode(code)) {
    redirect(`/forgot-password?error=invalid-code&email=${encodeURIComponent(email)}`);
  }

  const passwordHash = await hashPassword(password);

  await retryOnDatabaseFailure(() =>
    prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash
        }
      }),
      prisma.passwordResetCode.update({
        where: { id: resetCode.id },
        data: {
          usedAt: new Date()
        }
      }),
      prisma.passwordResetCode.updateMany({
        where: {
          userId: user.id,
          id: {
            not: resetCode.id
          },
          usedAt: null
        },
        data: {
          usedAt: new Date()
        }
      })
    ])
  ).catch((error) => {
    redirect(getActionErrorRedirectPath(`/forgot-password?email=${encodeURIComponent(email)}`, error, "service-unavailable"));
  });

  redirect("/sign-in?reset=1");
}
