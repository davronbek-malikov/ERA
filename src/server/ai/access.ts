import { prisma } from "@/lib/prisma";
import { retryOnDatabaseFailure } from "@/lib/server-data";
import { invalid } from "@/lib/validation";
import type { AgentKind } from "@/server/ai/types";
import {
  assertRole,
  authErrors,
  getInstructorIdForUser,
  requireAuthenticatedUser,
  type AuthUser
} from "@/server/authz";

/*
 * Who may use the Teacher and Admin agents (docs/ERA_AI_AGENT_PERMISSIONS.md). Built on src/server/authz.ts;
 * identity and role come from the session only.
 *  - teacher: INSTRUCTOR (or ADMIN) with a linked instructor profile; a selected course must be their own.
 *  - admin:   ADMIN only; no course scoping.
 */

export type WorkspaceAgent = Extract<AgentKind, "teacher" | "admin">;

export function parseWorkspaceAgent(value: unknown): WorkspaceAgent {
  if (value === "teacher" || value === "admin") return value;
  throw invalid("invalid-agent", "Unknown assistant.");
}

export async function requireWorkspaceAgentUser(agent: WorkspaceAgent): Promise<{ user: AuthUser; instructorId: string | null }> {
  const user = await requireAuthenticatedUser();
  if (agent === "admin") {
    assertRole(user, ["ADMIN"], "Only administrators can use the Platform Assistant.");
    return { user, instructorId: null };
  }
  assertRole(user, ["INSTRUCTOR", "ADMIN"], "Only teachers can use the Teaching Assistant.");
  const instructorId = await getInstructorIdForUser(user);
  if (!instructorId) throw authErrors.forbidden("Your account is not linked to a teacher profile.");
  return { user, instructorId };
}

/** A course the teacher owns (by instructor profile). Someone else's course and a missing one are both 404. */
export async function requireOwnCourseForTeacherAgent(instructorId: string, courseId: string) {
  const course = await retryOnDatabaseFailure(() =>
    prisma.course.findFirst({ where: { id: courseId, instructorId }, select: { id: true, title: true } })
  );
  if (!course) throw authErrors.notFound("Course not found.");
  return course;
}
