import { CourseDifficulty, PublicationStatus, Prisma } from "@prisma/client";

import { parseDurationToMinutes } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDatabaseOfflineError, retryOnDatabaseFailure } from "@/lib/server-data";
import { getStudentAnalyticsSummary } from "@/server/analytics";
import { getGamificationSummary } from "@/server/gamification";
import { getOnboardingDashboardSummary, getOnboardingGateStatus } from "@/server/onboarding";

export type CourseFilters = {
  subject?: string;
  category?: string;
  difficulty?: CourseDifficulty;
  search?: string;
  sort?: "popularity" | "rating";
};

export type HomepageCourseCollectionKey =
  | "continueLearning"
  | "recommendedForYou"
  | "trendingCourses"
  | "newCourses";

export type HomepageCourseCard = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  personalizedReason?: string | null;
  progressPercent?: number | null;
  actionLabel?: string | null;
  actionHref?: string | null;
  shortDescription: string | null;
  thumbnailUrl: string | null;
  difficulty: CourseDifficulty;
  isFeatured: boolean;
  isPopular: boolean;
  viewCount: number;
  publishedAt: Date;
  durationMinutes: number;
  badges: string[];
  instructor: {
    name: string;
  };
  category: {
    name: string;
    subject: {
      name: string;
      slug?: string;
    };
  };
  _count: {
    lessons: number;
    enrollments: number;
  };
  averageRating?: number | null;
  reviewCount?: number;
};

export type HomepageCourseCollection = {
  key: HomepageCourseCollectionKey;
  courses: HomepageCourseCard[];
};

const HOMEPAGE_COLLECTION_LIMIT = 3;
const RECENT_ACTIVITY_WINDOW_DAYS = 7;

const publishedOnly = {
  status: PublicationStatus.PUBLISHED
} satisfies Prisma.SubjectWhereInput;

type HomepageEnrollmentCard = HomepageCourseCard & {
  updatedAt: Date;
};

function getTopSubjectOutcomes(
  courses: Array<{
    outcomes: string[];
  }>,
  limit = 4
) {
  const uniqueOutcomes = new Set<string>();

  for (const course of courses) {
    for (const outcome of course.outcomes) {
      if (uniqueOutcomes.size >= limit) {
        return Array.from(uniqueOutcomes);
      }

      uniqueOutcomes.add(outcome);
    }
  }

  return Array.from(uniqueOutcomes);
}

function mapToLookup<T extends { courseId: string }>(
  entries: T[],
  selector: (entry: T) => number
) {
  return new Map(entries.map((entry) => [entry.courseId, selector(entry)]));
}

function selectUniqueCourses(
  sortedCourses: HomepageCourseCard[],
  usedIds: Set<string>,
  limit = HOMEPAGE_COLLECTION_LIMIT
) {
  const selected: HomepageCourseCard[] = [];

  for (const course of sortedCourses) {
    if (selected.length >= limit) {
      break;
    }

    if (usedIds.has(course.id)) {
      continue;
    }

    selected.push(course);
    usedIds.add(course.id);
  }

  if (selected.length < limit) {
    for (const course of sortedCourses) {
      if (selected.length >= limit) {
        break;
      }

      if (selected.some((item) => item.id === course.id)) {
        continue;
      }

      selected.push(course);
    }
  }

  return selected;
}

