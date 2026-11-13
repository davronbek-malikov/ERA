import { Prisma, UserRole, type KnowledgeScope, type KnowledgeVisibility } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { retryOnDatabaseFailure } from "@/lib/server-data";
import { invalid } from "@/lib/validation";
import { authErrors, getInstructorIdForUser, requireTeacherCourseOwnership, type AuthUser } from "@/server/authz";

/*
 * Knowledge Base management permissions (Prompt 09, docs/ERA_KNOWLEDGE_BASE.md §7). Built on src/server/authz.ts.
 *
 *              | upload / delete                                  | list (metadata only)
 *  Admin       | any scope, any document                         | every document (incl. teacher-private metadata)
 *  Teacher     | COURSE/LESSON of own courses; own TEACHER_PRIVATE | own courses + own private + PLATFORM (read-only)
 *  Student     | —                                                | —
 *
 * PLATFORM documents are admin-controlled. TEACHER_PRIVATE documents are always TEACHERS_ONLY.
 */

export type UploadTarget = {
  scope: KnowledgeScope;
  visibility: KnowledgeVisibility;
  courseId: string | null;
  lessonId: string | null;
};

export function assertCanManageKnowledge(user: AuthUser) {
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.INSTRUCTOR) {
    throw authErrors.forbidden("Only teachers and administrators can manage the Knowledge Base.");
  }
}

/** Validates where a new document may go for this user. The returned target is what gets stored. */
export async function resolveUploadTarget(
  user: AuthUser,
  input: { scope: KnowledgeScope; visibility: KnowledgeVisibility; courseId?: string; lessonId?: string }
): Promise<UploadTarget> {
  assertCanManageKnowledge(user);
  const isAdmin = user.role === UserRole.ADMIN;

  switch (input.scope) {
    case "PLATFORM":
      if (!isAdmin) throw authErrors.forbidden("Only administrators can add platform-wide knowledge.");
      if (input.courseId || input.lessonId) throw invalid("invalid-target", "Platform knowledge isn't linked to a course or lesson.");
      return { scope: "PLATFORM", visibility: input.visibility, courseId: null, lessonId: null };

    case "COURSE": {
      if (!input.courseId) throw invalid("invalid-target", "Choose a course.");
      if (input.lessonId) throw invalid("invalid-target", "Use lesson scope for a lesson document.");
      const { course } = await requireTeacherCourseOwnership(user, input.courseId);
      return { scope: "COURSE", visibility: input.visibility, courseId: course.id, lessonId: null };
    }

    case "LESSON": {
      if (!input.lessonId) throw invalid("invalid-target", "Choose a lesson.");
      const lesson = await retryOnDatabaseFailure(() =>
        prisma.lesson.findUnique({ where: { id: input.lessonId }, select: { id: true, courseId: true } })
      );
      if (!lesson) throw authErrors.notFound("Lesson not found.");
      if (input.courseId && input.courseId !== lesson.courseId) throw authErrors.notFound("Lesson not found.");
      await requireTeacherCourseOwnership(user, lesson.courseId);
      return { scope: "LESSON", visibility: input.visibility, courseId: lesson.courseId, lessonId: lesson.id };
    }

    case "TEACHER_PRIVATE": {
      const instructorId = await getInstructorIdForUser(user);
      if (!instructorId) throw authErrors.forbidden("Private knowledge needs a linked teacher profile.");
      if (input.courseId || input.lessonId) throw invalid("invalid-target", "Private knowledge isn't linked to a course or lesson.");
      return { scope: "TEACHER_PRIVATE", visibility: "TEACHERS_ONLY", courseId: null, lessonId: null };
    }
  }
}

/** Documents this user may see in the management screens (metadata only). */
export async function manageableDocumentsWhere(user: AuthUser): Promise<Prisma.KnowledgeDocumentWhereInput> {
  assertCanManageKnowledge(user);
  if (user.role === UserRole.ADMIN) return {};
  const instructorId = await getInstructorIdForUser(user);
  return {
    OR: [
      { scope: "PLATFORM" },
      { scope: "TEACHER_PRIVATE", uploadedById: user.id },
      ...(instructorId ? [{ scope: { in: ["COURSE", "LESSON"] as KnowledgeScope[] }, course: { instructorId } }] : [])
    ]
  };
}

/** A document this user may change (delete, re-process). Others' documents are "not found". */
export async function requireManageableDocument(user: AuthUser, documentId: string) {
  assertCanManageKnowledge(user);
  const document = await retryOnDatabaseFailure(() =>
    prisma.knowledgeDocument.findUnique({
      where: { id: documentId },
      select: { id: true, scope: true, courseId: true, uploadedById: true, storagePath: true, status: true, course: { select: { instructorId: true } } }
    })
  );
  if (!document) throw authErrors.notFound("Document not found.");
  if (user.role === UserRole.ADMIN) return document;

  if (document.scope === "TEACHER_PRIVATE" && document.uploadedById === user.id) return document;
  if (document.scope === "COURSE" || document.scope === "LESSON") {
    const instructorId = await getInstructorIdForUser(user);
    if (instructorId && document.course?.instructorId === instructorId) return document;
  }
  if (document.scope === "PLATFORM") throw authErrors.forbidden("Only administrators can change platform knowledge.");
  throw authErrors.notFound("Document not found.");
}
