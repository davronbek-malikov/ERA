import { PracticeExerciseType, PublicationStatus, type ChatMessageRole } from "@prisma/client";

import { demoCourses, demoLessons } from "@/lib/demo-data";
import { prisma } from "@/lib/prisma";
import { isDatabaseOfflineError, retryOnDatabaseFailure } from "@/lib/server-data";

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
      correctOption: number;
      explanation: string | null;
      position: number;
    }>;
    practiceExercises: Array<{
      id: string;
      type: PracticeExerciseType;
      title: string;
      slug: string;
      instructions: string;
      language: string;
      starterCode: string;
      solutionCode: string;
      hints: string[];
      solutionNotes: string | null;
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

function createDemoLessonContent(title: string, description: string | null) {
  return {
    overview: description ?? `${title} introduces the main idea for this lesson.`,
    content: [
      `Lesson: ${title}`,
      "",
      description ?? "This lesson uses a short general explanation because full lesson context is unavailable.",
      "",
      "Step-by-step:",
      "1. Understand the idea.",
      "2. Review an example.",
      "3. Practice the concept in a small way."
    ].join("\n"),
    practicePrompt: `Practice ${title.toLowerCase()} with one short written example.`,
    practiceChecklist: [
      "Explain the main idea.",
      "Write one simple example.",
      "Review your answer with the key points."
    ],
    learningObjectives: [
      `Understand ${title.toLowerCase()}.`,
      "Follow a simple explanation.",
      "Apply the idea with a short example."
    ],
    keyPoints: [
      description ?? "General lesson summary.",
      "Break big concepts into small steps.",
      "Use examples to reinforce understanding."
    ]
  };
}

function mapLessonPracticeExercises(
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
    solutionNotes: string | null;
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
    language: exercise.language,
    starterCode: exercise.starterCode,
    solutionCode: exercise.solutionCode,
    hints: exercise.hints,
    solutionNotes: exercise.solutionNotes,
    submissions: exercise.submissions ?? []
  }));
}

