import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { isDatabaseOfflineError } from "@/lib/server-data";

export type ActionErrorCode =
  | "account-inactive"
  | "account-update-failed"
  | "action-failed"
  | "database-offline"
  | "duplicate-email"
  | "duplicate-phone"
  | "duplicate-record"
  | "invalid-reference"
  | "rate-limited"
  | "service-unavailable"
  | "validation-failed";

export function getPrismaActionErrorCode(error: unknown): ActionErrorCode {
  if (isDatabaseOfflineError(error)) {
    return "database-offline";
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return "validation-failed";
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      const target = Array.isArray(error.meta?.target)
        ? error.meta.target.map(String)
        : typeof error.meta?.target === "string"
          ? [error.meta.target]
          : [];

      if (target.some((value) => value.toLowerCase().includes("email"))) {
        return "duplicate-email";
      }

      if (target.some((value) => value.toLowerCase().includes("phone"))) {
        return "duplicate-phone";
      }

      return "duplicate-record";
    }

    if (error.code === "P2003" || error.code === "P2025") {
      return "invalid-reference";
    }
  }

  return "action-failed";
}

export function getActionErrorRedirectPath(path: string, error: unknown, fallback?: ActionErrorCode) {
  const code = getPrismaActionErrorCode(error);
  const resolved = code === "action-failed" && fallback ? fallback : code;
  return `${path}${path.includes("?") ? "&" : "?"}error=${resolved}`;
}

export function createApiErrorResponse(
  status: number,
  code: string,
  message: string,
  options?: {
    retryable?: boolean;
  }
) {
  return NextResponse.json(
    {
      ok: false,
      code,
      error: message,
      retryable: options?.retryable ?? false
    },
    { status }
  );
}

export function createApiSuccessResponse<T extends Record<string, unknown>>(payload: T, status = 200) {
  return NextResponse.json(
    {
      ok: true,
      ...payload
    },
    { status }
  );
}
