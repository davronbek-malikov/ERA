import { PublicationStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export async function getEnrollmentProgressSummary(
  userId: string,
  courseId: string,
  db: typeof prisma = prisma
) {
  const [publishedLessonCount, completionCount] = await Promise.all([
    db.lesson.count({
      where: {
        courseId,
        status: PublicationStatus.PUBLISHED
      }
    }),
    db.lessonCompletion.count({
      where: {
        userId,
        lesson: {
          courseId,
          status: PublicationStatus.PUBLISHED
        }
      }
    })
  ]);

  const progress =
    publishedLessonCount > 0 ? Math.round((completionCount / publishedLessonCount) * 100) : 0;

  return {
    progress,
    completedLessons: completionCount,
    totalLessons: publishedLessonCount
  };
}

export async function syncEnrollmentProgressForUser(
  userId: string,
  courseId: string,
  db: typeof prisma = prisma
) {
  const summary = await getEnrollmentProgressSummary(userId, courseId, db);

  await db.enrollment.upsert({
    where: {
      userId_courseId: {
        userId,
        courseId
      }
    },
    update: {
      progress: summary.progress
    },
    create: {
      userId,
      courseId,
      progress: summary.progress
    }
  });

  return summary;
}
