import { CourseDifficulty, PublicationStatus, UserRole } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth";
import {
  demoCategories,
  demoCourses,
  demoEnrollments,
  demoInstructors,
  demoLessons,
  demoSubjects
} from "@/lib/demo-data";
import { parseDurationToMinutes } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { isDatabaseOfflineError, retryOnDatabaseFailure, withDatabaseFallback } from "@/lib/server-data";

type LearningPathCourseStep = {
  id: string;
  position: number;
  stageLabel: string | null;
  progressPercent: number;
  isCompleted: boolean;
  isCurrent: boolean;
  isNext: boolean;
  actionHref: string;
  actionLabel: string;
  course: {
    id: string;
    slug: string;
    title: string;
    subtitle: string | null;
    shortDescription: string | null;
    thumbnailUrl: string | null;
    difficulty: CourseDifficulty;
    durationMinutes: number;
    instructor: {
      name: string;
    };
    category: {
      name: string;
      subject: {
        name: string;
      };
    };
    _count: {
      lessons: number;
      enrollments: number;
    };
  };
};

export type LearningPathCard = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  subjectSlug: string | null;
  difficulty: CourseDifficulty | null;
  progressPercent: number;
  completedCourseCount: number;
  totalCourses: number;
  nextStepHref: string;
  nextStepLabel: string;
  nextStepTitle: string | null;
  summary: string;
  steps: LearningPathCourseStep[];
};

type EnrollmentLookup = Map<
  string,
  {
    progress: number;
    currentLessonSlug: string | null;
  }
>;

type PathShape = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  subjectSlug: string | null;
  difficulty: CourseDifficulty | null;
  courses: Array<{
    id: string;
    position: number;
    stageLabel: string | null;
    course: {
      id: string;
      slug: string;
      title: string;
      subtitle: string | null;
      shortDescription: string | null;
      thumbnailUrl: string | null;
      difficulty: CourseDifficulty;
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
        duration: string | null;
      }>;
      _count: {
        lessons: number;
        enrollments: number;
      };
    };
  }>;
};

const demoLearningPaths = [
  {
    id: "path-ai-momentum",
    slug: "ai-momentum-path",
    title: "AI Momentum Path",
    description:
      "A structured AI roadmap that takes learners from foundations into stronger applied thinking and workflow habits.",
    subjectSlug: "ai",
    difficulty: CourseDifficulty.INTERMEDIATE,
    steps: [
      { courseId: "course-deep-learning", position: 1, stageLabel: "Begin" },
      { courseId: "course-ai-productivity", position: 2, stageLabel: "Practice" },
      { courseId: "course-prompt-engineering", position: 3, stageLabel: "Apply" }
    ]
  },
  {
    id: "path-academic-confidence",
    slug: "academic-confidence-path",
    title: "Academic Confidence Path",
    description:
      "A cross-skill path for stronger writing, cleaner reasoning, and more reliable exam execution.",
    subjectSlug: null,
    difficulty: CourseDifficulty.INTERMEDIATE,
    steps: [
      { courseId: "course-writing", position: 1, stageLabel: "Write" },
      { courseId: "course-problem-solving", position: 2, stageLabel: "Reason" },
      { courseId: "course-exam-strategy", position: 3, stageLabel: "Perform" }
    ]
  }
] as const;

function buildEnrollmentLookup(
  entries: Array<{
    courseId: string;
    progress: number;
    currentLesson?: {
      slug: string;
    } | null;
  }>
): EnrollmentLookup {
  return new Map(
    entries.map((entry) => [
      entry.courseId,
      {
        progress: entry.progress,
        currentLessonSlug: entry.currentLesson?.slug ?? null
      }
    ])
  );
}

function buildStepAction(
  courseSlug: string,
  progress: number,
  currentLessonSlug: string | null,
  isSignedInStudent: boolean
) {
  if (!isSignedInStudent) {
    return {
      href: `/sign-in?next=/learning-paths`,
      label: "Sign in to start"
    };
  }

  if (currentLessonSlug) {
    return {
      href: `/courses/${courseSlug}/lessons/${currentLessonSlug}`,
      label: progress > 0 ? "Continue lesson" : "Start lesson"
    };
  }

  return {
    href: `/courses/${courseSlug}`,
    label: progress > 0 ? "Continue course" : "Start course"
  };
}

