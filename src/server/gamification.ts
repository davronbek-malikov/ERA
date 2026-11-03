import { PublicationStatus, UserRole } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth";
import { demoEnrollments, demoLessons } from "@/lib/demo-data";
import { prisma } from "@/lib/prisma";
import { retryOnDatabaseFailure, withDatabaseFallback } from "@/lib/server-data";

const XP_PER_LESSON = 50;

const badgeDefinitions = [
  {
    code: "lessons-1",
    title: "First Lesson Complete",
    description: "Completed your first lesson.",
    icon: "Sparkles",
    qualifies: (stats: { completedLessons: number; streak: number }) => stats.completedLessons >= 1
  },
  {
    code: "lessons-10",
    title: "Completed 10 Lessons",
    description: "Finished ten lessons across ERA.",
    icon: "Medal",
    qualifies: (stats: { completedLessons: number; streak: number }) => stats.completedLessons >= 10
  },
  {
    code: "streak-3",
    title: "3 Day Streak",
    description: "Learned on three consecutive days.",
    icon: "Flame",
    qualifies: (stats: { completedLessons: number; streak: number }) => stats.streak >= 3
  },
  {
    code: "streak-7",
    title: "7 Day Streak",
    description: "Kept your learning streak alive for a full week.",
    icon: "Trophy",
    qualifies: (stats: { completedLessons: number; streak: number }) => stats.streak >= 7
  }
] as const;

function getLevelFromXp(totalXp: number) {
  let level = 1;
  let accumulated = 0;
  let nextLevelXp = 100;

  while (totalXp >= accumulated + nextLevelXp) {
    accumulated += nextLevelXp;
    level += 1;
    nextLevelXp = level * 100;
  }

  return {
    level,
    currentLevelXp: totalXp - accumulated,
    nextLevelXp
  };
}

function getLevelTitle(level: number) {
  if (level >= 5) {
    return "Advanced";
  }

  if (level >= 3) {
    return "Intermediate";
  }

  return "Beginner";
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function calculateStreak(dates: Date[]) {
  const uniqueKeys = Array.from(new Set(dates.map(toDateKey))).sort();

  if (uniqueKeys.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      lastActiveDate: null as Date | null
    };
  }

  let longestStreak = 1;
  let running = 1;

  for (let index = 1; index < uniqueKeys.length; index += 1) {
    const previous = new Date(`${uniqueKeys[index - 1]}T00:00:00.000Z`);
    const current = new Date(`${uniqueKeys[index]}T00:00:00.000Z`);
    const diffDays = Math.round((current.getTime() - previous.getTime()) / (24 * 60 * 60 * 1000));

    if (diffDays === 1) {
      running += 1;
      longestStreak = Math.max(longestStreak, running);
    } else {
      running = 1;
    }
  }

  let currentStreak = 1;
  for (let index = uniqueKeys.length - 1; index > 0; index -= 1) {
    const current = new Date(`${uniqueKeys[index]}T00:00:00.000Z`);
    const previous = new Date(`${uniqueKeys[index - 1]}T00:00:00.000Z`);
    const diffDays = Math.round((current.getTime() - previous.getTime()) / (24 * 60 * 60 * 1000));

    if (diffDays === 1) {
      currentStreak += 1;
    } else {
      break;
    }
  }

  return {
    currentStreak,
    longestStreak,
    lastActiveDate: new Date(`${uniqueKeys[uniqueKeys.length - 1]}T00:00:00.000Z`)
  };
}

