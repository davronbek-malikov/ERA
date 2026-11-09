import { Prisma, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { retryOnDatabaseFailure } from "@/lib/server-data";
import { authErrors, getInstructorIdForUser, requireAuthenticatedUser, type AuthUser } from "@/server/authz";

/*
 * Who may do what in Student Management & Payments (docs/ERA_STUDENT_MANAGEMENT.md, "Permissions").
 *
 * Every page, API route and AI tool of the module resolves a ManagementActor here and asks it. Rules:
 *  - Administrators: every student, every enrollment, every permission.
 *  - Teachers: only enrollments ASSIGNED to their instructor profile (Enrollment.instructorId), and only the
 *    operations an administrator granted (InstructorPermission). Notes and exams for their own students are
 *    always allowed. Without a linked instructor profile a teacher manages nothing (fail closed).
 *  - Students: never an actor. Their own read-only view lives in src/server/management/student-view.ts.
 * Identity always comes from the session, never from the request.
 */

export type TeacherPermissions = {
  viewPayments: boolean;
  recordPayments: boolean;
  approvePayments: boolean;
  manageEnrollments: boolean;
  manageAccess: boolean;
};

export type Permission = keyof TeacherPermissions | "notes" | "exams";

export const NO_PERMISSIONS: TeacherPermissions = {
  viewPayments: false,
  recordPayments: false,
  approvePayments: false,
  manageEnrollments: false,
  manageAccess: false
};

const ALL_PERMISSIONS: TeacherPermissions = {
  viewPayments: true,
  recordPayments: true,
  approvePayments: true,
  manageEnrollments: true,
  manageAccess: true
};

export const PERMISSION_LABEL: Record<keyof TeacherPermissions, string> = {
  viewPayments: "See prices, payments and balances",
  recordPayments: "Record payments (they stay pending until approved)",
  approvePayments: "Approve, reject and reverse payments",
  manageEnrollments: "Create enrollments and change course dates",
  manageAccess: "Grant Pay Later, restrict, restore or extend access"
};

export type ManagementActor =
  | { kind: "admin"; user: AuthUser; instructorId: string | null; permissions: TeacherPermissions }
  | { kind: "teacher"; user: AuthUser; instructorId: string; permissions: TeacherPermissions };

/** Recording or approving payments implies seeing them. */
export function normalizePermissions(input: TeacherPermissions): TeacherPermissions {
  const viewPayments = input.viewPayments || input.recordPayments || input.approvePayments;
  return { ...input, viewPayments };
}

export async function getTeacherPermissions(instructorId: string): Promise<TeacherPermissions> {
  const row = await retryOnDatabaseFailure(() => prisma.instructorPermission.findUnique({ where: { instructorId } }));
  if (!row) return { ...NO_PERMISSIONS };
  return normalizePermissions({
    viewPayments: row.canViewPayments,
    recordPayments: row.canRecordPayments,
    approvePayments: row.canApprovePayments,
    manageEnrollments: row.canManageEnrollments,
    manageAccess: row.canManageAccess
  });
}

/**
 * The actor for a signed-in user, or null when the user can't manage students.
 * `workspace: "teacher"` scopes an administrator to their own linked instructor profile (Teacher Workspace),
 * with full permissions over those students.
 */
export async function getManagementActor(user: AuthUser | null, workspace: "admin" | "teacher" = "admin"): Promise<ManagementActor | null> {
  if (!user || user.status !== "ACTIVE") return null;
  if (user.role === UserRole.ADMIN) {
    const instructorId = await getInstructorIdForUser(user);
    if (workspace === "teacher") {
      return instructorId ? { kind: "teacher", user, instructorId, permissions: { ...ALL_PERMISSIONS } } : null;
    }
    return { kind: "admin", user, instructorId, permissions: { ...ALL_PERMISSIONS } };
  }
  if (user.role === UserRole.INSTRUCTOR) {
    const instructorId = await getInstructorIdForUser(user);
    if (!instructorId) return null;
    return { kind: "teacher", user, instructorId, permissions: await getTeacherPermissions(instructorId) };
  }
  return null;
}

/** For API routes: the session's actor or a 401/403. */
export async function requireManagementActor(workspace: "admin" | "teacher" = "admin"): Promise<ManagementActor> {
  const user = await requireAuthenticatedUser();
  // Instructors are always teacher actors; the workspace only matters for administrators.
  const actor = await getManagementActor(user, workspace);
  if (!actor) {
    throw user.role === UserRole.INSTRUCTOR
      ? authErrors.forbidden("Your account is not linked to a teacher profile.")
      : authErrors.forbidden("Only administrators and teachers can manage students.");
  }
  return actor;
}

export function can(actor: ManagementActor, permission: Permission): boolean {
  if (permission === "notes" || permission === "exams") return true;
  return actor.permissions[permission];
}

const DENIED_MESSAGE: Record<Permission, string> = {
  viewPayments: "You don't have permission to see payment information.",
  recordPayments: "You don't have permission to record payments.",
  approvePayments: "You don't have permission to approve, reject or reverse payments.",
  manageEnrollments: "You don't have permission to create or change enrollments.",
  manageAccess: "You don't have permission to change course access.",
  notes: "You can't add notes here.",
  exams: "You can't manage exams here."
};

export function assertCan(actor: ManagementActor, permission: Permission) {
  if (!can(actor, permission)) throw authErrors.forbidden(DENIED_MESSAGE[permission]);
}

/** Enrollments this actor may see. */
export function enrollmentScope(actor: ManagementActor): Prisma.EnrollmentWhereInput {
  return actor.kind === "admin" ? {} : { instructorId: actor.instructorId };
}

/** Courses this actor may enroll students in, schedule exams for, etc. */
export function courseScope(actor: ManagementActor): Prisma.CourseWhereInput {
  return actor.kind === "admin" ? {} : { instructorId: actor.instructorId };
}

/** Exams this actor may see and change. */
export function examScope(actor: ManagementActor): Prisma.ExamScheduleWhereInput {
  return actor.kind === "admin" ? {} : { OR: [{ instructorId: actor.instructorId }, { course: { instructorId: actor.instructorId } }] };
}

/** An enrollment in scope, or 404 (someone else's enrollment looks exactly like a missing one). */
export async function requireEnrollmentInScope(actor: ManagementActor, enrollmentId: string) {
  const enrollment = await retryOnDatabaseFailure(() =>
    prisma.enrollment.findFirst({
      where: { id: enrollmentId, ...enrollmentScope(actor) },
      include: {
        user: { select: { id: true, name: true, email: true, role: true, status: true } },
        course: { select: { id: true, title: true, slug: true, instructorId: true } },
        instructor: { select: { id: true, name: true } }
      }
    })
  );
  if (!enrollment) throw authErrors.notFound("Enrollment not found.");
  return enrollment;
}

/** A student account the actor may view: admins any student; teachers only students assigned to them. */
export async function requireStudentInScope(actor: ManagementActor, studentId: string) {
  const student = await retryOnDatabaseFailure(() =>
    prisma.user.findFirst({
      where: {
        id: studentId,
        role: UserRole.STUDENT,
        ...(actor.kind === "teacher" ? { enrollments: { some: { instructorId: actor.instructorId } } } : {})
      },
      select: { id: true, name: true, email: true, phone: true, status: true, createdAt: true }
    })
  );
  if (!student) throw authErrors.notFound("Student not found.");
  return student;
}
