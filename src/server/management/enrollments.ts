import { Prisma, UserRole, type EnrollmentAccessStatus, type ManagementSource, type PaymentArrangement } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { RequestError } from "@/lib/validation";
import { authErrors } from "@/server/authz";
import { assertCan, can, courseScope, enrollmentScope, type ManagementActor } from "@/server/management/actor";
import { writeAudit } from "@/server/management/audit";
import type { AccessChangeInput, CreateEnrollmentInput, UpdateEnrollmentInput } from "@/server/management/inputs";
import { fromDbDate, toDbDate, todayInPlatform } from "@/server/management/time";

/*
 * Enrollments (docs/ERA_STUDENT_MANAGEMENT.md, "Enrollments" and "Access").
 *
 * Every operation has two halves:
 *   check…(db, actor, input)  — reads and validates everything, writes nothing. The AI uses it to build a
 *                               preview; the operation itself runs it again inside its transaction.
 *   create…/update…/change…   — the change, its access log and its audit row in ONE transaction.
 * A student starting a new course gets a NEW enrollment; earlier enrollments are never overwritten.
 */

type Db = Prisma.TransactionClient | typeof prisma;
export type ChangeOptions = { source: ManagementSource };

export const conflict = (code: string, message: string) => new RequestError(409, code, message);

const ENROLLMENT_SNAPSHOT_SELECT = {
  id: true,
  userId: true,
  courseId: true,
  instructorId: true,
  status: true,
  startDate: true,
  endDate: true,
  priceAmount: true,
  currency: true,
  paymentArrangement: true,
  paymentDueDate: true,
  accessStatus: true,
  accessExpiresAt: true,
  restrictWhenOverdue: true,
  accessNote: true,
  internalNote: true
} as const;

type EnrollmentSnapshot = Prisma.EnrollmentGetPayload<{ select: typeof ENROLLMENT_SNAPSHOT_SELECT }>;

function snapshot(row: EnrollmentSnapshot) {
  return {
    ...row,
    startDate: fromDbDate(row.startDate),
    endDate: fromDbDate(row.endDate),
    paymentDueDate: fromDbDate(row.paymentDueDate),
    accessExpiresAt: fromDbDate(row.accessExpiresAt)
  };
}

// ------------------------------------------------------------------------------------------------
// Create
// ------------------------------------------------------------------------------------------------

export async function checkCreateEnrollment(db: Db, actor: ManagementActor, input: CreateEnrollmentInput) {
  assertCan(actor, "manageEnrollments");
  if (input.paymentArrangement === "PAY_LATER") assertCan(actor, "manageAccess");
  if (input.paymentArrangement === "WAIVED") assertCan(actor, "approvePayments");
  if (input.priceAmount !== null || input.initialPayment) assertCan(actor, "viewPayments");
  if (input.initialPayment) assertCan(actor, "recordPayments");

  const student = await db.user.findFirst({
    where: { id: input.studentId, role: UserRole.STUDENT },
    select: { id: true, name: true, email: true, status: true }
  });
  if (!student) throw authErrors.notFound("Student not found.");
  if (student.status !== "ACTIVE") throw conflict("student-inactive", `${student.name}'s account isn't active.`);

  const course = await db.course.findFirst({
    where: { id: input.courseId, ...courseScope(actor) },
    select: { id: true, title: true, instructorId: true, status: true }
  });
  if (!course) throw authErrors.notFound("Course not found.");

  let instructorId = actor.kind === "teacher" ? actor.instructorId : (input.instructorId ?? course.instructorId);
  if (actor.kind === "teacher" && input.instructorId && input.instructorId !== actor.instructorId) {
    throw authErrors.forbidden("Teachers can only enroll students with themselves as the teacher.");
  }
  const instructor = await db.instructor.findUnique({ where: { id: instructorId }, select: { id: true, name: true } });
  if (!instructor) throw authErrors.notFound("Teacher not found.");
  instructorId = instructor.id;

  const existing = await db.enrollment.findUnique({
    where: { userId_courseId: { userId: student.id, courseId: course.id } },
    select: { id: true, status: true }
  });
  if (existing) {
    throw conflict(
      "already-enrolled",
      `${student.name} already has an enrollment in ${course.title} (${existing.status.toLowerCase()}). Update that enrollment instead.`
    );
  }

  const accessStatus: EnrollmentAccessStatus = input.paymentArrangement === "PAY_LATER" || input.grantAccess ? "ACTIVE" : "RESTRICTED";
  return { student, course, instructor, accessStatus };
}