function getCurrentAndNextCourseIds(
  steps: Array<{
    courseId: string;
    progressPercent: number;
  }>
) {
  const current = steps.find((step) => step.progressPercent > 0 && step.progressPercent < 100);
  if (current) {
    return {
      currentCourseId: current.courseId,
      nextCourseId: current.courseId
    };
  }

  const next = steps.find((step) => step.progressPercent < 100);

  return {
    currentCourseId: next?.courseId ?? steps[steps.length - 1]?.courseId ?? null,
    nextCourseId: next?.courseId ?? steps[steps.length - 1]?.courseId ?? null
  };
}

function buildLearningPathCards(args: {
  paths: PathShape[];
  enrollmentLookup: EnrollmentLookup;
  isSignedInStudent: boolean;
}) {
  return args.paths.map((path) => {
    const rawSteps = path.courses
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((step) => {
        const enrollment = args.enrollmentLookup.get(step.course.id);
        const progressPercent = Math.max(0, Math.min(enrollment?.progress ?? 0, 100));

        return {
          courseId: step.course.id,
          progressPercent,
          currentLessonSlug: enrollment?.currentLessonSlug ?? null,
          step
        };
      });

    const completedCourseCount = rawSteps.filter((step) => step.progressPercent >= 100).length;
    const progressPercent =
      rawSteps.length > 0
        ? Math.round(
            rawSteps.reduce((sum, step) => sum + step.progressPercent, 0) / rawSteps.length
          )
        : 0;
    const { currentCourseId, nextCourseId } = getCurrentAndNextCourseIds(rawSteps);

    const steps = rawSteps.map((item) => {
      const action = buildStepAction(
        item.step.course.slug,
        item.progressPercent,
        item.currentLessonSlug,
        args.isSignedInStudent
      );

      return {
        id: item.step.id,
        position: item.step.position,
        stageLabel: item.step.stageLabel,
        progressPercent: item.progressPercent,
        isCompleted: item.progressPercent >= 100,
        isCurrent: item.step.course.id === currentCourseId,
        isNext: item.step.course.id === nextCourseId,
        actionHref: action.href,
        actionLabel: action.label,
        course: {
          id: item.step.course.id,
          slug: item.step.course.slug,
          title: item.step.course.title,
          subtitle: item.step.course.subtitle,
          shortDescription: item.step.course.shortDescription,
          thumbnailUrl: item.step.course.thumbnailUrl,
          difficulty: item.step.course.difficulty,
          durationMinutes: item.step.course.lessons.reduce(
            (sum, lesson) => sum + parseDurationToMinutes(lesson.duration),
            0
          ),
          instructor: item.step.course.instructor,
          category: item.step.course.category,
          _count: item.step.course._count
        }
      } satisfies LearningPathCourseStep;
    });

    const nextStep = steps.find((step) => step.course.id === nextCourseId) ?? steps[0];

    return {
      id: path.id,
      slug: path.slug,
      title: path.title,
      description: path.description,
      subjectSlug: path.subjectSlug,
      difficulty: path.difficulty,
      progressPercent,
      completedCourseCount,
      totalCourses: steps.length,
      nextStepHref: nextStep?.actionHref ?? "/courses",
      nextStepLabel: nextStep?.actionLabel ?? "Open path",
      nextStepTitle: nextStep?.course.title ?? null,
      summary: args.isSignedInStudent
        ? `${completedCourseCount} of ${steps.length} courses completed.`
        : `${steps.length} ordered courses with one clear next step.`,
      steps
    } satisfies LearningPathCard;
  });
}

export async function syncLearningPathProgressForUser(userId: string, paths?: LearningPathCard[]) {
  const learningPaths = paths ?? (await getLearningPathsData()).paths;
  const userPaths = learningPaths.filter((path) => path.totalCourses > 0);

  await Promise.all(
    userPaths.map((path) =>
      retryOnDatabaseFailure(() =>
        prisma.userPathProgress.upsert({
          where: {
            userId_pathId: {
              userId,
              pathId: path.id
            }
          },
          update: {
            progressPercent: path.progressPercent,
            completedCourseCount: path.completedCourseCount,
            currentCourseId: path.steps.find((step) => step.isCurrent)?.course.id ?? null,
            nextCourseId: path.steps.find((step) => step.isNext)?.course.id ?? null,
            lastSyncedAt: new Date()
          },
          create: {
            userId,
            pathId: path.id,
            progressPercent: path.progressPercent,
            completedCourseCount: path.completedCourseCount,
            currentCourseId: path.steps.find((step) => step.isCurrent)?.course.id ?? null,
            nextCourseId: path.steps.find((step) => step.isNext)?.course.id ?? null,
            lastSyncedAt: new Date()
          }
        })
      )
    )
  );
}