export async function getLessonBySlugs(
  courseSlug: string,
  lessonSlug: string,
  currentUserId?: string | null
): Promise<LessonPageData | null> {
  try {
    const course = await prisma.course.findFirst({
      where: {
        slug: courseSlug,
        status: PublicationStatus.PUBLISHED
      },
      include: {
        instructor: true,
        category: {
          include: {
            subject: true
          }
        },
        lessons: {
          where: {
            status: PublicationStatus.PUBLISHED
          },
          orderBy: [{ position: "asc" }],
          include: {
            module: {
              select: {
                id: true,
                title: true,
                description: true
              }
            },
            materials: {
              orderBy: [{ position: "asc" }, { createdAt: "asc" }]
            },
            content: true,
            subskills: {
              orderBy: [{ position: "asc" }]
            },
            quizQuestions: {
              orderBy: [{ position: "asc" }]
            },
            practiceExercises: {
              orderBy: [{ position: "asc" }],
              include: {
                submissions: currentUserId
                  ? {
                      where: { userId: currentUserId },
                      orderBy: [{ createdAt: "desc" }],
                      take: 9
                    }
                  : false
              }
            }
          }
        }
      }
    });

    if (!course) {
      return null;
    }

    const lessonIndex = course.lessons.findIndex((lesson) => lesson.slug === lessonSlug);
    const lesson = lessonIndex >= 0 ? course.lessons[lessonIndex] : null;

    if (!lesson) {
      return null;
    }

    return {
      course: {
        ...course,
        lessons: course.lessons.map((item) => ({
          id: item.id,
          slug: item.slug,
          title: item.title,
          position: item.position,
          moduleId: item.moduleId,
          module: item.module ? { id: item.module.id, title: item.module.title } : null
        }))
      },
      lesson: {
        ...lesson,
        practiceExercises: mapLessonPracticeExercises(lesson.practiceExercises)
      },
      previousLesson: lessonIndex > 0 ? course.lessons[lessonIndex - 1] : null,
      nextLesson: lessonIndex < course.lessons.length - 1 ? course.lessons[lessonIndex + 1] : null
    } satisfies LessonPageData;
  } catch (error) {
    if (!isDatabaseOfflineError(error)) {
      throw error;
    }

    const course = demoCourses.find(
      (item) => item.slug === courseSlug && item.status === PublicationStatus.PUBLISHED
    );

    if (!course) {
      return null;
    }

    const lessons = demoLessons
      .filter((item) => item.courseId === course.id && item.status === PublicationStatus.PUBLISHED)
      .sort((a, b) => a.position - b.position)
      .map((lesson) => ({
        ...lesson,
        moduleId: null,
        module: null,
        materials: [],
        subskills: [
          {
            id: `${lesson.id}-subskill-1`,
            title: `${lesson.title} core idea`,
            description: "Understand the central concept clearly.",
            position: 1
          }
        ],
        quizQuestions: [
          {
            id: `${lesson.id}-quiz-1`,
            prompt: `What should you understand first in ${lesson.title}?`,
            options: ["The main lesson idea", "Only the title", "Only the final answer"],
            correctOption: 0,
            explanation: "ERA lessons start from clear understanding first.",
            position: 1
          }
        ],
        practiceExercises: [
          {
            id: `${lesson.id}-exercise-1`,
            type: PracticeExerciseType.CODING,
            title: `Practice ${lesson.title}`,
            slug: `practice-${lesson.slug}`,
            instructions:
              "Write a function named solve that returns the input text with ` reviewed` added at the end.",
            language: "javascript",
            starterCode: [
              "function solve(text) {",
              "  // Return the updated string.",
              "}",
              "",
              "module.exports = solve;"
            ].join("\n"),
            solutionCode: [
              "function solve(text) {",
              "  return `${text} reviewed`;",
              "}",
              "",
              "module.exports = solve;"
            ].join("\n"),
            hints: [
              "Use a function named solve.",
              "Return the new string instead of logging it."
            ],
            solutionNotes: "Append the text ` reviewed` to the provided input string.",
            submissions: []
          }
        ],
        content: createDemoLessonContent(lesson.title, lesson.description)
      }));

    const lessonIndex = lessons.findIndex((item) => item.slug === lessonSlug);
    const lesson = lessonIndex >= 0 ? lessons[lessonIndex] : null;

    if (!lesson) {
      return null;
    }

    return {
      course: {
        ...course,
        instructor: { name: "ERA Instructor" },
        category: {
          name: "Course",
          subject: {
            name: "ERA"
          }
        },
        lessons: lessons.map((item) => ({
          id: item.id,
          slug: item.slug,
          title: item.title,
          position: item.position,
          moduleId: item.moduleId,
          module: item.module
        }))
      },
      lesson: {
        ...lesson,
        practiceExercises: mapLessonPracticeExercises(lesson.practiceExercises)
      },
      previousLesson: lessonIndex > 0 ? lessons[lessonIndex - 1] : null,
      nextLesson: lessonIndex < lessons.length - 1 ? lessons[lessonIndex + 1] : null
    } satisfies LessonPageData;
  }
}

export async function getLessonContextById(lessonId: string): Promise<LessonContextRecord | null> {
  return retryOnDatabaseFailure(async () => {
    const lesson = await prisma.lesson.findFirst({
      where: {
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

export async function getLessonChatHistory(userId: string, lessonId: string, limit = 40) {
  const messages = await retryOnDatabaseFailure(() =>
    prisma.chatMessage.findMany({
      where: {
        userId,
        lessonId
      },
      orderBy: [{ createdAt: "desc" }],
      take: limit
    })
  );

  return messages.reverse().map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt.toISOString()
  }));
}

export async function getRecentLessonChatMessages(
  userId: string,
  lessonId: string,
  limit = 6
): Promise<Array<{ role: ChatMessageRole; content: string }>> {
  const messages = await retryOnDatabaseFailure(() =>
    prisma.chatMessage.findMany({
      where: {
        userId,
        lessonId
      },
      orderBy: [{ createdAt: "desc" }],
      take: limit,
      select: {
        role: true,
        content: true
      }
    })
  );

  return messages.reverse();
}
