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
