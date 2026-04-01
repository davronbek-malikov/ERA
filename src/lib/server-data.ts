import { Prisma } from "@prisma/client";

const transientDatabaseMessages = [
  "Can't reach database server",
  "ECONNREFUSED",
  "connect ECONNREFUSED",
  "max clients reached",
  "too many clients",
  "remaining connection slots are reserved",
  "connection limit exceeded",
  "connection pool timeout",
  "timed out fetching a new connection",
  "server closed the connection unexpectedly"
];

function errorMessageIncludesDatabaseFailure(message: string) {
  return transientDatabaseMessages.some((fragment) =>
    message.toLowerCase().includes(fragment.toLowerCase())
  );
}

export function isDatabaseOfflineError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError ||
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    (error instanceof Error &&
      errorMessageIncludesDatabaseFailure(error.message))
  );
}

export async function withDatabaseFallback<T>(
  query: () => Promise<T>,
  fallback: () => T | Promise<T>,
  options?: {
    allowFallback?: boolean;
    context?: string;
  }
) {
  try {
    return await query();
  } catch (error) {
    if (isDatabaseOfflineError(error)) {
      if (options?.allowFallback === false) {
        throw error;
      }

      console.error(
        `Falling back to demo data after database access failed${options?.context ? ` (${options.context})` : ""}.`,
        error
      );
      return await fallback();
    }

    throw error;
  }
}

function wait(delayMs: number) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function retryOnDatabaseFailure<T>(
  operation: () => Promise<T>,
  options?: {
    attempts?: number;
    delayMs?: number;
  }
) {
  const attempts = options?.attempts ?? 2;
  const delayMs = options?.delayMs ?? 150;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!isDatabaseOfflineError(error) || attempt === attempts) {
        throw error;
      }

      await wait(delayMs * attempt);
    }
  }

  throw lastError;
}