export async function createEnrollment(actor: ManagementActor, input: CreateEnrollmentInput, options: ChangeOptions) {
  try {
    return await prisma.$transaction(async (tx) => {
      const checked = await checkCreateEnrollment(tx, actor, input);
      const enrollment = await tx.enrollment.create({
        data: {
          userId: checked.student.id,
          courseId: checked.course.id,
          instructorId: checked.instructor.id,
          status: "ACTIVE",
          startDate: toDbDate(input.startDate),
          endDate: input.endDate ? toDbDate(input.endDate) : null,
          priceAmount: input.priceAmount,
          currency: input.currency,
          paymentArrangement: input.paymentArrangement,
          paymentDueDate: input.paymentDueDate ? toDbDate(input.paymentDueDate) : null,
          accessStatus: checked.accessStatus,
          restrictWhenOverdue: input.restrictWhenOverdue,
          accessGrantedById: checked.accessStatus === "ACTIVE" ? actor.user.id : null,
          accessNote: input.accessNote,
          internalNote: input.internalNote,
          createdById: actor.user.id
        },
        select: ENROLLMENT_SNAPSHOT_SELECT
      });

      await tx.enrollmentAccessLog.create({
        data: {
          enrollmentId: enrollment.id,
          previousStatus: null,
          newStatus: checked.accessStatus,
          arrangement: input.paymentArrangement,
          reason: input.accessNote ?? (checked.accessStatus === "ACTIVE" ? "Enrollment created with access" : "Enrollment created; access waits for payment"),
          source: options.source,
          changedById: actor.user.id
        }
      });
      await writeAudit(tx, {
        actorId: actor.user.id,
        action: "enrollment.create",
        entityType: "enrollment",
        entityId: enrollment.id,
        after: snapshot(enrollment),
        source: options.source
      });

      let paymentId: string | null = null;
      if (input.initialPayment) {
        const payment = await tx.paymentTransaction.create({
          data: {
            enrollmentId: enrollment.id,
            kind: "PAYMENT",
            amount: input.initialPayment.amount,
            currency: input.currency,
            method: input.initialPayment.method,
            transactionDate: toDbDate(input.initialPayment.transactionDate),
            status: "PENDING",
            reference: input.initialPayment.reference,
            description: input.initialPayment.description ?? "Initial payment",
            source: options.source,
            recordedById: actor.user.id,
            idempotencyKey: input.idempotencyKey ? `${input.idempotencyKey}:initial` : null
          }
        });
        paymentId = payment.id;
        await writeAudit(tx, {
          actorId: actor.user.id,
          action: "payment.record",
          entityType: "payment",
          entityId: payment.id,
          after: { enrollmentId: enrollment.id, amount: payment.amount, currency: payment.currency, method: payment.method, status: payment.status },
          source: options.source
        });
      }

      await tx.activityLog.create({
        data: {
          type: "ENROLLMENT_CREATED",
          message: `${checked.student.name} enrolled in ${checked.course.title}`,
          userId: actor.user.id,
          context: { enrollmentId: enrollment.id, source: options.source }
        }
      });

      return { enrollmentId: enrollment.id, paymentId, studentName: checked.student.name, courseTitle: checked.course.title };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw conflict("already-enrolled", "This student already has an enrollment in this course.");
    }
    throw error;
  }
}

// ------------------------------------------------------------------------------------------------
// Update dates, price, status, teacher, note
// ------------------------------------------------------------------------------------------------

export async function checkUpdateEnrollment(db: Db, actor: ManagementActor, enrollmentId: string, input: UpdateEnrollmentInput) {
  const onlyDueDate = Object.entries(input).every(([key, value]) => key === "reason" || key === "paymentDueDate" || value === undefined);
  if (onlyDueDate) {
    if (!can(actor, "manageEnrollments") && !can(actor, "manageAccess")) assertCan(actor, "manageEnrollments");
  } else {
    assertCan(actor, "manageEnrollments");
  }
  if (input.priceAmount !== undefined) assertCan(actor, "approvePayments");
  if (input.instructorId !== undefined && actor.kind !== "admin") throw authErrors.forbidden("Only administrators can reassign a teacher.");

  const current = await db.enrollment.findFirst({
    where: { id: enrollmentId, ...enrollmentScope(actor) },
    select: { ...ENROLLMENT_SNAPSHOT_SELECT, user: { select: { name: true } }, course: { select: { title: true } } }
  });
  if (!current) throw authErrors.notFound("Enrollment not found.");

  if (input.instructorId !== undefined) {
    const instructor = await db.instructor.findUnique({ where: { id: input.instructorId }, select: { id: true } });
    if (!instructor) throw authErrors.notFound("Teacher not found.");
  }

  const startDate = input.startDate ?? fromDbDate(current.startDate);
  const endDate = input.endDate !== undefined ? input.endDate : fromDbDate(current.endDate);
  if (startDate && endDate && endDate < startDate) throw new RequestError(400, "invalid-endDate", "The end date can't be before the start date.");
  return { current, startDate, endDate };
}

export async function updateEnrollment(actor: ManagementActor, enrollmentId: string, input: UpdateEnrollmentInput, options: ChangeOptions) {
  return prisma.$transaction(async (tx) => {
    const { current } = await checkUpdateEnrollment(tx, actor, enrollmentId, input);
    const data: Prisma.EnrollmentUpdateInput = {};
    if (input.startDate !== undefined) data.startDate = toDbDate(input.startDate);
    if (input.endDate !== undefined) data.endDate = input.endDate ? toDbDate(input.endDate) : null;
    if (input.paymentDueDate !== undefined) data.paymentDueDate = input.paymentDueDate ? toDbDate(input.paymentDueDate) : null;
    if (input.priceAmount !== undefined) data.priceAmount = input.priceAmount;
    if (input.internalNote !== undefined) data.internalNote = input.internalNote;
    if (input.instructorId !== undefined) data.instructor = { connect: { id: input.instructorId } };
    if (input.status !== undefined && input.status !== current.status) {
      data.status = input.status;
      data.completedAt = input.status === "COMPLETED" ? new Date() : null;
    }

    const updated = await tx.enrollment.update({ where: { id: current.id }, data, select: ENROLLMENT_SNAPSHOT_SELECT });
    const { user: _user, course: _course, ...before } = current;
    await writeAudit(tx, {
      actorId: actor.user.id,
      action: input.status && input.status !== current.status ? `enrollment.status.${input.status.toLowerCase()}` : "enrollment.update",
      entityType: "enrollment",
      entityId: current.id,
      before: { ...snapshot(before), reason: input.reason },
      after: snapshot(updated),
      source: options.source
    });
    return { enrollmentId: current.id, studentName: current.user.name, courseTitle: current.course.title, after: snapshot(updated) };
  });
}

// ------------------------------------------------------------------------------------------------
// Access (Pay Later, restrict, revoke, restore, extend, overdue rule)
// ------------------------------------------------------------------------------------------------

export async function checkAccessChange(db: Db, actor: ManagementActor, enrollmentId: string, input: AccessChangeInput) {
  assertCan(actor, "manageAccess");
  const current = await db.enrollment.findFirst({
    where: { id: enrollmentId, ...enrollmentScope(actor) },
    select: { ...ENROLLMENT_SNAPSHOT_SELECT, user: { select: { name: true } }, course: { select: { title: true } } }
  });
  if (!current) throw authErrors.notFound("Enrollment not found.");

  const today = todayInPlatform();
  let accessStatus: EnrollmentAccessStatus = current.accessStatus;
  let arrangement: PaymentArrangement | null = current.paymentArrangement;
  let accessExpiresAt = fromDbDate(current.accessExpiresAt);
  let paymentDueDate = fromDbDate(current.paymentDueDate);
  let restrictWhenOverdue = current.restrictWhenOverdue;

  switch (input.action) {
    case "grant_pay_later":
      if (current.paymentArrangement === "WAIVED") throw conflict("fee-waived", "The fee for this enrollment is waived; Pay Later isn't needed.");
      if (current.status !== "ACTIVE") throw conflict("enrollment-not-active", "Pay Later can only be granted on an active enrollment.");
      accessStatus = "ACTIVE";
      arrangement = "PAY_LATER";
      paymentDueDate = input.paymentDueDate ?? paymentDueDate;
      if (input.restrictWhenOverdue !== undefined) restrictWhenOverdue = input.restrictWhenOverdue;
      break;
    case "restrict":
      if (current.accessStatus === "RESTRICTED") throw conflict("no-change", "Access is already restricted.");
      accessStatus = "RESTRICTED";
      break;
    case "revoke":
      if (current.accessStatus === "REVOKED") throw conflict("no-change", "Access is already revoked.");
      accessStatus = "REVOKED";
      break;
    case "restore":
      if (current.accessStatus === "ACTIVE") throw conflict("no-change", "Access is already active.");
      accessStatus = "ACTIVE";
      break;
    case "extend":
      if (!input.accessExpiresAt || input.accessExpiresAt < today) {
        throw new RequestError(400, "invalid-accessExpiresAt", "The new last day of access must be today or later.");
      }
      accessExpiresAt = input.accessExpiresAt;
      break;
    case "set_overdue_rule":
      restrictWhenOverdue = Boolean(input.restrictWhenOverdue);
      break;
  }
  return { current, next: { accessStatus, arrangement, accessExpiresAt, paymentDueDate, restrictWhenOverdue } };
}

export async function changeEnrollmentAccess(actor: ManagementActor, enrollmentId: string, input: AccessChangeInput, options: ChangeOptions) {
  return prisma.$transaction(async (tx) => {
    const { current, next } = await checkAccessChange(tx, actor, enrollmentId, input);
    const grants = input.action === "grant_pay_later" || input.action === "restore";
    const updated = await tx.enrollment.update({
      where: { id: current.id },
      data: {
        accessStatus: next.accessStatus,
        paymentArrangement: next.arrangement,
        accessExpiresAt: next.accessExpiresAt ? toDbDate(next.accessExpiresAt) : null,
        paymentDueDate: next.paymentDueDate ? toDbDate(next.paymentDueDate) : null,
        restrictWhenOverdue: next.restrictWhenOverdue,
        ...(grants ? { accessGrantedById: actor.user.id, accessNote: input.reason } : {})
      },
      select: ENROLLMENT_SNAPSHOT_SELECT
    });
    await tx.enrollmentAccessLog.create({
      data: {
        enrollmentId: current.id,
        previousStatus: current.accessStatus,
        newStatus: next.accessStatus,
        previousExpiresAt: current.accessExpiresAt,
        newExpiresAt: next.accessExpiresAt ? toDbDate(next.accessExpiresAt) : null,
        arrangement: next.arrangement,
        reason: `${input.action.replace(/_/g, " ")}: ${input.reason}`,
        source: options.source,
        changedById: actor.user.id
      }
    });
    const { user: _user, course: _course, ...before } = current;
    await writeAudit(tx, {
      actorId: actor.user.id,
      action: `enrollment.access.${input.action}`,
      entityType: "enrollment",
      entityId: current.id,
      before: snapshot(before),
      after: { ...snapshot(updated), reason: input.reason },
      source: options.source
    });
    return { enrollmentId: current.id, studentName: current.user.name, courseTitle: current.course.title, after: snapshot(updated) };
  });
}
