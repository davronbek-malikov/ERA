import { Prisma, PublicationStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { retryOnDatabaseFailure } from "@/lib/server-data";

/*
 * Teacher Workspace data. Every query is scoped to one instructor id
 * (src/server/workspace.ts → getTeacherInstructorId) and selects only what the screens show.
 * Students appear only through enrollments in the teacher's own courses, by name only:
 * no email, no phone, no AI conversations (docs/ERA_INFORMATION_ARCHITECTURE.md §2.4–2.5).
 */

const ownCourse = (instructorId: string) => ({ instructorId }) satisfies Prisma.CourseWhereInput;

export type TeacherActivity = {
  id: string;
  studentName: string;
  kind: "lesson-completed" | "practice-passed" | "practice-failed";
  title: string;
  courseTitle: string;
  at: Date;
};

export async function getTeacherDashboard(instructorId: string) {
  return retryOnDatabaseFailure(async () => {
    const [courses, studentCount, exerciseCount, completions, submissions, recentLessons] = await Promise.all([
      prisma.course.findMany({
        where: ownCourse(instructorId),
        orderBy: [{ updatedAt: "desc" }],
        select: {
          id: true,
          title: true,
          slug: true,
          status: true,
          updatedAt: true,
          _count: { select: { enrollments: true, lessons: true } }
        }
      }),
      prisma.user.count({ where: { enrollments: { some: { course: ownCourse(instructorId) } } } }),
      prisma.practiceExercise.count({ where: { lesson: { course: ownCourse(instructorId) } } }),
      prisma.lessonCompletion.findMany({
        where: { lesson: { course: ownCourse(instructorId) } },
        orderBy: { completedAt: "desc" },
        take: 8,
        select: {
          id: true,
          completedAt: true,
          user: { select: { name: true } },
          lesson: { select: { title: true, course: { select: { title: true } } } }
        }
      }),
      prisma.practiceSubmission.findMany({
        where: { exercise: { lesson: { course: ownCourse(instructorId) } } },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          createdAt: true,
          status: true,
          user: { select: { name: true } },
          exercise: { select: { title: true, lesson: { select: { course: { select: { title: true } } } } } }
        }
      }),
      prisma.lesson.findMany({
        where: { course: ownCourse(instructorId) },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          title: true,
          slug: true,
          status: true,
          createdAt: true,
          course: { select: { title: true, slug: true } }
        }
      })
    ]);

    const activity: TeacherActivity[] = [
      ...completions.map((item) => ({
        id: `c-${item.id}`,
        studentName: item.user.name,
        kind: "lesson-completed" as const,
        title: item.lesson.title,
        courseTitle: item.lesson.course.title,
        at: item.completedAt
      })),
      ...submissions.map((item) => ({
        id: `s-${item.id}`,
        studentName: item.user.name,
        kind: item.status === "PASSED" ? ("practice-passed" as const) : ("practice-failed" as const),
        title: item.exercise.title,
        courseTitle: item.exercise.lesson.course.title,
        at: item.createdAt
      }))
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 8);

    return {
      courses,
      activeCourseCount: courses.filter((course) => course.status === PublicationStatus.PUBLISHED).length,
      studentCount,
      exerciseCount,
      activity,
      recentLessons
    };
  });
}

export type TeacherCourseFilters = {
  q?: string;
  status?: string;
  sort?: string;
};

export async function getTeacherCourses(instructorId: string, filters: TeacherCourseFilters) {
  const status = Object.values(PublicationStatus).find((value) => value === filters.status);
  const orderBy: Prisma.CourseOrderByWithRelationInput =
    filters.sort === "title"
      ? { title: "asc" }
      : filters.sort === "students"
        ? { enrollments: { _count: "desc" } }
        : { updatedAt: "desc" };

  return retryOnDatabaseFailure(() =>
    prisma.course.findMany({
      where: {
        ...ownCourse(instructorId),
        ...(status ? { status } : {}),
        ...(filters.q?.trim() ? { title: { contains: filters.q.trim(), mode: "insensitive" as const } } : {})
      },
      orderBy,
      select: {
        id: true,
        title: true,
        slug: true,
        shortDescription: true,
        thumbnailUrl: true,
        status: true,
        updatedAt: true,
        _count: { select: { enrollments: true, lessons: true } }
      }
    })
  );
}

export async function getTeacherLessonBoard(instructorId: string, courseId?: string) {
  return retryOnDatabaseFailure(async () => {
    const courses = await prisma.course.findMany({
      where: ownCourse(instructorId),
      orderBy: [{ title: "asc" }],
      select: { id: true, title: true, slug: true, status: true }
    });

    const selected = courses.find((course) => course.id === courseId) ?? courses[0] ?? null;

    if (!selected) {
      return { courses, selected: null, modules: [], unassigned: [] };
    }

    const lessonSelect = {
      id: true,
      title: true,
      slug: true,
      status: true,
      position: true,
      duration: true,
      videoUrl: true,
      moduleId: true,
      updatedAt: true,
      content: { select: { id: true } },
      _count: { select: { quizQuestions: true, practiceExercises: true, materials: true } }
    } satisfies Prisma.LessonSelect;

    // The course id comes from the teacher's own list above, so lessons can't leak across owners.
    const [modules, lessons] = await Promise.all([
      prisma.courseModule.findMany({
        where: { courseId: selected.id },
        orderBy: { position: "asc" },
        select: { id: true, title: true, description: true, position: true, status: true }
      }),
      prisma.lesson.findMany({
        where: { courseId: selected.id },
        orderBy: { position: "asc" },
        select: lessonSelect
      })
    ]);

    return {
      courses,
      selected,
      modules: modules.map((module) => ({ ...module, lessons: lessons.filter((lesson) => lesson.moduleId === module.id) })),
      unassigned: lessons.filter((lesson) => !lesson.moduleId)
    };
  });
}

