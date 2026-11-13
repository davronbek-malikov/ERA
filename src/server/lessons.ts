import { PracticeExerciseType, PublicationStatus, type ChatMessageRole } from "@prisma/client";

import { PRACTICE_LANGUAGES, type PracticeLanguage } from "@/lib/practice-languages";
import { prisma } from "@/lib/prisma";
import { retryOnDatabaseFailure } from "@/lib/server-data";
import type { PracticeTestCase } from "@/server/practice";
import { getPracticeLanguageVariant } from "@/server/practice-variants";

export type LessonContextRecord = {
  lessonId: string;
  lessonTitle: string;
  lessonSlug: string;
  lessonDescription: string | null;
  lessonDuration: string | null;
  lessonVideoUrl: string | null;
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  content: string | null;
  overview: string | null;
  learningObjectives: string[];
  keyPoints: string[];
};

export type LessonPageData = {
  course: {
    slug: string;
    title: string;
    instructor: {
      name: string;
    };
    category: {
      name: string;
      subject: {
        name: string;
      };
    };
    lessons: Array<{
      id: string;
      slug: string;
      title: string;
      position: number;
      moduleId: string | null;
      module: {
        id: string;
        title: string;
      } | null;
    }>;
  };
  lesson: {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    duration: string | null;
    position: number;
    videoUrl: string | null;
    moduleId: string | null;
    module: {
      id: string;
      title: string;
      description: string | null;
    } | null;
    materials: Array<{
      id: string;
      title: string;
      fileUrl: string;
    }>;
    subskills: Array<{
      id: string;
      title: string;
      description: string | null;
      position: number;
    }>;
    quizQuestions: Array<{
      id: string;
      prompt: string;
      options: string[];
      position: number;
    }>;
    practiceExercises: Array<{
      id: string;
      type: PracticeExerciseType;
      title: string;
      slug: string;
      instructions: string;
      starterCodeByLanguage: Record<PracticeLanguage, string>;
      testCases: PracticeTestCase[];
      hints: string[];
      submissions: Array<{
        id: string;
        language: string;
        code: string;
        status: "PASSED" | "FAILED";
        passedCount: number;
        totalTests: number;
        feedback: unknown;
      }>;
    }>;
    content: {
      overview: string | null;
      content: string;
      practicePrompt: string | null;
      practiceChecklist: string[];
      learningObjectives: string[];
      keyPoints: string[];
    } | null;
  };
  previousLesson: {
    slug: string;
    title: string;
  } | null;
  nextLesson: {
    slug: string;
    title: string;
  } | null;
};

export function mapLessonPracticeExercises(
  exercises: Array<{
    id: string;
    type: PracticeExerciseType;
    title: string;
    slug: string;
    instructions: string;
    language: string;
    starterCode: string;
    solutionCode: string;
    hints: string[];
    testCases: unknown;
    submissions?: Array<{
      id: string;
      language: string;
      code: string;
      status: "PASSED" | "FAILED";
      passedCount: number;
      totalTests: number;
      feedback: unknown;
    }>;
  }>
) {
  return exercises.map((exercise) => ({
    id: exercise.id,
    type: exercise.type,
    title: exercise.title,
    slug: exercise.slug,
    instructions: exercise.instructions,
    starterCodeByLanguage: Object.fromEntries(
      PRACTICE_LANGUAGES.map(({ value }) => [value, getPracticeLanguageVariant(exercise, value).starterCode])
    ) as Record<PracticeLanguage, string>,
    testCases: exercise.testCases as PracticeTestCase[],
    hints: exercise.hints,
    submissions: exercise.submissions ?? []
  }));
}

/**
 * Lesson context for the tutor and the context API. Callers must authorize first (src/server/authz.ts).
 * Published-only by default; `includeDrafts` is for Teacher Preview / Admin Inspection after authorization.
 */
export async function getLessonContextById(
  lessonId: string,
  options: { includeDrafts?: boolean } = {}
): Promise<LessonContextRecord | null> {
  return retryOnDatabaseFailure(async () => {
    const lesson = await prisma.lesson.findFirst({
      where: options.includeDrafts
        ? { id: lessonId }
        : {
            id: lessonId,
            status: PublicationStatus.PUBLISHED,
            course: {
              status: PublicationStatus.PUBLISHED
            }
          },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            slug: true
          }
        },
        content: true
      }
    });

    if (!lesson) {
      return null;
    }

    return {
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      lessonSlug: lesson.slug,
      lessonDescription: lesson.description,
      lessonDuration: lesson.duration,
      lessonVideoUrl: lesson.videoUrl,
      courseId: lesson.course.id,
      courseTitle: lesson.course.title,
      courseSlug: lesson.course.slug,
      content: lesson.content?.content ?? null,
      overview: lesson.content?.overview ?? lesson.description ?? null,
      learningObjectives: lesson.content?.learningObjectives ?? [],
      keyPoints: lesson.content?.keyPoints ?? []
    };
  });
}
