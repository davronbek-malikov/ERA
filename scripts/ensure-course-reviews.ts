import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const reviewBlueprints = [
  {
    userEmail: "mina@eraacademy.com",
    courseSlug: "deep-learning-fundamentals",
    rating: 5,
    comment: "Clear explanations and a strong beginner-friendly flow."
  },
  {
    userEmail: "daniel@eraacademy.com",
    courseSlug: "deep-learning-fundamentals",
    rating: 4,
    comment: "Well structured and easy to continue lesson by lesson."
  },
  {
    userEmail: "mina@eraacademy.com",
    courseSlug: "ai-tools-for-productivity",
    rating: 5,
    comment: "The workflow examples feel practical right away."
  },
  {
    userEmail: "daniel@eraacademy.com",
    courseSlug: "exam-strategy-blueprint",
    rating: 4,
    comment: "Helpful pacing advice and calm strategy guidance."
  }
] as const;

async function main() {
  for (const blueprint of reviewBlueprints) {
    const user = await prisma.user.findUnique({
      where: {
        email: blueprint.userEmail
      },
      select: {
        id: true
      }
    });

    const course = await prisma.course.findUnique({
      where: {
        slug: blueprint.courseSlug
      },
      select: {
        id: true
      }
    });

    if (!user || !course) {
      continue;
    }

    await prisma.courseReview.upsert({
      where: {
        userId_courseId: {
          userId: user.id,
          courseId: course.id
        }
      },
      update: {
        rating: blueprint.rating,
        comment: blueprint.comment
      },
      create: {
        userId: user.id,
        courseId: course.id,
        rating: blueprint.rating,
        comment: blueprint.comment
      }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
