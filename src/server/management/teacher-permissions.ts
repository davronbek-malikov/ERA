import { prisma } from "@/lib/prisma";
import { retryOnDatabaseFailure } from "@/lib/server-data";
import { authErrors } from "@/server/authz";
import { NO_PERMISSIONS, normalizePermissions, type ManagementActor, type TeacherPermissions } from "@/server/management/actor";
import { writeAudit } from "@/server/management/audit";

/** Teacher permissions, managed by administrators only (docs/ERA_STUDENT_MANAGEMENT.md, "Permissions"). */

export async function listTeacherPermissions() {
  const instructors = await retryOnDatabaseFailure(() =>
    prisma.instructor.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        user: { select: { id: true, name: true, email: true, role: true } },
        permissions: true,
        _count: { select: { assignedEnrollments: true } }
      }
    })
  );
  return instructors.map((instructor) => ({
    id: instructor.id,
    name: instructor.name,
    account: instructor.user,
    enrollments: instructor._count.assignedEnrollments,
    permissions: instructor.permissions
      ? normalizePermissions({
          viewPayments: instructor.permissions.canViewPayments,
          recordPayments: instructor.permissions.canRecordPayments,
          approvePayments: instructor.permissions.canApprovePayments,
          manageEnrollments: instructor.permissions.canManageEnrollments,
          manageAccess: instructor.permissions.canManageAccess
        })
      : { ...NO_PERMISSIONS }
  }));
}

export async function setTeacherPermissions(actor: ManagementActor, instructorId: string, input: TeacherPermissions) {
  if (actor.kind !== "admin") throw authErrors.forbidden("Only administrators can change teacher permissions.");
  const permissions = normalizePermissions(input);
  return prisma.$transaction(async (tx) => {
    const instructor = await tx.instructor.findUnique({ where: { id: instructorId }, select: { id: true, permissions: true } });
    if (!instructor) throw authErrors.notFound("Teacher not found.");
    const data = {
      canViewPayments: permissions.viewPayments,
      canRecordPayments: permissions.recordPayments,
      canApprovePayments: permissions.approvePayments,
      canManageEnrollments: permissions.manageEnrollments,
      canManageAccess: permissions.manageAccess,
      updatedById: actor.user.id
    };
    const saved = await tx.instructorPermission.upsert({ where: { instructorId }, create: { instructorId, ...data }, update: data });
    await writeAudit(tx, {
      actorId: actor.user.id,
      action: "permission.update",
      entityType: "permission",
      entityId: instructorId,
      before: instructor.permissions,
      after: saved,
      source: "MANUAL"
    });
    return permissions;
  });
}

/**
 * A brand-new teacher account can run their own class right away: add students and enroll them, record and
 * approve payments, and manage access, always only for THEIR OWN students (Enrollment.instructorId).
 * Administrators can narrow this at any time in Student management → Teacher permissions.
 * Only creates the row when the teacher has none, so it never overrides an administrator's choice.
 */
export const STARTER_TEACHER_PERMISSIONS: TeacherPermissions = {
  viewPayments: true,
  recordPayments: true,
  approvePayments: true,
  manageEnrollments: true,
  manageAccess: true
};

export async function grantStarterPermissions(instructorId: string, adminId: string | null) {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.instructorPermission.findUnique({ where: { instructorId } });
    if (existing) return;
    const saved = await tx.instructorPermission.create({
      data: {
        instructorId,
        canViewPayments: STARTER_TEACHER_PERMISSIONS.viewPayments,
        canRecordPayments: STARTER_TEACHER_PERMISSIONS.recordPayments,
        canApprovePayments: STARTER_TEACHER_PERMISSIONS.approvePayments,
        canManageEnrollments: STARTER_TEACHER_PERMISSIONS.manageEnrollments,
        canManageAccess: STARTER_TEACHER_PERMISSIONS.manageAccess,
        updatedById: adminId
      }
    });
    await writeAudit(tx, { actorId: adminId, action: "permission.starter", entityType: "permission", entityId: instructorId, after: saved, source: "MANUAL" });
  });
}