function mapCourseToHomepageCard(
  course: {
    id: string;
    slug: string;
    title: string;
    subtitle: string | null;
    shortDescription: string | null;
    thumbnailUrl: string | null;
    difficulty: CourseDifficulty;
    isFeatured: boolean;
    isPopular: boolean;
    viewCount: number;
    publishedAt: Date;
    durationMinutes: number;
    badges: string[];
    instructor: {
      name: string;
    };
    category: {
      name: string;
      subject: {
        name: string;
        slug?: string;
      };
    };
    _count: {
      lessons: number;
      enrollments: number;
    };
    averageRating?: number | null;
    reviewCount?: number;
  },
  overrides?: Partial<HomepageCourseCard>
) {
  return {
    id: course.id,
    slug: course.slug,
    title: course.title,
    subtitle: course.subtitle,
    shortDescription: course.shortDescription,
    thumbnailUrl: course.thumbnailUrl,
    difficulty: course.difficulty,
    isFeatured: course.isFeatured,
    isPopular: course.isPopular,
    viewCount: course.viewCount,
    publishedAt: course.publishedAt,
    durationMinutes: course.durationMinutes,
    badges: course.badges,
    instructor: {
      name: course.instructor.name
    },
    category: {
      name: course.category.name,
      subject: {
        name: course.category.subject.name,
        slug: course.category.subject.slug
      }
    },
    _count: course._count,
    averageRating: course.averageRating ?? null,
    reviewCount: course.reviewCount ?? 0,
    ...overrides
  } satisfies HomepageCourseCard;
}

function createTrendingCourses(courses: HomepageCourseCard[]) {
  const recentThreshold = Date.now() - RECENT_ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  return courses
    .slice()
    .sort((a, b) => {
      const scoreA =
        Number(a.badges.includes("Trending")) * 50 +
        Number(a.publishedAt.getTime() >= recentThreshold) * 8 +
        a.viewCount * 0.03 +
        a._count.enrollments * 7 +
        Number(a.isFeatured) * 4;
      const scoreB =
        Number(b.badges.includes("Trending")) * 50 +
        Number(b.publishedAt.getTime() >= recentThreshold) * 8 +
        b.viewCount * 0.03 +
        b._count.enrollments * 7 +
        Number(b.isFeatured) * 4;

      return scoreB - scoreA || b.viewCount - a.viewCount || a.title.localeCompare(b.title);
    })
    .slice(0, HOMEPAGE_COLLECTION_LIMIT)
    .map((course) => ({
      ...course,
      badges: Array.from(new Set(["Trending", ...course.badges.filter((badge) => badge !== "New")]))
    }));
}

function createNewCourses(courses: HomepageCourseCard[]) {
  return courses
    .slice()
    .sort(
      (a, b) =>
        b.publishedAt.getTime() - a.publishedAt.getTime() ||
        b.viewCount - a.viewCount ||
        b._count.enrollments - a._count.enrollments ||
        a.title.localeCompare(b.title)
    )
    .slice(0, HOMEPAGE_COLLECTION_LIMIT)
    .map((course) => ({
      ...course,
      badges: Array.from(new Set(["New", ...course.badges]))
    }));
}

function createGenericContinueLearning(courses: HomepageCourseCard[]) {
  return courses
    .slice()
    .sort((a, b) => {
      const scoreA =
        a._count.enrollments * 8 +
        a.viewCount * 0.08 +
        Number(a.isPopular) * 18 +
        Number(a.isFeatured) * 12 +
        Number(a.badges.includes("Editor Pick")) * 28;
      const scoreB =
        b._count.enrollments * 8 +
        b.viewCount * 0.08 +
        Number(b.isPopular) * 18 +
        Number(b.isFeatured) * 12 +
        Number(b.badges.includes("Editor Pick")) * 28;

      return scoreB - scoreA || b.viewCount - a.viewCount || a.title.localeCompare(b.title);
    })
    .slice(0, HOMEPAGE_COLLECTION_LIMIT)
    .map((course) =>
      mapCourseToHomepageCard(course, {
        personalizedReason: "Sign in to resume your lesson history and progress from this section.",
        actionLabel: "Start learning"
      })
    );
}

