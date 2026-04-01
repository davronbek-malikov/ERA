import { CourseDifficulty, PublicationStatus, Prisma } from "@prisma/client";

import {
  demoCategories,
  demoCourses,
  demoEnrollments,
  demoInstructors,
  demoLessons,
  demoSubjects,
  demoUsers
} from "@/lib/demo-data";
import { parseDurationToMinutes } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEnrollmentProgressSummary } from "@/lib/progress";
import { getPublicMomentumEntries } from "@/lib/public-home";
import { isDatabaseOfflineError, retryOnDatabaseFailure, withDatabaseFallback } from "@/lib/server-data";

export type CourseFilters = {
  subject?: string;
  category?: string;
  difficulty?: CourseDifficulty;
  search?: string;
};

const publishedOnly = {
  status: PublicationStatus.PUBLISHED
} satisfies Prisma.SubjectWhereInput;

function getDemoSubjectRecords() {
  return demoSubjects
    .filter((subject) => subject.status === PublicationStatus.PUBLISHED)
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
    .map((subject) => ({
      ...subject,
      categories: demoCategories
        .filter(
          (category) =>
            category.subjectId === subject.id && category.status === PublicationStatus.PUBLISHED
        )
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
        .map((category) => ({
          ...category,
          _count: {
            courses: demoCourses.filter(
              (course) =>
                course.categoryId === category.id && course.status === PublicationStatus.PUBLISHED
            ).length
          }
        })),
      _count: {
        categories: demoCategories.filter((category) => category.subjectId === subject.id).length
      }
    }));
}

function getDemoCourseRecord(course: (typeof demoCourses)[number]) {
  const instructor = demoInstructors.find((item) => item.id === course.instructorId)!;
  const category = demoCategories.find((item) => item.id === course.categoryId)!;
  const subject = demoSubjects.find((item) => item.id === category.subjectId)!;
  const lessons = demoLessons
    .filter((lesson) => lesson.courseId === course.id && lesson.status === PublicationStatus.PUBLISHED)
    .sort((a, b) => a.position - b.position);

  return {
    ...course,
    instructor,
    category: {
      ...category,
      subject
    },
    lessons: lessons.map((lesson) => ({
      ...lesson,
      materials: []
    })),
    materials: [],
    durationMinutes: lessons.reduce((sum, lesson) => sum + parseDurationToMinutes(lesson.duration), 0),
    _count: {
      lessons: lessons.length,
      enrollments: 0
    }
  };
}

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

export async function getSubjectsWithCounts() {
  return withDatabaseFallback(
    () =>
      prisma.subject.findMany({
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
      }),
    () => getDemoSubjectRecords()
  );
}

export async function getSubjectBySlug(slug: string) {
  return withDatabaseFallback(
    async () => {
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
    },
    () => {
      const subject = demoSubjects.find((item) => item.slug === slug);

      if (!subject) {
        return null;
      }

      const categories = demoCategories
        .filter(
          (category) =>
            category.subjectId === subject.id && category.status === PublicationStatus.PUBLISHED
        )
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
        .map((category) => ({
          ...category,
          courses: demoCourses
            .filter(
              (course) =>
                course.categoryId === category.id && course.status === PublicationStatus.PUBLISHED
            )
            .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title))
            .map((course) => ({
              ...course,
              instructor: demoInstructors.find((item) => item.id === course.instructorId)!,
              _count: {
                lessons: demoLessons.filter((lesson) => lesson.courseId === course.id).length
              },
              lessons: demoLessons
                .filter((lesson) => lesson.courseId === course.id)
                .map((lesson) => ({ duration: lesson.duration }))
            }))
        }));

      const allCourses = categories.flatMap((category) => category.courses);

      return {
        ...subject,
        categories,
        totalLessons: allCourses.reduce((sum, course) => sum + course._count.lessons, 0),
        totalDurationMinutes: allCourses.reduce(
          (sum, course) =>
            sum +
            course.lessons.reduce((lessonSum, lesson) => lessonSum + parseDurationToMinutes(lesson.duration), 0),
          0
        ),
        instructorCount: new Set(allCourses.map((course) => course.instructor.id)).size,
        topOutcomes: getTopSubjectOutcomes(allCourses)
      };
    }
  );
}

