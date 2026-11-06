import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getInstructorIdForUser } from "@/server/authz";

export type WorkspaceKind = "student" | "teacher" | "admin";
export type WorkspaceUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** Where each role lands. Used for redirects when someone opens another role's workspace. */
export function homeForRole(role: string) {
  if (role === UserRole.ADMIN) return "/admin";
  if (role === UserRole.INSTRUCTOR) return "/teacher";
  return "/learn";
}

/**
 * Server-side page guards for the three workspaces (docs/ERA_INFORMATION_ARCHITECTURE.md §2).
 * Every workspace page calls one of these. Navigation visibility is never the check.
 */
async function requireUser(nextPath: string) {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/sign-in?next=${encodeURIComponent(nextPath)}`);
  }
  return user;
}

export async function requireStudent(nextPath: string) {
  const user = await requireUser(nextPath);
  if (user.role !== UserRole.STUDENT) {
    redirect(homeForRole(user.role));
  }
  return user;
}

export async function requireAdmin(nextPath: string) {
  const user = await requireUser(nextPath);
  if (user.role !== UserRole.ADMIN) {
    redirect(homeForRole(user.role));
  }
  return user;
}

/** Instructors, and admins who also teach. Data is always scoped to the user's own instructor record. */
export async function requireTeacher(nextPath: string) {
  const user = await requireUser(nextPath);
  if (user.role !== UserRole.INSTRUCTOR && user.role !== UserRole.ADMIN) {
    redirect(homeForRole(user.role));
  }
  return user;
}

/**
 * The instructor record that scopes every Teacher Workspace query. Fails closed: without a linked
 * record the teacher owns nothing and sees nothing. Implemented once in src/server/authz.ts.
 */
export async function getTeacherInstructorId(user: WorkspaceUser): Promise<string | null> {
  return getInstructorIdForUser(user);
}

/** Any signed-in user. Pages using this must still decide access per record (see src/server/student.ts). */
export async function requireSignedIn(nextPath: string) {
  return requireUser(nextPath);
}