function createGenericRecommendations(courses: HomepageCourseCard[]) {
  const usedIds = new Set<string>();

  return selectUniqueCourses(
    courses
      .slice()
      .sort((a, b) => {
        const scoreA =
          a._count.enrollments * 6 +
          a.viewCount * 0.06 +
          Number(a.isPopular) * 16 +
          Number(a.isFeatured) * 10 +
          Number(a.badges.includes("Trending")) * 12;
        const scoreB =
          b._count.enrollments * 6 +
          b.viewCount * 0.06 +
          Number(b.isPopular) * 16 +
          Number(b.isFeatured) * 10 +
          Number(b.badges.includes("Trending")) * 12;

        return scoreB - scoreA || b.viewCount - a.viewCount || a.title.localeCompare(b.title);
      }),
    usedIds
  ).map((course) =>
    mapCourseToHomepageCard(course, {
      personalizedReason: "Popular starting points across ERA subjects while your personal profile is still loading."
    })
  );
}

function createContinueLearningFromEnrollments(enrollments: HomepageEnrollmentCard[], fallbackCourses: HomepageCourseCard[]) {
  if (enrollments.length === 0) {
    return createGenericContinueLearning(fallbackCourses);
  }

  return enrollments
    .slice()
    .sort((a, b) => {
      const scoreA = (a.progressPercent !== 100 ? 500 : 0) + a.updatedAt.getTime();
      const scoreB = (b.progressPercent !== 100 ? 500 : 0) + b.updatedAt.getTime();
      return scoreB - scoreA;
    })
    .slice(0, HOMEPAGE_COLLECTION_LIMIT)
    .map(({ updatedAt: _updatedAt, ...course }) => course);
}

function createRecommendedCourses(args: {
  courses: HomepageCourseCard[];
  enrolledCourseIds: Set<string>;
  onboarding:
    | {
        subjectSlug: string | null;
        preferredDifficulty: CourseDifficulty | null;
      }
    | null;
  learningSignals: {
    subjectNames: Set<string>;
    categoryNames: Set<string>;
    difficulties: Set<CourseDifficulty>;
  };
}) {
  const recommendationPool = args.courses.filter((course) => !args.enrolledCourseIds.has(course.id));

  if (recommendationPool.length === 0) {
    return [];
  }

  return recommendationPool
    .slice()
    .sort((a, b) => {
      const score = (course: HomepageCourseCard) => {
        let total =
          course._count.enrollments * 5 +
          course.viewCount * 0.04 +
          Number(course.isPopular) * 12 +
          Number(course.isFeatured) * 10 +
          Number(course.badges.includes("Trending")) * 10 +
          Number(course.badges.includes("Editor Pick")) * 8;

        if (args.onboarding?.subjectSlug && course.category.subject.slug) {
          total += Number(args.onboarding.subjectSlug === course.category.subject.slug) * 42;
        }

        if (args.onboarding?.preferredDifficulty === course.difficulty) {
          total += 18;
        }

        if (args.learningSignals.subjectNames.has(course.category.subject.name)) {
          total += 14;
        }

        if (args.learningSignals.categoryNames.has(course.category.name)) {
          total += 10;
        }

        if (args.learningSignals.difficulties.has(course.difficulty)) {
          total += 8;
        }

        return total;
      };

      return score(b) - score(a) || b.viewCount - a.viewCount || a.title.localeCompare(b.title);
    })
    .slice(0, HOMEPAGE_COLLECTION_LIMIT)
    .map((course) => {
      const matchesOnboarding =
        args.onboarding?.subjectSlug &&
        args.onboarding.subjectSlug === course.category.subject.slug;
      const matchesActivity =
        args.learningSignals.subjectNames.has(course.category.subject.name) ||
        args.learningSignals.categoryNames.has(course.category.name);

      return mapCourseToHomepageCard(course, {
        personalizedReason: matchesOnboarding
          ? "Recommended from your onboarding goal and current level."
          : matchesActivity
            ? "Recommended because it matches the subjects you are already learning."
            : "Recommended from live learner demand and course quality signals."
      });
    });
}

