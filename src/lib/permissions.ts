import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { retryOnDatabaseFailure } from "@/lib/server-data";

type CurrentUser = {
  id: string;
  email: string;
  role: string;
};

export function canAccessAdminStudio(role?: string | null) {
  return role === UserRole.ADMIN || role === UserRole.INSTRUCTOR;
}

export function isAdmin(role?: string | null) {
  return role === UserRole.ADMIN;
}

const instructorSelect = { id: true, name: true, userId: true, email: true } as const;

/**
 * The instructor profile of an INSTRUCTOR account. Deterministic and fail-closed:
 *  1. the profile explicitly linked to this user (`Instructor.userId`), otherwise
 *  2. a profile created by an admin for this email that is not linked to anyone yet — it is linked now.
 * A profile already linked to another user is never returned. Ownership checks live in src/server/authz.ts.
 */
export async function getInstructorRecordForUser(user: CurrentUser) {
  if (user.role !== UserRole.INSTRUCTOR) {
    return null;
  }

  const linked = await retryOnDatabaseFailure(() =>
    prisma.instructor.findUnique({ where: { userId: user.id }, select: instructorSelect })
  );
  if (linked) {
    return linked;
  }

  if (!user.email) {
    return null;
  }

  const unclaimed = await retryOnDatabaseFailure(() =>
    prisma.instructor.findFirst({
      where: { email: { equals: user.email, mode: "insensitive" }, userId: null },
      orderBy: { createdAt: "asc" },
      select: instructorSelect
    })
  );
  if (!unclaimed) {
    return null;
  }

  // Conditional claim: only succeeds while the profile is still unlinked (no race with another account).
  const claimed = await retryOnDatabaseFailure(() =>
    prisma.instructor.updateMany({ where: { id: unclaimed.id, userId: null }, data: { userId: user.id } })
  );
  return claimed.count === 1 ? { ...unclaimed, userId: user.id } : null;
}