export async function getCourseFiltersData() {
  return withDatabaseFallback(
    () =>
      prisma.subject.findMany({
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
      }),
    () =>
      demoSubjects.map((subject) => ({
        id: subject.id,
        name: subject.name,
        slug: subject.slug,
        categories: demoCategories
          .filter((category) => category.subjectId === subject.id)
          .map((category) => ({
            id: category.id,
            name: category.name,
            slug: category.slug
          }))
      }))
  );
}

export async function getCourses(filters: CourseFilters) {
  return withDatabaseFallback(
    () => {
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

      return prisma.course.findMany({
        where,
        orderBy: [{ isFeatured: "desc" }, { position: "asc" }, { title: "asc" }],
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
          }
        }
      }).then((courses) =>
        courses.map((course) => ({
          ...course,
          durationMinutes: course.lessons.reduce(
            (sum, lesson) => sum + parseDurationToMinutes(lesson.duration),
            0
          )
        }))
      );
    },
    () => {
      const search = filters.search?.toLowerCase();

      return demoCourses
        .filter((course) => course.status === PublicationStatus.PUBLISHED)
        .filter((course) => !filters.difficulty || course.difficulty === filters.difficulty)
        .filter((course) => !filters.category || course.categoryId === filters.category)
        .filter((course) => {
          if (!filters.subject) {
            return true;
          }

          const category = demoCategories.find((item) => item.id === course.categoryId)!;
          const subject = demoSubjects.find((item) => item.id === category.subjectId)!;
          return subject.slug === filters.subject;
        })
        .filter((course) => {
          if (!search) {
            return true;
          }

          const instructor = demoInstructors.find((item) => item.id === course.instructorId)!;
          return [course.title, course.shortDescription ?? "", course.description ?? "", instructor.name]
            .join(" ")
            .toLowerCase()
            .includes(search);
        })
        .sort(
          (a, b) =>
            Number(b.isFeatured) - Number(a.isFeatured) ||
            a.position - b.position ||
            a.title.localeCompare(b.title)
        )
        .map((course) => getDemoCourseRecord(course));
    }
  );
}

export async function getCourseBySlug(slug: string) {
  return withDatabaseFallback(
    async () => {
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
          materials: {
            orderBy: [{ position: "asc" }, { createdAt: "asc" }]
          },
          lessons: {
            where: { status: PublicationStatus.PUBLISHED },
            orderBy: [{ position: "asc" }],
            include: {
              materials: {
                orderBy: [{ position: "asc" }, { createdAt: "asc" }]
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
        durationMinutes: course.lessons.reduce(
          (sum, lesson) => sum + parseDurationToMinutes(lesson.duration),
          0
        )
      };
    },
    () => {
      const course = demoCourses.find((item) => item.slug === slug);
      return course ? getDemoCourseRecord(course) : null;
    }
  );
}

export async function getRelatedCourses(courseId: string, categoryId: string, subjectId: string) {
  return withDatabaseFallback(
    () =>
      prisma.course.findMany({
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
          }
        }
      }).then((courses) =>
        courses.map((course) => ({
          ...course,
          durationMinutes: course.lessons.reduce(
            (sum, lesson) => sum + parseDurationToMinutes(lesson.duration),
            0
          )
        }))
      ),
    () =>
      demoCourses
        .filter((course) => course.id !== courseId && course.status === PublicationStatus.PUBLISHED)
        .filter((course) => {
          const category = demoCategories.find((item) => item.id === course.categoryId)!;
          return category.id === categoryId || category.subjectId === subjectId;
        })
        .sort(
          (a, b) =>
            Number(b.isFeatured) - Number(a.isFeatured) ||
            Number(b.isPopular) - Number(a.isPopular) ||
            a.position - b.position
        )
        .slice(0, 3)
        .map((course) => getDemoCourseRecord(course))
  );
}

