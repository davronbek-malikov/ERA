import { CourseDifficulty, PublicationStatus, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const pathBlueprints = [
  {
    title: "AI Momentum Path",
    slug: "ai-momentum-path",
    description:
      "A structured AI roadmap that takes learners from foundations into stronger applied thinking and workflow habits.",
    subjectSlug: "ai",
    difficulty: CourseDifficulty.INTERMEDIATE,
    position: 1,
    steps: [
      { courseSlug: "deep-learning-fundamentals", position: 1, stageLabel: "Begin" },
      { courseSlug: "ai-tools-for-productivity", position: 2, stageLabel: "Practice" },
      { courseSlug: "applied-prompt-engineering", position: 3, stageLabel: "Apply" }
    ]
  },
  {
    title: "Academic Confidence Path",
    slug: "academic-confidence-path",
    description:
      "A cross-skill path for stronger writing, cleaner reasoning, and more reliable exam execution.",
    subjectSlug: null,
    difficulty: CourseDifficulty.INTERMEDIATE,
    position: 2,
    steps: [
      { courseSlug: "academic-writing-clarity", position: 1, stageLabel: "Write" },
      { courseSlug: "problem-solving-intensive", position: 2, stageLabel: "Reason" },
      { courseSlug: "exam-strategy-blueprint", position: 3, stageLabel: "Perform" }
    ]
  }
] as const;

async function main() {
  for (const blueprint of pathBlueprints) {
    const path = await prisma.learningPath.upsert({
      where: {
        slug: blueprint.slug
      },
      update: {
        title: blueprint.title,
        description: blueprint.description,
        subjectSlug: blueprint.subjectSlug,
        difficulty: blueprint.difficulty,
        status: PublicationStatus.PUBLISHED,
        position: blueprint.position
      },
      create: {
        title: blueprint.title,
        slug: blueprint.slug,
        description: blueprint.description,
        subjectSlug: blueprint.subjectSlug,
        difficulty: blueprint.difficulty,
        status: PublicationStatus.PUBLISHED,
        position: blueprint.position
      }
    });

    const existingPathCourses = await prisma.pathCourse.findMany({
      where: {
        pathId: path.id
      },
      select: {
        id: true,
        course: {
          select: {
            slug: true
          }
        }
      }
    });

    const desiredCourseSlugs = new Set<string>(blueprint.steps.map((step) => step.courseSlug));
    const staleIds = existingPathCourses
      .filter((entry) => !desiredCourseSlugs.has(entry.course.slug))
      .map((entry) => entry.id);

    if (staleIds.length > 0) {
      await prisma.pathCourse.deleteMany({
        where: {
          id: {
            in: staleIds
          }
        }
      });
    }

    for (const step of blueprint.steps) {
      const course = await prisma.course.findUnique({
        where: {
          slug: step.courseSlug
        },
        select: {
          id: true
        }
      });

      if (!course) {
        console.warn(`Skipping missing course slug: ${step.courseSlug}`);
        continue;
      }

      await prisma.pathCourse.upsert({
        where: {
          pathId_courseId: {
            pathId: path.id,
            courseId: course.id
          }
        },
        update: {
          position: step.position,
          stageLabel: step.stageLabel
        },
        create: {
          pathId: path.id,
          courseId: course.id,
          position: step.position,
          stageLabel: step.stageLabel
        }
      });
    }
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
