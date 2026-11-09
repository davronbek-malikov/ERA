import {
  CourseDifficulty,
  LearningGoal,
  OnboardingStage,
  PublicationStatus,
  TimeAvailability
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  getAssessmentQuestions,
  getGoalOption,
  getRecommendedLevelFromScore,
  getTimeAvailabilityOption
} from "@/lib/onboarding/content";
import { retryOnDatabaseFailure } from "@/lib/server-data";

type OnboardingAnswers = Record<string, string>;

export async function ensureOnboardingRecord(userId: string) {
  return retryOnDatabaseFailure(() =>
    prisma.userOnboarding.upsert({
      where: { userId },
      update: {},
      create: {
        userId
      }
    })
  );
}

export async function getOnboardingByUserId(userId: string) {
  return retryOnDatabaseFailure(() =>
    prisma.userOnboarding.findUnique({
      where: { userId },
      include: {
        recommendedCourse: {
          select: {
            id: true,
            slug: true,
            title: true
          }
        }
      }
    })
  );
}

export async function getOnboardingGateStatus(userId: string) {
  const onboarding = await getOnboardingByUserId(userId);
  return Boolean(onboarding && onboarding.stage !== OnboardingStage.COMPLETED);
}

export async function saveOnboardingDraft(input: {
  userId: string;
  goal: LearningGoal;
  level: CourseDifficulty;
  timeAvailability: TimeAvailability;
}) {
  return retryOnDatabaseFailure(() =>
    prisma.userOnboarding.upsert({
      where: { userId: input.userId },
      update: {
        goal: input.goal,
        level: input.level,
        timeAvailability: input.timeAvailability,
        stage: OnboardingStage.ASSESSMENT,
        checklistProfileCompleted: true
      },
      create: {
        userId: input.userId,
        goal: input.goal,
        level: input.level,
        timeAvailability: input.timeAvailability,
        stage: OnboardingStage.ASSESSMENT,
        checklistProfileCompleted: true
      }
    })
  );
}

function calculateAssessmentScore(goal: LearningGoal, answers: OnboardingAnswers) {
  const questions = getAssessmentQuestions(goal);

  return questions.reduce((score, question) => {
    const selected = answers[question.id];
    const option = question.options.find((item) => item.id === selected);
    return score + (option?.correct ? 1 : 0);
  }, 0);
}

function resolveRecommendedLevel(selectedLevel: CourseDifficulty, score: number) {
  const assessedLevel = getRecommendedLevelFromScore(score);

  if (selectedLevel === CourseDifficulty.BEGINNER) {
    return CourseDifficulty.BEGINNER;
  }

  if (selectedLevel === CourseDifficulty.INTERMEDIATE) {
    return assessedLevel === CourseDifficulty.ADVANCED
      ? CourseDifficulty.INTERMEDIATE
      : assessedLevel;
  }

  if (assessedLevel === CourseDifficulty.BEGINNER) {
    return CourseDifficulty.INTERMEDIATE;
  }

  return assessedLevel;
}

async function findRecommendedCourse(goal: LearningGoal, level: CourseDifficulty) {
  const subjectSlug = getGoalOption(goal).subjectSlug;
  const courses = await retryOnDatabaseFailure(() =>
    prisma.course.findMany({
      where: {
        status: PublicationStatus.PUBLISHED,
        difficulty: level,
        category: {
          subject: {
            slug: subjectSlug
          }
        },
        lessons: {
          some: {
            status: PublicationStatus.PUBLISHED
          }
        }
      },
      include: {
        lessons: {
          where: { status: PublicationStatus.PUBLISHED },
          orderBy: { position: "asc" },
          select: {
            id: true,
            slug: true
          }
        }
      },
      orderBy: [{ homepagePriority: "desc" }, { isFeatured: "desc" }, { viewCount: "desc" }, { position: "asc" }]
    })
  );

  if (courses.length > 0) {
    return courses[0];
  }

  const fallback = await retryOnDatabaseFailure(() =>
    prisma.course.findFirst({
      where: {
        status: PublicationStatus.PUBLISHED,
        category: {
          subject: {
            slug: subjectSlug
          }
        },
        lessons: {
          some: {
            status: PublicationStatus.PUBLISHED
          }
        }
      },
      include: {
        lessons: {
          where: { status: PublicationStatus.PUBLISHED },
          orderBy: { position: "asc" },
          select: {
            id: true,
            slug: true
          }
        }
      },
      orderBy: [{ homepagePriority: "desc" }, { isFeatured: "desc" }, { viewCount: "desc" }, { position: "asc" }]
    })
  );

  return fallback;
}

