import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { authErrors } from "@/server/authz";
import { assertCan, courseScope, enrollmentScope, examScope, type ManagementActor } from "@/server/management/actor";
import { writeAudit } from "@/server/management/audit";
import type { ChangeOptions } from "@/server/management/enrollments";
import type { ExamInput, NoteInput } from "@/server/management/inputs";
import { fromDbDate, toDbDate } from "@/server/management/time";

/*
 * Exams and student notes (docs/ERA_STUDENT_MANAGEMENT.md, "Exams & schedule", "Notes").
 * Teachers may always schedule exams for their own courses and write notes about their own students;
 * administrators may do both for everyone. An exam without listed students applies to every active
 * enrollment of its course (within the viewer's scope).
 */

type Db = Prisma.TransactionClient | typeof prisma;

const EXAM_SELECT = {
  id: true,
  courseId: true,
  instructorId: true,
  title: true,
  description: true,
  examDate: true,
  startTime: true,
  endTime: true,
  status: true,
  participants: { select: { enrollmentId: true } }
} as const;

type ExamRow = Prisma.ExamScheduleGetPayload<{ select: typeof EXAM_SELECT }>;

function examSnapshot(row: ExamRow) {
  return { ...row, examDate: fromDbDate(row.examDate), participants: row.participants.map((participant) => participant.enrollmentId) };
}

export async function checkExam(db: Db, actor: ManagementActor, input: ExamInput, existingId?: string) {
  assertCan(actor, "exams");
  const course = await db.course.findFirst({ where: { id: input.courseId, ...courseScope(actor) }, select: { id: true, title: true, instructorId: true } });
  if (!course) throw authErrors.notFound("Course not found.");

  let instructorId = actor.kind === "teacher" ? actor.instructorId : (input.instructorId ?? course.instructorId);
  if (actor.kind === "teacher" && input.instructorId && input.instructorId !== actor.instructorId) {
    throw authErrors.forbidden("Teachers schedule exams as themselves.");
  }
  const instructor = await db.instructor.findUnique({ where: { id: instructorId }, select: { id: true, name: true } });
  if (!instructor) throw authErrors.notFound("Teacher not found.");
  instructorId = instructor.id;

  if (input.enrollmentIds.length) {
    const enrollments = await db.enrollment.findMany({
      where: { id: { in: input.enrollmentIds }, courseId: course.id, ...enrollmentScope(actor) },
      select: { id: true }
    });
    if (enrollments.length !== input.enrollmentIds.length) throw authErrors.notFound("Some students aren't enrolled in this course with you.");
  }

  let existing: ExamRow | null = null;
  if (existingId) {
    existing = await db.examSchedule.findFirst({ where: { id: existingId, ...examScope(actor) }, select: EXAM_SELECT });
    if (!existing) throw authErrors.notFound("Exam not found.");
  }
  return { course, instructor, existing };
}

export async function saveExam(actor: ManagementActor, input: ExamInput, options: ChangeOptions & { examId?: string }) {
  return prisma.$transaction(async (tx) => {
    const { course, instructor, existing } = await checkExam(tx, actor, input, options.examId);
    const data = {
      courseId: course.id,
      instructorId: instructor.id,
      title: input.title,
      description: input.description,
      examDate: toDbDate(input.examDate),
      startTime: input.startTime,
      endTime: input.endTime,
      status: input.status
    };
    let exam: ExamRow;
    if (existing) {
      await tx.examParticipant.deleteMany({ where: { examId: existing.id } });
      exam = await tx.examSchedule.update({
        where: { id: existing.id },
        data: { ...data, participants: { create: input.enrollmentIds.map((enrollmentId) => ({ enrollmentId })) } },
        select: EXAM_SELECT
      });
    } else {
      exam = await tx.examSchedule.create({
        data: { ...data, createdById: actor.user.id, participants: { create: input.enrollmentIds.map((enrollmentId) => ({ enrollmentId })) } },
        select: EXAM_SELECT
      });
    }
    await writeAudit(tx, {
      actorId: actor.user.id,
      action: existing ? "exam.update" : "exam.create",
      entityType: "exam",
      entityId: exam.id,
      before: existing ? examSnapshot(existing) : undefined,
      after: examSnapshot(exam),
      source: options.source
    });
    return { examId: exam.id, courseTitle: course.title, exam: examSnapshot(exam) };
  });
}

export async function deleteExam(actor: ManagementActor, examId: string, options: ChangeOptions) {
  assertCan(actor, "exams");
  return prisma.$transaction(async (tx) => {
    const existing = await tx.examSchedule.findFirst({ where: { id: examId, ...examScope(actor) }, select: EXAM_SELECT });
    if (!existing) throw authErrors.notFound("Exam not found.");
    await tx.examSchedule.delete({ where: { id: existing.id } });
    await writeAudit(tx, {
      actorId: actor.user.id,
      action: "exam.delete",
      entityType: "exam",
      entityId: existing.id,
      before: examSnapshot(existing),
      source: options.source
    });
    return { examId: existing.id };
  });
}

// ------------------------------------------------------------------------------------------------
// Notes
// ------------------------------------------------------------------------------------------------

export async function addStudentNote(actor: ManagementActor, input: NoteInput, options: ChangeOptions) {
  assertCan(actor, "notes");
  return prisma.$transaction(async (tx) => {
    const student = await tx.user.findFirst({
      where: { id: input.studentId, role: "STUDENT", ...(actor.kind === "teacher" ? { enrollments: { some: { instructorId: actor.instructorId } } } : {}) },
      select: { id: true }
    });
    if (!student) throw authErrors.notFound("Student not found.");
    if (input.enrollmentId) {
      const enrollment = await tx.enrollment.findFirst({ where: { id: input.enrollmentId, userId: student.id, ...enrollmentScope(actor) }, select: { id: true } });
      if (!enrollment) throw authErrors.notFound("Enrollment not found.");
    }
    const note = await tx.studentNote.create({
      data: { studentId: student.id, enrollmentId: input.enrollmentId, note: input.note, createdById: actor.user.id },
      select: { id: true, note: true, enrollmentId: true, createdAt: true }
    });
    await writeAudit(tx, { actorId: actor.user.id, action: "note.create", entityType: "note", entityId: note.id, after: note, source: options.source });
    return note;
  });
}