export async function getTeacherAssignments(instructorId: string) {
  return retryOnDatabaseFailure(async () => {
    const exercises = await prisma.practiceExercise.findMany({
      where: { lesson: { course: ownCourse(instructorId) } },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        title: true,
        type: true,
        lesson: { select: { title: true, slug: true, course: { select: { title: true, slug: true } } } },
        submissions: { select: { userId: true, status: true, createdAt: true } }
      }
    });

    return exercises.map((exercise) => {
      const students = new Set(exercise.submissions.map((submission) => submission.userId));
      const passedStudents = new Set(
        exercise.submissions.filter((submission) => submission.status === "PASSED").map((submission) => submission.userId)
      );
      const latest = exercise.submissions.reduce<Date | null>(
        (max, submission) => (!max || submission.createdAt > max ? submission.createdAt : max),
        null
      );

      return {
        id: exercise.id,
        title: exercise.title,
        type: exercise.type,
        lessonTitle: exercise.lesson.title,
        lessonSlug: exercise.lesson.slug,
        courseTitle: exercise.lesson.course.title,
        courseSlug: exercise.lesson.course.slug,
        submissionCount: exercise.submissions.length,
        studentCount: students.size,
        passedStudentCount: passedStudents.size,
        latestSubmissionAt: latest
      };
    });
  });
}

export type TeacherStudentRow = {
  id: string;
  name: string;
  courses: Array<{ title: string; slug: string; progress: number }>;
  averageProgress: number;
  exercisesPassed: number;
  exercisesAttempted: number;
  lastActivityAt: Date | null;
};

export async function getTeacherStudents(
  instructorId: string,
  filters: { q?: string; courseId?: string }
): Promise<{ rows: TeacherStudentRow[]; courses: Array<{ id: string; title: string }> }> {
  return retryOnDatabaseFailure(async () => {
    const courses = await prisma.course.findMany({
      where: ownCourse(instructorId),
      orderBy: { title: "asc" },
      select: { id: true, title: true }
    });
    const courseIds = courses.map((course) => course.id);
    const scopedCourseIds = filters.courseId && courseIds.includes(filters.courseId) ? [filters.courseId] : courseIds;

    if (scopedCourseIds.length === 0) {
      return { rows: [], courses };
    }

    const enrollments = await prisma.enrollment.findMany({
      where: {
        courseId: { in: scopedCourseIds },
        ...(filters.q?.trim() ? { user: { name: { contains: filters.q.trim(), mode: "insensitive" as const } } } : {})
      },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        progress: true,
        updatedAt: true,
        user: { select: { id: true, name: true } },
        course: { select: { title: true, slug: true } }
      }
    });

    const studentIds = [...new Set(enrollments.map((enrollment) => enrollment.user.id))];
    const [submissions, completions] = await Promise.all([
      prisma.practiceSubmission.findMany({
        where: { userId: { in: studentIds }, exercise: { lesson: { courseId: { in: scopedCourseIds } } } },
        select: { userId: true, exerciseId: true, status: true, createdAt: true }
      }),
      prisma.lessonCompletion.groupBy({
        by: ["userId"],
        where: { userId: { in: studentIds }, lesson: { courseId: { in: scopedCourseIds } } },
        _max: { completedAt: true }
      })
    ]);

    const rows = new Map<string, TeacherStudentRow>();
    for (const enrollment of enrollments) {
      const row = rows.get(enrollment.user.id) ?? {
        id: enrollment.user.id,
        name: enrollment.user.name,
        courses: [],
        averageProgress: 0,
        exercisesPassed: 0,
        exercisesAttempted: 0,
        lastActivityAt: null
      };
      row.courses.push({ title: enrollment.course.title, slug: enrollment.course.slug, progress: enrollment.progress });
      row.lastActivityAt = !row.lastActivityAt || enrollment.updatedAt > row.lastActivityAt ? enrollment.updatedAt : row.lastActivityAt;
      rows.set(enrollment.user.id, row);
    }

    for (const row of rows.values()) {
      row.averageProgress = Math.round(row.courses.reduce((sum, course) => sum + course.progress, 0) / row.courses.length);
      const own = submissions.filter((submission) => submission.userId === row.id);
      row.exercisesAttempted = new Set(own.map((submission) => submission.exerciseId)).size;
      row.exercisesPassed = new Set(own.filter((submission) => submission.status === "PASSED").map((submission) => submission.exerciseId)).size;
      const latestSubmission = own.reduce<Date | null>((max, submission) => (!max || submission.createdAt > max ? submission.createdAt : max), null);
      const latestCompletion = completions.find((completion) => completion.userId === row.id)?._max.completedAt ?? null;
      for (const candidate of [latestSubmission, latestCompletion]) {
        if (candidate && (!row.lastActivityAt || candidate > row.lastActivityAt)) {
          row.lastActivityAt = candidate;
        }
      }
    }

    return {
      rows: [...rows.values()].sort((a, b) => (b.lastActivityAt?.getTime() ?? 0) - (a.lastActivityAt?.getTime() ?? 0)),
      courses
    };
  });
}
