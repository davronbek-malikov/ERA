import {
  ActivityType,
  CourseDifficulty,
  PrismaClient,
  PublicationStatus,
  UserRole
} from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminPasswordHash = await hash("EraAdmin2026!", 12);
  const studentPasswordHash = await hash("EraStudent2026!", 12);

  await prisma.activityLog.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.course.deleteMany();
  await prisma.category.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.instructor.deleteMany();
  await prisma.user.deleteMany();

  const [adminUser, studentUser, secondStudent] = await Promise.all([
    prisma.user.create({
      data: {
        name: "ERA Admin",
        email: "admin@eraacademy.com",
        phone: "+821012345678",
        passwordHash: adminPasswordHash,
        role: UserRole.ADMIN,
        status: "ACTIVE"
      }
    }),
    prisma.user.create({
      data: {
        name: "Mina Park",
        email: "mina@eraacademy.com",
        phone: "+821012345679",
        passwordHash: studentPasswordHash,
        role: UserRole.STUDENT,
        status: "ACTIVE"
      }
    }),
    prisma.user.create({
      data: {
        name: "Daniel Kim",
        email: "daniel@eraacademy.com",
        phone: "+821012345680",
        passwordHash: studentPasswordHash,
        role: UserRole.STUDENT,
        status: "ACTIVE"
      }
    })
  ]);

  const [david, sara] = await Promise.all([
    prisma.instructor.create({
      data: {
        name: "David R.",
        slug: "david-r",
        title: "Lead AI Instructor",
        bio: "Builds structured, high-clarity courses across AI, mathematics, and academic performance.",
        email: "david@eraacademy.com",
        imageUrl:
          "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=80"
      }
    }),
    prisma.instructor.create({
      data: {
        name: "Sara Lee",
        slug: "sara-lee",
        title: "Learning Strategy Instructor",
        bio: "Focuses on exam systems, writing clarity, and student momentum.",
        email: "sara@eraacademy.com",
        imageUrl:
          "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=800&q=80"
      }
    })
  ]);

  const aiSubject = await prisma.subject.create({
    data: {
      name: "AI",
      slug: "ai",
      description: "Your flagship AI teaching library with structured pathways for modern learners.",
      status: PublicationStatus.PUBLISHED,
      position: 1,
      categories: {
        create: [
          {
            name: "Deep Learning",
            slug: "deep-learning",
            description: "Neural networks, model intuition, and practical implementation.",
            position: 1,
            status: PublicationStatus.PUBLISHED
          },
          {
            name: "AI Productivity",
            slug: "ai-productivity",
            description: "Workflows for research, synthesis, and execution.",
            position: 2,
            status: PublicationStatus.PUBLISHED
          }
        ]
      }
    },
    include: {
      categories: true
    }
  });

  const mathSubject = await prisma.subject.create({
    data: {
      name: "Mathematics",
      slug: "mathematics",
      description: "Concept-first learning paths for strong quantitative foundations.",
      status: PublicationStatus.PUBLISHED,
      position: 2,
      categories: {
        create: [
          {
            name: "Problem Solving",
            slug: "problem-solving",
            description: "Structured reasoning and exam-style practice.",
            position: 1,
            status: PublicationStatus.PUBLISHED
          }
        ]
      }
    },
    include: {
      categories: true
    }
  });

  const englishSubject = await prisma.subject.create({
    data: {
      name: "English",
      slug: "english",
      description: "Polished instruction for writing, reading, and fluency development.",
      status: PublicationStatus.PUBLISHED,
      position: 3,
      categories: {
        create: [
          {
            name: "Academic Writing",
            slug: "academic-writing",
            description: "Structure, clarity, and expression for academic contexts.",
            position: 1,
            status: PublicationStatus.PUBLISHED
          }
        ]
      }
    },
    include: {
      categories: true
    }
  });

  const examSubject = await prisma.subject.create({
    data: {
      name: "Exam Preparation",
      slug: "exam-preparation",
      description: "Outcome-focused preparation tracks for high-stakes assessments.",
      status: PublicationStatus.PUBLISHED,
      position: 4,
      categories: {
        create: [
          {
            name: "Strategy Sessions",
            slug: "strategy-sessions",
            description: "Planning, timing, and performance discipline.",
            position: 1,
            status: PublicationStatus.PUBLISHED
          }
        ]
      }
    },
    include: {
      categories: true
    }
  });

  const deepLearningCategory = aiSubject.categories.find((category) => category.slug === "deep-learning");
  const productivityCategory = aiSubject.categories.find((category) => category.slug === "ai-productivity");
  const problemSolvingCategory = mathSubject.categories[0];
  const writingCategory = englishSubject.categories[0];
  const strategyCategory = examSubject.categories[0];

  if (
    !deepLearningCategory ||
    !productivityCategory ||
    !problemSolvingCategory ||
    !writingCategory ||
    !strategyCategory
  ) {
    throw new Error("Seed categories were not created as expected.");
  }

  const courses = await Promise.all([
    prisma.course.create({
      data: {
        categoryId: deepLearningCategory.id,
        instructorId: david.id,
        title: "Deep Learning Fundamentals",
        subtitle: "From intuition to implementation",
        slug: "deep-learning-fundamentals",
        shortDescription: "A structured introduction to deep learning concepts and intuition.",
        description:
          "Build a rigorous mental model for neural networks, training dynamics, and real-world application patterns.",
        thumbnailUrl:
          "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=1200&q=80",
        promoVideoUrl: "https://example.com/videos/deep-learning-fundamentals-trailer",
        difficulty: CourseDifficulty.BEGINNER,
        outcomes: [
          "Understand the building blocks of neural networks.",
          "Interpret training behavior and core optimization patterns.",
          "Navigate a structured path from theory to application."
        ],
        isFeatured: true,
        isPopular: true,
        status: PublicationStatus.PUBLISHED,
        position: 1,
        lessons: {
          create: [
            {
              title: "Why Deep Learning Matters",
              slug: "why-deep-learning-matters",
              description: "A big-picture view of modern deep learning systems.",
              videoUrl: "https://example.com/videos/why-deep-learning-matters",
              duration: "18 min",
              position: 1
            },
            {
              title: "Neurons, Layers, and Representations",
              slug: "neurons-layers-and-representations",
              description: "Learn the conceptual building blocks of neural networks.",
              videoUrl: "https://example.com/videos/neurons-layers-and-representations",
              duration: "24 min",
              position: 2
            },
            {
              title: "Training and Optimization Basics",
              slug: "training-and-optimization-basics",
              description: "Loss functions, backpropagation, and practical intuition.",
              videoUrl: "https://example.com/videos/training-and-optimization-basics",
              duration: "28 min",
              position: 3
            }
          ]
        }
      }
    }),
    prisma.course.create({
      data: {
        categoryId: deepLearningCategory.id,
        instructorId: david.id,
        title: "Applied Prompt Engineering",
        subtitle: "Practical systems for better AI outputs",
        slug: "applied-prompt-engineering",
        shortDescription: "Practical prompt design for repeatable learning and workflow outcomes.",
        description:
          "Move beyond ad hoc prompting into structured frameworks for iteration, evaluation, and classroom-ready usage.",
        thumbnailUrl:
          "https://images.unsplash.com/photo-1686191128892-3b4c72779a65?auto=format&fit=crop&w=1200&q=80",
        promoVideoUrl: "https://example.com/videos/applied-prompt-engineering-trailer",
        difficulty: CourseDifficulty.INTERMEDIATE,
        outcomes: [
          "Design prompts with clearer intent and constraints.",
          "Evaluate prompt quality through structured iteration.",
          "Apply prompting patterns to research and teaching workflows."
        ],
        isPopular: true,
        status: PublicationStatus.PUBLISHED,
        position: 2,
        lessons: {
          create: [
            {
              title: "Prompt Design Principles",
              slug: "prompt-design-principles",
              description: "Structure, clarity, and role framing.",
              videoUrl: "https://example.com/videos/prompt-design-principles",
              duration: "20 min",
              position: 1
            },
            {
              title: "Evaluation Loops",
              slug: "evaluation-loops",
              description: "How to test and improve prompt outputs.",
              videoUrl: "https://example.com/videos/evaluation-loops",
              duration: "22 min",
              position: 2
            }
          ]
        }
      }
    }),
    prisma.course.create({
      data: {
        categoryId: productivityCategory.id,
        instructorId: david.id,
        title: "AI Tools for Productivity",
        subtitle: "Structured workflows for modern work",
        slug: "ai-tools-for-productivity",
        shortDescription: "Thoughtful workflows for getting more done with less friction.",
        description:
          "Use AI tools in a disciplined way to improve planning, writing, research, and execution quality.",
        thumbnailUrl:
          "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80",
        promoVideoUrl: "https://example.com/videos/ai-tools-for-productivity-trailer",
        difficulty: CourseDifficulty.BEGINNER,
        outcomes: [
          "Create repeatable AI-assisted workflows.",
          "Improve research and note synthesis quality.",
          "Avoid chaotic tool usage with structured systems."
        ],
        isFeatured: true,
        status: PublicationStatus.PUBLISHED,
        position: 1,
        lessons: {
          create: [
            {
              title: "Workflow Design Basics",
              slug: "workflow-design-basics",
              description: "Build calm, reliable productivity systems.",
              videoUrl: "https://example.com/videos/workflow-design-basics",
              duration: "17 min",
              position: 1
            },
            {
              title: "Research and Synthesis",
              slug: "research-and-synthesis",
              description: "Collect, refine, and summarize information effectively.",
              videoUrl: "https://example.com/videos/research-and-synthesis",
              duration: "19 min",
              position: 2
            }
          ]
        }
      }
    }),
    prisma.course.create({
      data: {
        categoryId: problemSolvingCategory.id,
        instructorId: david.id,
        title: "Problem Solving Intensive",
        subtitle: "A repeatable framework for hard questions",
        slug: "problem-solving-intensive",
        shortDescription: "A modular framework for turning difficult questions into repeatable steps.",
        description:
          "Learn how to deconstruct questions, identify patterns, and improve solution quality under time pressure.",
        thumbnailUrl:
          "https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&w=1200&q=80",
        promoVideoUrl: "https://example.com/videos/problem-solving-intensive-trailer",
        difficulty: CourseDifficulty.INTERMEDIATE,
        outcomes: [
          "Approach complex questions with structure.",
          "Improve accuracy under timed conditions.",
          "Build repeatable problem-solving habits."
        ],
        status: PublicationStatus.PUBLISHED,
        position: 1,
        lessons: {
          create: [
            {
              title: "Problem Framing",
              slug: "problem-framing",
              description: "How to decode what a problem is really asking.",
              videoUrl: "https://example.com/videos/problem-framing",
              duration: "21 min",
              position: 1
            },
            {
              title: "Solution Patterns",
              slug: "solution-patterns",
              description: "Recognize and apply reusable strategies.",
              videoUrl: "https://example.com/videos/solution-patterns",
              duration: "26 min",
              position: 2
            }
          ]
        }
      }
    }),
    prisma.course.create({
      data: {
        categoryId: writingCategory.id,
        instructorId: sara.id,
        title: "Academic Writing Clarity",
        subtitle: "Write with precision and elegance",
        slug: "academic-writing-clarity",
        shortDescription: "A calm, premium writing path focused on precision and elegance.",
        description:
          "Refine sentence flow, paragraph structure, and argument clarity through a guided writing system.",
        thumbnailUrl:
          "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1200&q=80",
        promoVideoUrl: "https://example.com/videos/academic-writing-clarity-trailer",
        difficulty: CourseDifficulty.BEGINNER,
        outcomes: [
          "Write with stronger structure and flow.",
          "Improve clarity in arguments and explanations.",
          "Develop editing habits that elevate academic work."
        ],
        status: PublicationStatus.PUBLISHED,
        position: 1,
        lessons: {
          create: [
            {
              title: "Writing with Structure",
              slug: "writing-with-structure",
              description: "Paragraph control and logical sequencing.",
              videoUrl: "https://example.com/videos/writing-with-structure",
              duration: "16 min",
              position: 1
            },
            {
              title: "Clarity Through Revision",
              slug: "clarity-through-revision",
              description: "Editing for precision and elegance.",
              videoUrl: "https://example.com/videos/clarity-through-revision",
              duration: "18 min",
              position: 2
            }
          ]
        }
      }
    }),
    prisma.course.create({
      data: {
        categoryId: strategyCategory.id,
        instructorId: sara.id,
        title: "Exam Strategy Blueprint",
        subtitle: "Pacing, revision, and confidence systems",
        slug: "exam-strategy-blueprint",
        shortDescription: "A practical framework for pacing, revision, and confidence under pressure.",
        description:
          "Build a reliable exam routine that improves timing, reduces decision fatigue, and strengthens performance consistency.",
        thumbnailUrl:
          "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=1200&q=80",
        promoVideoUrl: "https://example.com/videos/exam-strategy-blueprint-trailer",
        difficulty: CourseDifficulty.BEGINNER,
        outcomes: [
          "Create a repeatable exam strategy.",
          "Manage time and energy more effectively.",
          "Approach assessments with stronger confidence."
        ],
        isPopular: true,
        status: PublicationStatus.PUBLISHED,
        position: 1,
        lessons: {
          create: [
            {
              title: "Planning the Exam Window",
              slug: "planning-the-exam-window",
              description: "Prepare before the exam instead of reacting during it.",
              videoUrl: "https://example.com/videos/planning-the-exam-window",
              duration: "14 min",
              position: 1
            },
            {
              title: "Timed Decision Making",
              slug: "timed-decision-making",
              description: "Improve pacing and question selection.",
              videoUrl: "https://example.com/videos/timed-decision-making",
              duration: "16 min",
              position: 2
            }
          ]
        }
      }
    })
  ]);

  await Promise.all([
    prisma.enrollment.create({
      data: {
        userId: studentUser.id,
        courseId: courses[0].id,
        progress: 62
      }
    }),
    prisma.enrollment.create({
      data: {
        userId: studentUser.id,
        courseId: courses[2].id,
        progress: 28
      }
    }),
    prisma.enrollment.create({
      data: {
        userId: secondStudent.id,
        courseId: courses[5].id,
        progress: 80
      }
    })
  ]);

  await prisma.activityLog.createMany({
    data: [
      {
        type: ActivityType.COURSE_CREATED,
        message: "Deep Learning Fundamentals was published.",
        userId: adminUser.id
      },
      {
        type: ActivityType.LESSON_CREATED,
        message: "Added a new lesson to Applied Prompt Engineering.",
        userId: adminUser.id
      },
      {
        type: ActivityType.ENROLLMENT_CREATED,
        message: "Mina Park enrolled in AI Tools for Productivity.",
        userId: adminUser.id
      },
      {
        type: ActivityType.USER_CREATED,
        message: "Created student account for Daniel Kim.",
        userId: adminUser.id
      }
    ]
  });
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