export async function getLearningPathsData() {
  const currentUser = await getCurrentUser();

  return withDatabaseFallback(
    async () => {
      const paths = await retryOnDatabaseFailure(() =>
        prisma.learningPath.findMany({
          where: {
            status: PublicationStatus.PUBLISHED
          },
          orderBy: [{ position: "asc" }, { title: "asc" }],
          include: {
            courses: {
              orderBy: [{ position: "asc" }],
              include: {
                course: {
                  select: {
                    id: true,
                    slug: true,
                    title: true,
                    subtitle: true,
                    shortDescription: true,
                    thumbnailUrl: true,
                    difficulty: true,
                    instructor: {
                      select: {
                        name: true
                      }
                    },
                    category: {
                      select: {
                        name: true,
                        subject: {
                          select: {
                            name: true
                          }
                        }
                      }
                    },
                    lessons: {
                      where: { status: PublicationStatus.PUBLISHED },
                      select: {
                        duration: true
                      }
                    },
                    _count: {
                      select: {
                        lessons: true,
                        enrollments: true
                      }
                    }
                  }
                }
              }
            }
          }
        })
      );

      const courseIds = Array.from(new Set(paths.flatMap((path) => path.courses.map((step) => step.courseId))));
      const enrollments =
        currentUser?.role === UserRole.STUDENT && courseIds.length > 0
          ? await retryOnDatabaseFailure(() =>
              prisma.enrollment.findMany({
                where: {
                  userId: currentUser.id,
                  courseId: {
                    in: courseIds
                  }
                },
                include: {
                  currentLesson: {
                    select: {
                      slug: true
                    }
                  }
                }
              })
            )
          : [];

      const builtPaths = buildLearningPathCards({
        paths,
        enrollmentLookup: buildEnrollmentLookup(enrollments),
        isSignedInStudent: currentUser?.role === UserRole.STUDENT
      });

      if (currentUser?.role === UserRole.STUDENT && builtPaths.length > 0) {
        await syncLearningPathProgressForUser(currentUser.id, builtPaths);
      }

      return {
        currentUser,
        paths: builtPaths,
        databaseUnavailable: false
      };
    },
    async () => {
      const paths: PathShape[] = demoLearningPaths.map((path) => ({
        id: path.id,
        slug: path.slug,
        title: path.title,
        description: path.description,
        subjectSlug: path.subjectSlug,
        difficulty: path.difficulty,
        courses: path.steps.map((step) => {
          const course = demoCourses.find((entry) => entry.id === step.courseId);
          if (!course) {
            throw new Error(`Missing demo course for learning path step: ${step.courseId}`);
          }

          const instructor = demoInstructors.find((entry) => entry.id === course.instructorId);
          const category = demoCategories.find((entry) => entry.id === course.categoryId);
          const subject = demoSubjects.find((entry) => entry.id === category?.subjectId);

          if (!instructor || !category || !subject) {
            throw new Error(`Incomplete demo learning path metadata for course: ${course.id}`);
          }

          return {
            id: `${path.id}-${course.id}`,
            position: step.position,
            stageLabel: step.stageLabel,
            course: {
              id: course.id,
              slug: course.slug,
              title: course.title,
              subtitle: course.subtitle,
              shortDescription: course.shortDescription,
              thumbnailUrl: course.thumbnailUrl,
              difficulty: course.difficulty,
              instructor: {
                name: instructor.name
              },
              category: {
                name: category.name,
                subject: {
                  name: subject.name
                }
              },
              lessons: demoLessons
                .filter(
                  (lesson) =>
                    lesson.courseId === course.id && lesson.status === PublicationStatus.PUBLISHED
                )
                .map((lesson) => ({
                  duration: lesson.duration
                })),
              _count: {
                lessons: demoLessons.filter((lesson) => lesson.courseId === course.id).length,
                enrollments: demoEnrollments.filter((entry) => entry.courseId === course.id).length
              }
            }
          };
        })
      }));

      return {
        currentUser: null,
        paths: buildLearningPathCards({
          paths,
          enrollmentLookup: buildEnrollmentLookup([]),
          isSignedInStudent: false
        }),
        databaseUnavailable: true
      };
    },
    { context: "learning-paths" }
  );
}