function createHomepageCollections(args: {
  courses: HomepageCourseCard[];
  continueLearning: HomepageCourseCard[];
  recommendedForYou: HomepageCourseCard[];
}) {
  return [
    { key: "continueLearning" as const, courses: args.continueLearning },
    { key: "recommendedForYou" as const, courses: args.recommendedForYou },
    { key: "trendingCourses" as const, courses: createTrendingCourses(args.courses) },
    { key: "newCourses" as const, courses: createNewCourses(args.courses) }
  ].filter((section) => section.courses.length > 0);
}

export async function getSubjectsWithCounts() {
  return prisma.subject.findMany({
    where: publishedOnly,
    orderBy: [{ position: "asc" }, { name: "asc" }],
    include: {
      categories: {
        where: { status: PublicationStatus.PUBLISHED },
        orderBy: [{ position: "asc" }, { name: "asc" }],
        include: {
          _count: {
            select: {
              courses: true
            }
          }
        }
      },
      _count: {
        select: {
          categories: true
        }
      }
    }
  });
}

export async function getSubjectBySlug(slug: string) {
  const subject = await prisma.subject.findFirst({
    where: {
      slug,
      status: PublicationStatus.PUBLISHED
    },
    include: {
      categories: {
        where: { status: PublicationStatus.PUBLISHED },
        orderBy: [{ position: "asc" }, { name: "asc" }],
        include: {
          courses: {
            where: { status: PublicationStatus.PUBLISHED },
            orderBy: [{ position: "asc" }, { title: "asc" }],
            include: {
              instructor: true,
              lessons: {
                where: { status: PublicationStatus.PUBLISHED },
                select: {
                  duration: true
                }
              },
              _count: {
                select: {
                  lessons: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!subject) {
    return null;
  }

  const allCourses = subject.categories.flatMap((category) => category.courses);
  const totalLessons = allCourses.reduce((sum, course) => sum + course._count.lessons, 0);
  const totalDurationMinutes = allCourses.reduce(
    (sum, course) =>
      sum +
      course.lessons.reduce((lessonSum, lesson) => lessonSum + parseDurationToMinutes(lesson.duration), 0),
    0
  );
  const instructorCount = new Set(allCourses.map((course) => course.instructor.id)).size;
  const topOutcomes = getTopSubjectOutcomes(allCourses);

  return {
    ...subject,
    totalLessons,
    totalDurationMinutes,
    instructorCount,
    topOutcomes
  };
}

export async function getCourseFiltersData() {
  return prisma.subject.findMany({
    where: { status: PublicationStatus.PUBLISHED },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      categories: {
        where: { status: PublicationStatus.PUBLISHED },
        orderBy: [{ position: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          slug: true
        }
      }
    }
  });
}

export async function getCourses(filters: CourseFilters) {
  const where: Prisma.CourseWhereInput = {
    status: PublicationStatus.PUBLISHED,
    ...(filters.difficulty ? { difficulty: filters.difficulty } : {}),
    ...(filters.search
      ? {
          OR: [
            { title: { contains: filters.search, mode: "insensitive" } },
            { shortDescription: { contains: filters.search, mode: "insensitive" } },
            { description: { contains: filters.search, mode: "insensitive" } },
            { instructor: { name: { contains: filters.search, mode: "insensitive" } } }
          ]
        }
      : {}),
    ...(filters.category
      ? {
          category: {
            id: filters.category
          }
        }
      : {}),
    ...(filters.subject
      ? {
          category: {
            ...(filters.category ? { id: filters.category } : {}),
            subject: {
              slug: filters.subject
            }
          }
        }
      : {})
  };

  const courses = await prisma.course.findMany({
    where,
    orderBy: [{ isFeatured: "desc" }, { isPopular: "desc" }, { position: "asc" }, { title: "asc" }],
    include: {
      instructor: true,
      category: {
        include: {
          subject: true
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
          lessons: true
        }
      },
      reviews: {
        select: {
          rating: true
        }
      }
    }
  });

  const mappedCourses = courses.map((course) => {
      const { reviews, ...courseWithoutReviews } = course;

      return {
      ...courseWithoutReviews,
      averageRating:
        reviews.length > 0
          ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
          : null,
      reviewCount: reviews.length,
      durationMinutes: course.lessons.reduce(
        (sum, lesson) => sum + parseDurationToMinutes(lesson.duration),
        0
      )
    };
  });

  if (filters.sort === "rating") {
    return mappedCourses.sort(
      (a, b) =>
        (b.averageRating ?? 0) - (a.averageRating ?? 0) ||
        b.reviewCount - a.reviewCount ||
        b.viewCount - a.viewCount ||
        a.title.localeCompare(b.title)
    );
  }

  return mappedCourses.sort(
    (a, b) =>
      Number(b.isPopular) - Number(a.isPopular) ||
      b.viewCount - a.viewCount ||
      Number(b.isFeatured) - Number(a.isFeatured) ||
      a.title.localeCompare(b.title)
  );
}

export async function getCourseBySlug(slug: string) {
  const currentUser = await getCurrentUser();
  const course = await prisma.course.findFirst({
    where: {
      slug,
      status: PublicationStatus.PUBLISHED
    },
    include: {
      instructor: true,
      category: {
        include: {
          subject: true
        }
      },
      modules: {
        where: { status: PublicationStatus.PUBLISHED },
        orderBy: [{ position: "asc" }],
        include: {
          lessons: {
            where: { status: PublicationStatus.PUBLISHED },
            orderBy: [{ position: "asc" }],
            select: {
              id: true
            }
          }
        }
      },
      // Public catalogue page (anyone, signed out included): outline only. Lesson notes, quizzes, video URLs and
      // material files are served only inside the authorized classroom (Prompt 09 acceptance audit).
      materials: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        where: { lessonId: null },
        select: { id: true, title: true }
      },
      lessons: {
        where: { status: PublicationStatus.PUBLISHED },
        orderBy: [{ position: "asc" }],
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          duration: true,
          position: true,
          moduleId: true,
          module: { select: { id: true, title: true } },
          materials: {
            orderBy: [{ position: "asc" }, { createdAt: "asc" }],
            select: { id: true, title: true }
          }
        }
      },
      reviews: {
        orderBy: [{ updatedAt: "desc" }],
        include: {
          user: {
            select: {
              id: true,
              name: true
            }
          }
        }
      }
    }
  });

  if (!course) {
    return null;
  }

  return {
    ...course,
    averageRating:
      course.reviews.length > 0
        ? course.reviews.reduce((sum, review) => sum + review.rating, 0) / course.reviews.length
        : null,
    reviewCount: course.reviews.length,
    currentUserReview:
      currentUser ? course.reviews.find((review) => review.userId === currentUser.id) ?? null : null,
    durationMinutes: course.lessons.reduce(
      (sum, lesson) => sum + parseDurationToMinutes(lesson.duration),
      0
    )
  };
}

export async function getRelatedCourses(courseId: string, categoryId: string, subjectId: string) {
  return prisma.course.findMany({
    where: {
      id: { not: courseId },
      status: PublicationStatus.PUBLISHED,
      OR: [{ categoryId }, { category: { subjectId } }]
    },
    take: 3,
    orderBy: [{ isFeatured: "desc" }, { isPopular: "desc" }, { position: "asc" }],
    include: {
      instructor: true,
      category: {
        include: {
          subject: true
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
          lessons: true
        }
      },
      reviews: {
        select: {
          rating: true
        }
      }
    }
  }).then((courses) =>
    courses.map((course) => {
      const { reviews, ...courseWithoutReviews } = course;

      return {
      ...courseWithoutReviews,
      averageRating:
        reviews.length > 0
          ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
          : null,
      reviewCount: reviews.length,
      durationMinutes: course.lessons.reduce(
        (sum, lesson) => sum + parseDurationToMinutes(lesson.duration),
        0
      )
    };
    })
  );
}

export async function getHomepageData() {
  let currentUser: Awaited<ReturnType<typeof getCurrentUser>> = null;

  try {
    currentUser = await getCurrentUser();
  } catch (error) {
    if (!isDatabaseOfflineError(error)) {
      throw error;
    }
  }

  const recentWindowStart = new Date(Date.now() - RECENT_ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const previousWindowStart = new Date(recentWindowStart.getTime() - RECENT_ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const baseQueries = [
    prisma.subject.findMany({
      where: { status: PublicationStatus.PUBLISHED },
      orderBy: [{ position: "asc" }, { name: "asc" }],
      include: {
        categories: {
          where: { status: PublicationStatus.PUBLISHED },
          include: {
            _count: {
              select: {
                courses: true
              }
            }
          }
        }
      }
    }),
    prisma.course.findMany({
      where: {
        status: PublicationStatus.PUBLISHED,
        lessons: {
          some: {
            status: PublicationStatus.PUBLISHED
          }
        }
      },
      orderBy: [{ homepagePriority: "desc" }, { position: "asc" }, { title: "asc" }],
      include: {
        instructor: {
          select: {
            name: true
          }
        },
        lessons: {
          where: { status: PublicationStatus.PUBLISHED },
          select: {
            id: true,
            duration: true
          }
        },
        category: {
          select: {
            name: true,
            subject: {
              select: {
                name: true,
                slug: true
              }
            }
          }
        },
        _count: {
          select: {
            lessons: true,
            enrollments: true
          }
        },
        reviews: {
          select: {
            rating: true
          }
        }
      }
    }),
    prisma.enrollment.groupBy({
      by: ["courseId"],
      _avg: {
        progress: true
      },
      _count: {
        _all: true
      }
    }),
    prisma.enrollment.groupBy({
      by: ["courseId"],
      where: {
        createdAt: {
          gte: recentWindowStart
        }
      },
      _count: {
        _all: true
      }
    }),
    prisma.courseViewEvent.groupBy({
      by: ["courseId"],
      where: {
        createdAt: {
          gte: recentWindowStart
        }
      },
      _count: {
        _all: true
      }
    }),
    prisma.courseViewEvent.groupBy({
      by: ["courseId"],
      where: {
        createdAt: {
          gte: previousWindowStart,
          lt: recentWindowStart
        }
      },
      _count: {
        _all: true
      }
    }),
    prisma.course.count({
      where: { status: PublicationStatus.PUBLISHED }
    }),
    prisma.lesson.count({
      where: { status: PublicationStatus.PUBLISHED }
    }),
    prisma.instructor.findMany({
      orderBy: [{ courses: { _count: "desc" } }, { name: "asc" }],
      take: 3,
      include: {
        _count: {
          select: {
            courses: true
          }
        }
      }
    }),
    prisma.instructor.count(),
    prisma.siteSetting.findUnique({
      where: { id: "default" }
    })
  ] as const;

  const personalizedQueries =
    currentUser?.role === "STUDENT"
      ? ([
          prisma.enrollment.findMany({
            where: {
              userId: currentUser.id
            },
            orderBy: [{ updatedAt: "desc" }],
            take: HOMEPAGE_COLLECTION_LIMIT + 3,
            include: {
              currentLesson: {
                select: {
                  slug: true
                }
              },
              course: {
                select: {
                  id: true,
                  slug: true,
                  title: true,
                  subtitle: true,
                  shortDescription: true,
                  thumbnailUrl: true,
                  difficulty: true,
                  isFeatured: true,
                  isPopular: true,
                  viewCount: true,
                  publishedAt: true,
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
                          name: true,
                          slug: true
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
                  },
                  reviews: {
                    select: {
                      rating: true
                    }
                  }
                }
              }
            }
          }),
          prisma.userOnboarding.findUnique({
            where: {
              userId: currentUser.id
            },
            select: {
              goal: true,
              level: true,
              recommendedLevel: true,
              recommendedSubjectSlug: true
            }
          })
        ] as const)
      : null;

  const [
    subjects,
    courses,
    enrollmentStats,
    recentEnrollmentStats,
    recentViewStats,
    previousViewStats,
    courseCount,
    lessonCount,
    instructors,
    instructorCount,
    settings,
    personalizedResult
  ] = await Promise.all([
    ...baseQueries,
    personalizedQueries
      ? Promise.all(personalizedQueries)
      : Promise.resolve<[[], null]>([[], null])
  ]);

  const totalSubjectTracks = subjects.reduce((sum, subject) => sum + subject.categories.length, 0);
  const averageProgressByCourseId = new Map(
    enrollmentStats.map((entry) => [entry.courseId, entry._avg.progress ?? 0])
  );
  const recentEnrollmentsByCourseId = mapToLookup(
    recentEnrollmentStats,
    (entry) => entry._count._all
  );
  const recentViewsByCourseId = mapToLookup(recentViewStats, (entry) => entry._count._all);
  const previousViewsByCourseId = mapToLookup(previousViewStats, (entry) => entry._count._all);
  const homepageCourses = courses.map((course) => {
    const durationMinutes = course.lessons.reduce(
      (sum, lesson) => sum + parseDurationToMinutes(lesson.duration),
      0
    );
    const averageProgress = averageProgressByCourseId.get(course.id) ?? 0;
    const recentViews = recentViewsByCourseId.get(course.id) ?? 0;
    const previousViews = previousViewsByCourseId.get(course.id) ?? 0;
    const recentEnrollments = recentEnrollmentsByCourseId.get(course.id) ?? 0;
    const growth = Math.max(0, recentViews - previousViews);
    const badges = [
      course.homepagePriority >= 8 ? "Editor Pick" : null,
      averageProgress >= 55 ? "High Progress" : null,
      growth >= 8 || recentEnrollments >= 2 ? "Trending" : null,
      recentViews >= 10 ? "Popular" : null,
      course.publishedAt >= recentWindowStart ? "New" : null
    ].filter((badge): badge is string => Boolean(badge));

    return mapCourseToHomepageCard({
      ...course,
      durationMinutes,
      averageRating:
        course.reviews.length > 0
          ? course.reviews.reduce((sum, review) => sum + review.rating, 0) / course.reviews.length
          : null,
      reviewCount: course.reviews.length,
      badges,
      _count: {
        lessons: course._count.lessons,
        enrollments: course._count.enrollments
      }
    });
  });

  const [userEnrollments, onboarding] = personalizedResult;
  const continueLearning =
    currentUser?.role === "STUDENT"
      ? createContinueLearningFromEnrollments(
          userEnrollments.map((enrollment) => {
            const durationMinutes = enrollment.course.lessons.reduce(
              (sum, lesson) => sum + parseDurationToMinutes(lesson.duration),
              0
            );
            const liveCourse = homepageCourses.find((course) => course.id === enrollment.courseId);

            return {
              ...mapCourseToHomepageCard(
                {
                  ...enrollment.course,
                  durationMinutes,
                  averageRating:
                    enrollment.course.reviews.length > 0
                      ? enrollment.course.reviews.reduce((sum, review) => sum + review.rating, 0) /
                        enrollment.course.reviews.length
                      : null,
                  reviewCount: enrollment.course.reviews.length,
                  badges: liveCourse?.badges ?? [],
                  _count: {
                    lessons: enrollment.course._count.lessons,
                    enrollments: enrollment.course._count.enrollments
                  }
                },
                {
                  progressPercent: enrollment.progress,
                  personalizedReason:
                    enrollment.progress > 0
                      ? `You are ${enrollment.progress}% through this course.`
                      : "A good place to start your first focused lesson.",
                  actionLabel:
                    enrollment.currentLesson?.slug || enrollment.progress > 0
                      ? "Continue course"
                      : "Open course",
                  actionHref: enrollment.currentLesson?.slug
                    ? `/courses/${enrollment.course.slug}/lessons/${enrollment.currentLesson.slug}`
                    : `/courses/${enrollment.course.slug}`
                }
              ),
              updatedAt: enrollment.updatedAt
            };
          }),
          homepageCourses
        )
      : createGenericContinueLearning(homepageCourses);

  const enrolledCourseIds = new Set(userEnrollments.map((enrollment) => enrollment.courseId));
  const learningSignals = {
    subjectNames: new Set(userEnrollments.map((enrollment) => enrollment.course.category.subject.name)),
    categoryNames: new Set(userEnrollments.map((enrollment) => enrollment.course.category.name)),
    difficulties: new Set(userEnrollments.map((enrollment) => enrollment.course.difficulty))
  };
  const recommendedForYou =
    currentUser?.role === "STUDENT"
      ? createRecommendedCourses({
          courses: homepageCourses,
          enrolledCourseIds,
          onboarding: onboarding
            ? {
                subjectSlug: onboarding.recommendedSubjectSlug,
                preferredDifficulty: onboarding.recommendedLevel ?? onboarding.level
              }
            : null,
          learningSignals
        })
      : createGenericRecommendations(homepageCourses);

  return {
    subjects,
    collections: createHomepageCollections({
      courses: homepageCourses,
      continueLearning,
      recommendedForYou:
        recommendedForYou.length > 0 ? recommendedForYou : createGenericRecommendations(homepageCourses)
    }),
    instructors,
    settings,
    stats: {
      courseCount,
      lessonCount,
      totalSubjectTracks,
      instructorCount
    }
  };
}

export async function getPublishedCourseSlugs() {
  return prisma.course.findMany({
    where: { status: PublicationStatus.PUBLISHED },
    select: { slug: true }
  });
}

export async function getPublishedSubjectSlugs() {
  return prisma.subject.findMany({
    where: { status: PublicationStatus.PUBLISHED },
    select: { slug: true }
  });
}

export async function getMyLearningData() {
  const currentUser = await getCurrentUser();

  if (!currentUser || currentUser.role !== "STUDENT") {
    return {
      currentUser,
      enrollments: [],
      databaseUnavailable: false,
      onboardingSummary: null,
      onboardingRequired: false,
      gamificationSummary: null,
      analyticsSummary: null
    };
  }

  try {
    const [enrollments, onboardingRequired, onboardingSummary, gamificationSummary, analyticsSummary] = await Promise.all([
      retryOnDatabaseFailure(() =>
        prisma.enrollment.findMany({
          where: {
            userId: currentUser.id
          },
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
          include: {
            currentLesson: {
              select: {
                id: true,
                slug: true
              }
            },
            course: {
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
                  select: {
                    id: true,
                    slug: true,
                    duration: true
                  }
                },
                _count: {
                  select: {
                    lessons: true
                  }
                }
              }
            }
          }
        })
      ),
      getOnboardingGateStatus(currentUser.id),
      getOnboardingDashboardSummary(currentUser.id),
      getGamificationSummary(currentUser.id),
      getStudentAnalyticsSummary(currentUser.id)
    ]);

    return {
      currentUser,
      databaseUnavailable: false,
      onboardingRequired,
      onboardingSummary,
      gamificationSummary,
      analyticsSummary,
      enrollments: enrollments.map((enrollment) => ({
        ...enrollment,
        course: {
          ...enrollment.course,
          currentLesson: enrollment.currentLesson,
          durationMinutes: enrollment.course.lessons.reduce(
            (sum, lesson) => sum + parseDurationToMinutes(lesson.duration),
            0
          )
        }
      }))
    };
  } catch (error) {
    if (!isDatabaseOfflineError(error)) {
      throw error;
    }

    return {
      currentUser,
      databaseUnavailable: true,
      enrollments: [],
      onboardingSummary: null,
      onboardingRequired: false,
      gamificationSummary: null,
      analyticsSummary: null
    };
  }
}