export async function syncGamificationForUser(userId: string) {
  const completions = await retryOnDatabaseFailure(() =>
    prisma.lessonCompletion.findMany({
      where: {
        userId
      },
      orderBy: [{ completedAt: "asc" }],
      select: {
        completedAt: true
      }
    })
  );

  const completedLessons = completions.length;
  const totalXp = completedLessons * XP_PER_LESSON;
  const levelData = getLevelFromXp(totalXp);
  const streakData = calculateStreak(completions.map((entry) => entry.completedAt));

  await retryOnDatabaseFailure(() =>
    prisma.$transaction(async (tx) => {
      await tx.userXp.upsert({
        where: {
          userId
        },
        update: {
          totalXp,
          level: levelData.level,
          currentLevelXp: levelData.currentLevelXp,
          nextLevelXp: levelData.nextLevelXp
        },
        create: {
          userId,
          totalXp,
          level: levelData.level,
          currentLevelXp: levelData.currentLevelXp,
          nextLevelXp: levelData.nextLevelXp
        }
      });

      await tx.streak.upsert({
        where: {
          userId
        },
        update: {
          currentStreak: streakData.currentStreak,
          longestStreak: Math.max(streakData.currentStreak, streakData.longestStreak),
          lastActiveDate: streakData.lastActiveDate
        },
        create: {
          userId,
          currentStreak: streakData.currentStreak,
          longestStreak: streakData.longestStreak,
          lastActiveDate: streakData.lastActiveDate
        }
      });

      for (const badge of badgeDefinitions) {
        if (!badge.qualifies({ completedLessons, streak: streakData.currentStreak })) {
          continue;
        }

        await tx.badge.upsert({
          where: {
            userId_code: {
              userId,
              code: badge.code
            }
          },
          update: {},
          create: {
            userId,
            code: badge.code,
            title: badge.title,
            description: badge.description,
            icon: badge.icon
          }
        });
      }
    })
  );
}

export async function getGamificationSummary(userId: string) {
  return withDatabaseFallback(
    async () => {
      await syncGamificationForUser(userId);

      const [xp, streak, badges, completedLessons] = await Promise.all([
        retryOnDatabaseFailure(() =>
          prisma.userXp.findUnique({
            where: {
              userId
            }
          })
        ),
        retryOnDatabaseFailure(() =>
          prisma.streak.findUnique({
            where: {
              userId
            }
          })
        ),
        retryOnDatabaseFailure(() =>
          prisma.badge.findMany({
            where: {
              userId
            },
            orderBy: [{ earnedAt: "desc" }]
          })
        ),
        retryOnDatabaseFailure(() =>
          prisma.lessonCompletion.count({
            where: {
              userId,
              lesson: {
                status: PublicationStatus.PUBLISHED
              }
            }
          })
        )
      ]);

      return {
        totalXp: xp?.totalXp ?? 0,
        level: xp?.level ?? 1,
        levelTitle: getLevelTitle(xp?.level ?? 1),
        currentLevelXp: xp?.currentLevelXp ?? 0,
        nextLevelXp: xp?.nextLevelXp ?? 100,
        streak: streak?.currentStreak ?? 0,
        longestStreak: streak?.longestStreak ?? 0,
        completedLessons,
        badges
      };
    },
    () => {
      const demoCompletedLessons = demoEnrollments
        .filter((entry) => entry.userId === userId)
        .reduce((sum, entry) => {
          const lessonCount = demoLessons.filter((lesson) => lesson.courseId === entry.courseId).length;
          return sum + Math.round((entry.progress / 100) * lessonCount);
        }, 0);
      const totalXp = demoCompletedLessons * XP_PER_LESSON;
      const levelData = getLevelFromXp(totalXp);
      const streak = demoCompletedLessons > 0 ? 3 : 0;

      return {
        totalXp,
        level: levelData.level,
        levelTitle: getLevelTitle(levelData.level),
        currentLevelXp: levelData.currentLevelXp,
        nextLevelXp: levelData.nextLevelXp,
        streak,
        longestStreak: streak,
        completedLessons: demoCompletedLessons,
        badges: badgeDefinitions
          .filter((badge) => badge.qualifies({ completedLessons: demoCompletedLessons, streak }))
          .map((badge, index) => ({
            id: `demo-badge-${index}`,
            userId,
            code: badge.code,
            title: badge.title,
            description: badge.description,
            icon: badge.icon,
            earnedAt: new Date()
          }))
      };
    },
    { context: "gamification-summary" }
  );
}

export async function getCurrentUserGamificationSummary() {
  const currentUser = await getCurrentUser();

  if (!currentUser || currentUser.role !== UserRole.STUDENT) {
    return null;
  }

  return getGamificationSummary(currentUser.id);
}
