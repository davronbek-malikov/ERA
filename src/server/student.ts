import { ActivityType, Prisma, PublicationStatus, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { retryOnDatabaseFailure } from "@/lib/server-data";
import { mapLessonPracticeExercises } from "@/server/lessons";
import { resolveCourseAccess, type CourseAccess } from "@/server/authz";
import { resolvePlaybackUrl } from "@/server/storage";
import type { WorkspaceUser } from "@/server/workspace";

/*
 * Student Workspace data. Every query is keyed by the signed-in user's id. Course content is
 * only returned when the server has decided the user may see it (enrollment for students,
 * ownership for teachers, admin role for inspection).
 */

const published = PublicationStatus.PUBLISHED;

export async function getStudentDashboard(userId: string) {
  return retryOnDatabaseFailure(async () => {
    const [enrollments, completedCount, feedback, history] = await Promise.all([
      prisma.enrollment.findMany({
        where: { userId, course: { status: published } },
        orderBy: { updatedAt: "desc" },
        select: {
          progress: true,
          updatedAt: true,
          currentLesson: { select: { slug: true, title: true, status: true } },
          course: {
            select: {
              id: true,
              title: true,
              slug: true,
              thumbnailUrl: true,
              instructor: { select: { name: true } },
              lessons: { where: { status: published }, orderBy: { position: "asc" }, select: { slug: true, title: true } }
            }
          }
        }
      }),
      prisma.lessonCompletion.count({ where: { userId, lesson: { status: published, course: { status: published } } } }),
      prisma.practiceSubmission.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          status: true,
          passedCount: true,
          totalTests: true,
          createdAt: true,
          exercise: { select: { title: true, lesson: { select: { title: true, slug: true, course: { select: { slug: true } } } } } }
        }
      }),
      prisma.activityLog.findMany({
        where: { userId, type: { in: [ActivityType.STUDY_SESSION, ActivityType.LESSON_COMPLETED, ActivityType.PRACTICE_SUBMITTED] } },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { id: true, type: true, message: true, createdAt: true }
      })
    ]);

    const courses = enrollments.map((enrollment) => {
      const resume =
        enrollment.currentLesson && enrollment.currentLesson.status === published
          ? enrollment.currentLesson
          : enrollment.course.lessons[0] ?? null;
      return {
        id: enrollment.course.id,
        title: enrollment.course.title,
        slug: enrollment.course.slug,
        thumbnailUrl: enrollment.course.thumbnailUrl,
        instructorName: enrollment.course.instructor.name,
        lessonCount: enrollment.course.lessons.length,
        progress: enrollment.progress,
        lastStudiedAt: enrollment.updatedAt,
        resumeLesson: resume ? { slug: resume.slug, title: resume.title } : null
      };
    });

    return {
      courses,
      // Most recently studied course that still has a lesson to open.
      continueCourse: courses.find((course) => course.resumeLesson && course.progress < 100) ?? courses.find((course) => course.resumeLesson) ?? null,
      completedCount,
      totalLessons: courses.reduce((sum, course) => sum + course.lessonCount, 0),
      feedback,
      history
    };
  });
}

export type ClassroomAccess = CourseAccess;

export async function getStudentCourse(user: WorkspaceUser, courseSlug: string) {
  return retryOnDatabaseFailure(async () => {
    const course = await prisma.course.findUnique({
      where: { slug: courseSlug },
      select: {
        id: true,
        title: true,
        slug: true,
        subtitle: true,
        description: true,
        shortDescription: true,
        status: true,
        instructorId: true,
        outcomes: true,
        instructor: { select: { name: true, title: true } }
      }
    });
    if (!course) return { access: { status: "not-found" } as ClassroomAccess, course: null };

    const access = await resolveCourseAccess(user, course);
    if (access.status !== "ok") return { access, course: null };

    const lessonWhere: Prisma.LessonWhereInput = access.mode === "student" ? { status: published } : {};
    const [modules, lessons, completions, enrollment] = await Promise.all([
      prisma.courseModule.findMany({
        where: { courseId: course.id, ...(access.mode === "student" ? { status: published } : {}) },
        orderBy: { position: "asc" },
        select: { id: true, title: true, description: true }
      }),
      prisma.lesson.findMany({
        where: { courseId: course.id, ...lessonWhere },
        orderBy: { position: "asc" },
        select: { id: true, title: true, slug: true, duration: true, moduleId: true, description: true }
      }),
      prisma.lessonCompletion.findMany({ where: { userId: user.id, lesson: { courseId: course.id } }, select: { lessonId: true } }),
      prisma.enrollment.findUnique({
        where: { userId_courseId: { userId: user.id, courseId: course.id } },
        select: { progress: true, currentLesson: { select: { slug: true } } }
      })
    ]);

    const done = new Set(completions.map((completion) => completion.lessonId));
    return {
      access,
      course: {
        ...course,
        progress: enrollment?.progress ?? 0,
        resumeLessonSlug: enrollment?.currentLesson?.slug ?? lessons[0]?.slug ?? null,
        completedCount: lessons.filter((lesson) => done.has(lesson.id)).length,
        groups: groupLessons(modules, lessons.map((lesson) => ({ ...lesson, completed: done.has(lesson.id) })))
      }
    };
  });
}

