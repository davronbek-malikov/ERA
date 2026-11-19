import { PublicationStatus, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { retryOnDatabaseFailure } from "@/lib/server-data";
import type { ContextBlock } from "@/server/ai/types";
import { getLessonContextById } from "@/server/lessons";

/*
 * Context builders (docs/ERA_AI_ARCHITECTURE.md §6). Each builder receives IDs that the caller has ALREADY
 * authorized through src/server/authz.ts and returns reference blocks for the prompt. Builders never decide
 * access themselves and select only the fields an agent needs.
 */

const MAX_BLOCK_CHARS = 24_000;

function clip(text: string, max = MAX_BLOCK_CHARS) {
  return text.length > max ? `${text.slice(0, max)}\n[...truncated]` : text;
}

/**
 * Future RAG seam. A retriever returns passages from an already-authorized scope (course IDs the user may
 * read). Prompt 08 ships the interface only; the default retriever returns nothing.
 */
export type KnowledgeScope = { courseIds: string[]; lessonId?: string };
export interface KnowledgeRetriever {
  retrieve(query: string, scope: KnowledgeScope, limit: number): Promise<ContextBlock[]>;
}
export const noRetrieval: KnowledgeRetriever = { retrieve: async () => [] };

/** Student Tutor: the authorized lesson's notes (drafts only for teacher preview, which never uses the tutor). */
export async function buildLessonContext(lessonId: string): Promise<{ blocks: ContextBlock[]; courseId: string } | null> {
  const lesson = await getLessonContextById(lessonId);
  if (!lesson) return null;

  const parts = [
    `Course: ${lesson.courseTitle}`,
    `Lesson: ${lesson.lessonTitle}`,
    lesson.lessonDuration ? `Duration: ${lesson.lessonDuration}` : null,
    lesson.lessonDescription ? `Description: ${lesson.lessonDescription}` : null,
    lesson.overview ? `Overview: ${lesson.overview}` : null,
    lesson.learningObjectives.length ? `Learning objectives:\n- ${lesson.learningObjectives.join("\n- ")}` : null,
    lesson.keyPoints.length ? `Key points:\n- ${lesson.keyPoints.join("\n- ")}` : null,
    lesson.content ? `Lesson notes:\n${lesson.content}` : "Lesson notes: none provided for this lesson."
  ].filter(Boolean);

  return { blocks: [{ label: "current lesson", content: clip(parts.join("\n")) }], courseId: lesson.courseId };
}

/** Teacher Assistant: outline of one course the teacher owns (authorized by requireTeacherCourseOwnership). */
export async function buildTeacherCourseContext(courseId: string): Promise<ContextBlock[]> {
  const course = await retryOnDatabaseFailure(() =>
    prisma.course.findUnique({
      where: { id: courseId },
      select: {
        title: true,
        subtitle: true,
        status: true,
        difficulty: true,
        shortDescription: true,
        outcomes: true,
        lessons: {
          orderBy: { position: "asc" },
          select: { title: true, status: true, description: true, content: { select: { overview: true, keyPoints: true } } }
        }
      }
    })
  );
  if (!course) return [];

  const lessons = course.lessons
    .map((lesson, index) => {
      const keyPoints = lesson.content?.keyPoints.length ? ` Key points: ${lesson.content.keyPoints.join("; ")}` : "";
      const summary = lesson.content?.overview ?? lesson.description ?? "";
      return `${index + 1}. ${lesson.title} [${lesson.status.toLowerCase()}]${summary ? ` — ${summary}` : ""}${keyPoints}`;
    })
    .join("\n");

  return [
    {
      label: "selected course (owned by this teacher)",
      content: clip(
        [
          `Course: ${course.title}${course.subtitle ? ` — ${course.subtitle}` : ""}`,
          `Status: ${course.status.toLowerCase()}, level: ${course.difficulty.toLowerCase()}`,
          course.shortDescription ? `Description: ${course.shortDescription}` : null,
          course.outcomes.length ? `Outcomes:\n- ${course.outcomes.join("\n- ")}` : null,
          `Lessons:\n${lessons || "No lessons yet."}`
        ]
          .filter(Boolean)
          .join("\n")
      )
    }
  ];
}

/**
 * Admin Assistant: aggregate platform statistics only. No names, emails, messages or per-student records.
 * Course titles and teacher display names are included because they are public catalogue information.
 */
export async function buildAdminPlatformContext(): Promise<ContextBlock[]> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [roles, courses, enrollments, completedEnrollments, recentEnrollments, recentCompletions, aiRequests, courseRows] = await retryOnDatabaseFailure(() =>
    Promise.all([
      prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
      prisma.course.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.enrollment.count(),
      prisma.enrollment.count({ where: { progress: { gte: 100 } } }),
      prisma.enrollment.count({ where: { createdAt: { gte: since } } }),
      prisma.lessonCompletion.count({ where: { completedAt: { gte: since } } }),
      prisma.aiUsageEvent.groupBy({ by: ["agent", "status"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
      prisma.course.findMany({
        orderBy: { updatedAt: "desc" },
        take: 30,
        select: {
          title: true,
          status: true,
          instructor: { select: { name: true } },
          _count: { select: { lessons: true, enrollments: true } },
          enrollments: { select: { progress: true } }
        }
      })
    ])
  );

  const roleCount = (role: UserRole) => roles.find((row) => row.role === role)?._count._all ?? 0;
  const statusCount = (status: PublicationStatus) => courses.find((row) => row.status === status)?._count._all ?? 0;
  const courseLines = courseRows
    .map((course) => {
      const average = course.enrollments.length
        ? Math.round(course.enrollments.reduce((sum, row) => sum + row.progress, 0) / course.enrollments.length)
        : null;
      return `- ${course.title} (${course.status.toLowerCase()}, teacher: ${course.instructor.name}): ${course._count.lessons} lessons, ${course._count.enrollments} enrollments${average === null ? "" : `, average progress ${average}%`}`;
    })
    .join("\n");
  const aiLines = aiRequests.map((row) => `- ${row.agent.toLowerCase()} ${row.status.toLowerCase()}: ${row._count._all}`).join("\n");

  return [
    {
      label: "platform statistics (aggregate, generated now)",
      content: clip(
        [
          `Generated: ${new Date().toISOString().slice(0, 10)}`,
          `Accounts: ${roleCount(UserRole.STUDENT)} students, ${roleCount(UserRole.INSTRUCTOR)} teachers, ${roleCount(UserRole.ADMIN)} admins`,
          `Courses: ${statusCount(PublicationStatus.PUBLISHED)} published, ${statusCount(PublicationStatus.DRAFT)} draft, ${statusCount(PublicationStatus.ARCHIVED)} archived`,
          `Enrollments: ${enrollments} total, ${completedEnrollments} completed, ${recentEnrollments} new in the last 30 days`,
          `Lesson completions in the last 30 days: ${recentCompletions}`,
          `AI assistant requests in the last 30 days:\n${aiLines || "- none"}`,
          `Courses (most recently updated, up to 30):\n${courseLines || "- none"}`
        ].join("\n")
      )
    }
  ];
}