export async function getHomepageData() {
  return withDatabaseFallback(
    async () => {
      const [subjects, featuredCourses, courseCount, lessonCount, instructors, instructorCount, settings] =
        await Promise.all([
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
            orderBy: [
              { isFeatured: "desc" },
              { isPopular: "desc" },
              { position: "asc" },
              { title: "asc" }
            ],
            take: 3,
            include: {
              instructor: true,
              lessons: {
                where: { status: PublicationStatus.PUBLISHED },
                select: {
                  duration: true
                }
              },
              category: {
                include: {
                  subject: true
                }
              },
              _count: {
                select: {
                  lessons: true
                }
              }
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
        ]);

      const totalSubjectTracks = subjects.reduce((sum, subject) => sum + subject.categories.length, 0);

      return {
        subjects,
        featuredCourses: featuredCourses.map((course) => ({
          ...course,
          durationMinutes: course.lessons.reduce(
            (sum, lesson) => sum + parseDurationToMinutes(lesson.duration),
            0
          )
        })),
        instructors,
        learnerMomentum: getPublicMomentumEntries(),
        settings,
        stats: {
          courseCount,
          lessonCount,
          totalSubjectTracks,
          instructorCount
        }
      };
    },
    () => {
      const subjects = getDemoSubjectRecords();
      const featuredCourses = demoCourses
        .filter((course) => course.status === PublicationStatus.PUBLISHED)
        .filter(
          (course) =>
            demoLessons.filter(
              (lesson) =>
                lesson.courseId === course.id && lesson.status === PublicationStatus.PUBLISHED
            ).length > 0
        )
        .sort(
          (a, b) =>
            Number(b.isFeatured) - Number(a.isFeatured) ||
            Number(b.isPopular) - Number(a.isPopular) ||
            a.position - b.position ||
            a.title.localeCompare(b.title)
        )
        .slice(0, 3)
        .map((course) => getDemoCourseRecord(course));
      const instructors = demoInstructors
        .map((instructor) => ({
          ...instructor,
          _count: {
            courses: demoCourses.filter((course) => course.instructorId === instructor.id).length
          }
        }))
        .sort((a, b) => b._count.courses - a._count.courses || a.name.localeCompare(b.name))
        .slice(0, 3);

        return {
          subjects,
          featuredCourses,
          instructors,
          learnerMomentum: getPublicMomentumEntries(),
        settings: null,
        stats: {
          courseCount: demoCourses.length,
          lessonCount: demoLessons.length,
          totalSubjectTracks: demoCategories.length,
          instructorCount: demoInstructors.length
        }
      };
    }
  );
}

export async function getPublishedCourseSlugs() {
  return withDatabaseFallback(
    () =>
      prisma.course.findMany({
        where: { status: PublicationStatus.PUBLISHED },
        select: { slug: true }
      }),
    () => demoCourses.filter((course) => course.status === PublicationStatus.PUBLISHED).map((course) => ({ slug: course.slug }))
  );
}

export async function getPublishedSubjectSlugs() {
  return withDatabaseFallback(
    () =>
      prisma.subject.findMany({
        where: { status: PublicationStatus.PUBLISHED },
        select: { slug: true }
      }),
    () => demoSubjects.filter((subject) => subject.status === PublicationStatus.PUBLISHED).map((subject) => ({ slug: subject.slug }))
  );
}

export async function getMyLearningData() {
  const currentUser = await getCurrentUser();

  if (!currentUser || currentUser.role !== "STUDENT") {
    return {
      currentUser,
      enrollments: [],
      databaseUnavailable: false
    };
  }

  try {
    const enrollments = await retryOnDatabaseFailure(() =>
      prisma.enrollment.findMany({
        where: {
          userId: currentUser.id
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        include: {
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
    );

    return {
      currentUser,
      databaseUnavailable: false,
      enrollments: enrollments.map((enrollment) => ({
        ...enrollment,
        course: {
          ...enrollment.course,
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
      enrollments: []
    };
  }
}