type GroupableLesson = { moduleId: string | null };
function groupLessons<T extends GroupableLesson>(modules: Array<{ id: string; title: string; description?: string | null }>, lessons: T[]) {
  const groups = modules
    .map((module) => ({ id: module.id, title: module.title, lessons: lessons.filter((lesson) => lesson.moduleId === module.id) }))
    .filter((group) => group.lessons.length > 0);
  const loose = lessons.filter((lesson) => !lesson.moduleId || !modules.some((module) => module.id === lesson.moduleId));
  return loose.length > 0 ? [...groups, { id: "lessons", title: "", lessons: loose }] : groups;
}

export async function getClassroom(user: WorkspaceUser, courseSlug: string, lessonSlug: string) {
  return retryOnDatabaseFailure(async () => {
    const course = await prisma.course.findUnique({
      where: { slug: courseSlug },
      select: { id: true, title: true, slug: true, status: true, instructorId: true, instructor: { select: { name: true } } }
    });
    if (!course) return { access: { status: "not-found" } as ClassroomAccess, classroom: null };

    const access = await resolveCourseAccess(user, course);
    if (access.status !== "ok") return { access, classroom: null };

    const studentOnly = access.mode === "student";
    const [modules, lessons, completions] = await Promise.all([
      prisma.courseModule.findMany({
        where: { courseId: course.id, ...(studentOnly ? { status: published } : {}) },
        orderBy: { position: "asc" },
        select: { id: true, title: true }
      }),
      prisma.lesson.findMany({
        where: { courseId: course.id, ...(studentOnly ? { status: published } : {}) },
        orderBy: { position: "asc" },
        select: { id: true, title: true, slug: true, duration: true, moduleId: true }
      }),
      prisma.lessonCompletion.findMany({ where: { userId: user.id, lesson: { courseId: course.id } }, select: { lessonId: true } })
    ]);

    const index = lessons.findIndex((lesson) => lesson.slug === lessonSlug);
    if (index < 0) return { access: { status: "not-found" } as ClassroomAccess, classroom: null };

    // Lesson content. Quiz answers and practice solutions are never selected.
    const lesson = await prisma.lesson.findUniqueOrThrow({
      where: { id: lessons[index].id },
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        duration: true,
        videoUrl: true,
        position: true,
        content: { select: { overview: true, content: true, learningObjectives: true, keyPoints: true, practicePrompt: true, practiceChecklist: true } },
        materials: { orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { id: true, title: true, mimeType: true } },
        quizQuestions: { orderBy: { position: "asc" }, select: { id: true, prompt: true, options: true } },
        practiceExercises: {
          orderBy: { position: "asc" },
          select: {
            id: true,
            type: true,
            title: true,
            slug: true,
            instructions: true,
            language: true,
            starterCode: true,
            solutionCode: true,
            hints: true,
            testCases: true,
            submissions: {
              where: { userId: user.id },
              orderBy: { createdAt: "desc" },
              take: 9,
              select: { id: true, language: true, code: true, status: true, passedCount: true, totalTests: true, feedback: true }
            }
          }
        }
      }
    });

    const done = new Set(completions.map((completion) => completion.lessonId));
    const curriculum = lessons.map((item) => ({ ...item, completed: done.has(item.id) }));

    return {
      access,
      classroom: {
        mode: access.mode,
        course: { title: course.title, slug: course.slug, instructorName: course.instructor.name },
        lesson: {
          ...lesson,
          // Lesson videos in private storage get a short-lived signed URL; other URLs pass through.
          videoUrl: await resolvePlaybackUrl(lesson.videoUrl),
          // Materials are downloaded through /api/materials/[id]/download, which re-checks access.
          materials: lesson.materials.map((material) => ({
            id: material.id,
            title: material.title,
            mimeType: material.mimeType,
            href: `/api/materials/${material.id}/download`
          })),
          completed: done.has(lesson.id),
          // mapLessonPracticeExercises drops solutionCode before anything reaches the browser.
          practiceExercises: mapLessonPracticeExercises(lesson.practiceExercises)
        },
        groups: groupLessons(modules, curriculum),
        completedCount: curriculum.filter((item) => item.completed).length,
        totalCount: curriculum.length,
        previous: index > 0 ? { slug: lessons[index - 1].slug, title: lessons[index - 1].title } : null,
        next: index < lessons.length - 1 ? { slug: lessons[index + 1].slug, title: lessons[index + 1].title } : null
      }
    };
  });
}