function buildPersonalizedPlan(input: {
  goal: LearningGoal;
  level: CourseDifficulty;
  timeAvailability: TimeAvailability;
  courseTitle: string | null;
}) {
  const goalLabel = getGoalOption(input.goal).label;
  const timeOption = getTimeAvailabilityOption(input.timeAvailability);
  const courseLine = input.courseTitle
    ? `Start with ${input.courseTitle} as your first guided course.`
    : `Start with the recommended ${goalLabel} course in your dashboard.`;

  return [
    `${courseLine}`,
    `Study at a ${input.level.toLowerCase()} pace with about ${timeOption.weeklyMinutes} minutes per week.`,
    "Finish your first lesson, then use practice or tutor support to lock in the habit."
  ];
}

export async function completeOnboarding(input: {
  userId: string;
  goal: LearningGoal;
  level: CourseDifficulty;
  timeAvailability: TimeAvailability;
  answers: OnboardingAnswers;
}) {
  const score = calculateAssessmentScore(input.goal, input.answers);
  const recommendedLevel = resolveRecommendedLevel(input.level, score);
  const recommendedCourse = await findRecommendedCourse(input.goal, recommendedLevel);
  const personalizedPlan = buildPersonalizedPlan({
    goal: input.goal,
    level: recommendedLevel,
    timeAvailability: input.timeAvailability,
    courseTitle: recommendedCourse?.title ?? null
  });

  await retryOnDatabaseFailure(() =>
    prisma.$transaction(async (tx) => {
      await tx.userOnboarding.upsert({
        where: { userId: input.userId },
        update: {
          goal: input.goal,
          level: input.level,
          recommendedLevel,
          timeAvailability: input.timeAvailability,
          stage: OnboardingStage.COMPLETED,
          assessmentScore: score,
          assessmentAnswers: input.answers,
          recommendedSubjectSlug: getGoalOption(input.goal).subjectSlug,
          recommendedCourseId: recommendedCourse?.id ?? null,
          personalizedPlan,
          checklistProfileCompleted: true,
          completedAt: new Date()
        },
        create: {
          userId: input.userId,
          goal: input.goal,
          level: input.level,
          recommendedLevel,
          timeAvailability: input.timeAvailability,
          stage: OnboardingStage.COMPLETED,
          assessmentScore: score,
          assessmentAnswers: input.answers,
          recommendedSubjectSlug: getGoalOption(input.goal).subjectSlug,
          recommendedCourseId: recommendedCourse?.id ?? null,
          personalizedPlan,
          checklistProfileCompleted: true,
          completedAt: new Date()
        }
      });

      if (recommendedCourse) {
        await tx.enrollment.upsert({
          where: {
            userId_courseId: {
              userId: input.userId,
              courseId: recommendedCourse.id
            }
          },
          update: {},
          create: {
            userId: input.userId,
            courseId: recommendedCourse.id,
            instructorId: recommendedCourse.instructorId
          }
        });
      }
    })
  );

  return {
    assessmentScore: score,
    recommendedLevel,
    recommendedCourse: recommendedCourse
      ? {
          id: recommendedCourse.id,
          slug: recommendedCourse.slug,
          title: recommendedCourse.title,
          firstLessonSlug: recommendedCourse.lessons[0]?.slug ?? null
        }
      : null,
    personalizedPlan
  };
}

export async function getOnboardingDashboardSummary(userId: string) {
  const onboarding = await getOnboardingByUserId(userId);

  if (!onboarding || onboarding.stage !== OnboardingStage.COMPLETED) {
    return null;
  }

  const [lessonCompletionCount, practiceCount] = await Promise.all([
    retryOnDatabaseFailure(() =>
      prisma.lessonCompletion.count({
        where: { userId }
      })
    ),
    retryOnDatabaseFailure(() =>
      prisma.chatMessage.count({
        where: { userId }
      })
    )
  ]);

  return {
    goal: onboarding.goal,
    level: onboarding.level,
    recommendedLevel: onboarding.recommendedLevel,
    timeAvailability: onboarding.timeAvailability,
    assessmentScore: onboarding.assessmentScore,
    personalizedPlan: onboarding.personalizedPlan,
    recommendedCourse: onboarding.recommendedCourse,
    checklist: [
      {
        id: "profile",
        label: "Complete profile",
        completed: onboarding.checklistProfileCompleted
      },
      {
        id: "lesson",
        label: "Take first lesson",
        completed: onboarding.checklistFirstLessonCompleted || lessonCompletionCount > 0
      },
      {
        id: "practice",
        label: "Do first practice",
        completed: onboarding.checklistFirstPracticeCompleted || practiceCount > 0
      }
    ]
  };
}
