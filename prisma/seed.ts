import {
  ActivityType,
  CourseDifficulty,
  LearningGoal,
  OnboardingStage,
  Prisma,
  PrismaClient,
  PublicationStatus,
  TimeAvailability,
  UserRole
} from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

function buildLessonContent(title: string, description: string | null, courseTitle: string) {
  const summary = description ?? `${title} is part of the ${courseTitle} learning path.`;

  return {
    overview: `${title} helps students understand the main idea before moving into practice.`,
    content: [
      `Lesson: ${title}`,
      `Course: ${courseTitle}`,
      "",
      "What this lesson covers:",
      summary,
      "",
      "Step-by-step guide:",
      `1. Start with the core concept behind ${title.toLowerCase()}.`,
      "2. Break the idea into smaller parts and connect it to a simple real-world example.",
      "3. Review one short practice task before moving to the next lesson.",
      "",
      "Example:",
      `Imagine explaining ${title.toLowerCase()} to a classmate in one minute. Focus on the goal, the process, and one practical use case.`,
      "",
      "Code example:",
      "```python",
      "def explain(topic: str) -> str:",
      '    return f"Learning {topic} works best when we move one step at a time."',
      "",
      `print(explain("${title}"))`,
      "```"
    ].join("\n"),
    learningObjectives: [
      `Understand the main concept in ${title}.`,
      "Follow a simple step-by-step explanation.",
      "Apply the idea to an example or short exercise."
    ],
    keyPoints: [
      summary,
      "Small steps improve clarity and reduce confusion.",
      "Examples make abstract ideas easier to remember."
    ]
  };
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function main() {
  const adminPasswordHash = await hash("EraAdmin2026!", 12);
  const studentPasswordHash = await hash("EraStudent2026!", 12);

  await prisma.activityLog.deleteMany();
  await prisma.courseReview.deleteMany();
  await prisma.practiceSubmission.deleteMany();
  await prisma.practiceExercise.deleteMany();
  await prisma.badge.deleteMany();
  await prisma.streak.deleteMany();
  await prisma.userXp.deleteMany();
  await prisma.userPathProgress.deleteMany();
  await prisma.pathCourse.deleteMany();
  await prisma.learningPath.deleteMany();
  await prisma.userOnboarding.deleteMany();
  await prisma.courseViewEvent.deleteMany();
  await prisma.chatMessage.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.lessonQuizQuestion.deleteMany();
  await prisma.lessonSubskill.deleteMany();
  await prisma.lessonContent.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.courseModule.deleteMany();
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
        homepagePriority: 9,
        viewCount: 1480,
        status: PublicationStatus.PUBLISHED,
        position: 1,
        publishedAt: daysAgo(40),
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
        homepagePriority: 7,
        viewCount: 1260,
        status: PublicationStatus.PUBLISHED,
        position: 2,
        publishedAt: daysAgo(12),
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
        homepagePriority: 8,
        viewCount: 980,
        status: PublicationStatus.PUBLISHED,
        position: 1,
        publishedAt: daysAgo(5),
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
        homepagePriority: 5,
        viewCount: 610,
        status: PublicationStatus.PUBLISHED,
        position: 1,
        publishedAt: daysAgo(22),
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
        homepagePriority: 4,
        viewCount: 430,
        status: PublicationStatus.PUBLISHED,
        position: 1,
        publishedAt: daysAgo(2),
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
        homepagePriority: 8,
        viewCount: 1185,
        status: PublicationStatus.PUBLISHED,
        position: 1,
        publishedAt: daysAgo(18),
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

  await prisma.courseReview.createMany({
    data: [
      {
        userId: studentUser.id,
        courseId: courses[0].id,
        rating: 5,
        comment: "Clear explanations and a strong beginner-friendly flow."
      },
      {
        userId: secondStudent.id,
        courseId: courses[0].id,
        rating: 4,
        comment: "Well structured and easy to continue lesson by lesson."
      },
      {
        userId: studentUser.id,
        courseId: courses[2].id,
        rating: 5,
        comment: "The workflow examples feel practical right away."
      },
      {
        userId: secondStudent.id,
        courseId: courses[5].id,
        rating: 4,
        comment: "Helpful pacing advice and calm strategy guidance."
      }
    ]
  });

  const learningPaths = await Promise.all([
    prisma.learningPath.create({
      data: {
        title: "AI Momentum Path",
        slug: "ai-momentum-path",
        description:
          "A structured AI roadmap that takes learners from foundations into stronger applied thinking and workflow habits.",
        subjectSlug: "ai",
        difficulty: CourseDifficulty.INTERMEDIATE,
        position: 1,
        courses: {
          create: [
            {
              courseId: courses[0].id,
              position: 1,
              stageLabel: "Begin"
            },
            {
              courseId: courses[2].id,
              position: 2,
              stageLabel: "Practice"
            },
            {
              courseId: courses[1].id,
              position: 3,
              stageLabel: "Apply"
            }
          ]
        }
      }
    }),
    prisma.learningPath.create({
      data: {
        title: "Academic Confidence Path",
        slug: "academic-confidence-path",
        description:
          "A cross-skill path for students who want stronger writing, cleaner reasoning, and more reliable exam execution.",
        difficulty: CourseDifficulty.INTERMEDIATE,
        position: 2,
        courses: {
          create: [
            {
              courseId: courses[4].id,
              position: 1,
              stageLabel: "Write"
            },
            {
              courseId: courses[3].id,
              position: 2,
              stageLabel: "Reason"
            },
            {
              courseId: courses[5].id,
              position: 3,
              stageLabel: "Perform"
            }
          ]
        }
      }
    })
  ]);

  await Promise.all([
    prisma.userPathProgress.create({
      data: {
        userId: studentUser.id,
        pathId: learningPaths[0].id,
        progressPercent: 30,
        completedCourseCount: 0,
        currentCourseId: courses[0].id,
        nextCourseId: courses[0].id,
        lastSyncedAt: new Date()
      }
    }),
    prisma.userPathProgress.create({
      data: {
        userId: secondStudent.id,
        pathId: learningPaths[1].id,
        progressPercent: 27,
        completedCourseCount: 0,
        currentCourseId: courses[5].id,
        nextCourseId: courses[5].id,
        lastSyncedAt: new Date()
      }
    })
  ]);

  await prisma.userOnboarding.create({
    data: {
      userId: studentUser.id,
      goal: LearningGoal.AI,
      level: CourseDifficulty.BEGINNER,
      recommendedLevel: CourseDifficulty.BEGINNER,
      timeAvailability: TimeAvailability.MODERATE,
      stage: OnboardingStage.COMPLETED,
      assessmentScore: 4,
      assessmentAnswers: {
        "ai-1": "a",
        "ai-2": "b",
        "ai-3": "a",
        "ai-4": "a",
        "ai-5": "b",
        "ai-6": "a"
      },
      recommendedSubjectSlug: "ai",
      recommendedCourseId: courses[0].id,
      personalizedPlan: [
        "Start with Deep Learning Fundamentals as your first guided course.",
        "Study at a beginner pace with about 270 minutes per week.",
        "Finish your first lesson, then use practice or tutor support to lock in the habit."
      ],
      checklistProfileCompleted: true,
      completedAt: new Date()
    }
  });

  await prisma.courseViewEvent.createMany({
    data: [
      ...Array.from({ length: 22 }, () => ({
        courseId: courses[0].id,
        createdAt: daysAgo(2)
      })),
      ...Array.from({ length: 14 }, () => ({
        courseId: courses[0].id,
        createdAt: daysAgo(10)
      })),
      ...Array.from({ length: 28 }, () => ({
        courseId: courses[1].id,
        createdAt: daysAgo(3)
      })),
      ...Array.from({ length: 10 }, () => ({
        courseId: courses[1].id,
        createdAt: daysAgo(11)
      })),
      ...Array.from({ length: 24 }, () => ({
        courseId: courses[2].id,
        createdAt: daysAgo(1)
      })),
      ...Array.from({ length: 8 }, () => ({
        courseId: courses[2].id,
        createdAt: daysAgo(9)
      })),
      ...Array.from({ length: 11 }, () => ({
        courseId: courses[3].id,
        createdAt: daysAgo(4)
      })),
      ...Array.from({ length: 9 }, () => ({
        courseId: courses[4].id,
        createdAt: daysAgo(1)
      })),
      ...Array.from({ length: 20 }, () => ({
        courseId: courses[5].id,
        createdAt: daysAgo(5)
      })),
      ...Array.from({ length: 12 }, () => ({
        courseId: courses[5].id,
        createdAt: daysAgo(13)
      }))
    ]
  });

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

  const lessons = await prisma.lesson.findMany({
    include: {
      course: {
        select: {
          title: true
        }
      }
    }
  });

  await prisma.lessonContent.createMany({
    data: lessons.map((lesson) => ({
      lessonId: lesson.id,
      ...buildLessonContent(lesson.title, lesson.description, lesson.course.title),
      practicePrompt: `Practice ${lesson.title.toLowerCase()} by writing one short explanation and one applied example.`,
      practiceChecklist: [
        "Summarize the core lesson idea in your own words.",
        "Write one simple example or use case.",
        "Check your answer against the lesson key points."
      ]
    }))
  });

  const modulePlans: Record<string, Array<{ title: string; slug: string; description: string; lessonSlugs: string[] }>> = {
    "deep-learning-fundamentals": [
      {
        title: "Foundations",
        slug: "foundations",
        description: "Start with the ideas behind deep learning and why they matter.",
        lessonSlugs: ["why-deep-learning-matters", "neurons-layers-and-representations"]
      },
      {
        title: "Model Training",
        slug: "model-training",
        description: "Learn how training works and what shapes better results.",
        lessonSlugs: ["training-and-optimization-basics"]
      }
    ],
    "applied-prompt-engineering": [
      {
        title: "Prompt Basics",
        slug: "prompt-basics",
        description: "Build strong prompting habits and feedback loops.",
        lessonSlugs: ["prompt-design-principles", "evaluation-loops"]
      }
    ],
    "ai-tools-for-productivity": [
      {
        title: "Workflow Systems",
        slug: "workflow-systems",
        description: "Use AI tools inside calm, repeatable workflows.",
        lessonSlugs: ["workflow-design-basics", "research-and-synthesis"]
      }
    ],
    "problem-solving-intensive": [
      {
        title: "Problem Framework",
        slug: "problem-framework",
        description: "Break difficult problems into a sequence you can manage.",
        lessonSlugs: ["problem-framing", "solution-patterns"]
      }
    ],
    "academic-writing-clarity": [
      {
        title: "Writing Structure",
        slug: "writing-structure",
        description: "Improve flow, clarity, and revision habits.",
        lessonSlugs: ["writing-with-structure", "clarity-through-revision"]
      }
    ],
    "exam-strategy-blueprint": [
      {
        title: "Exam Execution",
        slug: "exam-execution",
        description: "Build timing, planning, and performance discipline.",
        lessonSlugs: ["planning-the-exam-window", "timed-decision-making"]
      }
    ]
  };

  for (const course of courses) {
    const plans = modulePlans[course.slug] ?? [];

    for (const [index, plan] of plans.entries()) {
      const module = await prisma.courseModule.create({
        data: {
          courseId: course.id,
          title: plan.title,
          slug: plan.slug,
          description: plan.description,
          position: index + 1,
          status: PublicationStatus.PUBLISHED
        }
      });

      const courseLessons = await prisma.lesson.findMany({
        where: {
          courseId: course.id,
          slug: {
            in: plan.lessonSlugs
          }
        },
        orderBy: {
          position: "asc"
        }
      });

      for (const lesson of courseLessons) {
        await prisma.lesson.update({
          where: { id: lesson.id },
          data: {
            moduleId: module.id
          }
        });

        await prisma.lessonSubskill.createMany({
          data: [
            {
              lessonId: lesson.id,
              title: `${lesson.title} core idea`,
              description: "Understand the key concept before moving into practice.",
              position: 1
            },
            {
              lessonId: lesson.id,
              title: `${lesson.title} applied example`,
              description: "Connect the concept to one simple real-world example.",
              position: 2
            }
          ]
        });

        await prisma.lessonQuizQuestion.createMany({
          data: [
            {
              lessonId: lesson.id,
              prompt: `What is the best first goal in ${lesson.title}?`,
              options: [
                "Understand the main concept clearly",
                "Skip to advanced topics immediately",
                "Avoid examples and practice"
              ],
              correctOption: 0,
              explanation: "ERA lessons start by building clear understanding first.",
              position: 1
            },
            {
              lessonId: lesson.id,
              prompt: `What makes ${lesson.title} easier to remember?`,
              options: [
                "Using a practical example",
                "Reading the title only",
                "Skipping the explanation"
              ],
              correctOption: 0,
              explanation: "Practical application helps learners retain the idea.",
              position: 2
            }
          ]
        });
      }
    }
  }

  const exerciseBlueprints: Record<string, Array<{
    type: "CODING" | "MINI_PROJECT";
    title: string;
    slug: string;
    instructions: string;
    starterCode: string;
    solutionCode: string;
    hints: string[];
    solutionNotes: string;
    testCases: Array<{ input: unknown[]; expected: unknown; description: string }>;
    position: number;
  }>> = {
    "why-deep-learning-matters": [
      {
        type: "CODING",
        title: "Explain model value",
        slug: "explain-model-value",
        instructions:
          "Write a function named solve that receives a model name and returns the sentence `Model: <name> helps turn patterns into predictions.`",
        starterCode: [
          "function solve(modelName) {",
          "  // Return the expected sentence.",
          "}",
          "",
          "module.exports = solve;"
        ].join("\n"),
        solutionCode: [
          "function solve(modelName) {",
          "  return `Model: ${modelName} helps turn patterns into predictions.`;",
          "}",
          "",
          "module.exports = solve;"
        ].join("\n"),
        hints: [
          "Use a function named solve.",
          "Return a string instead of logging it.",
          "Template literals make it easier to place the model name in the sentence."
        ],
        solutionNotes: "Return the exact sentence format with the provided model name inserted in the middle.",
        testCases: [
          {
            input: ["Neural Net"],
            expected: "Model: Neural Net helps turn patterns into predictions.",
            description: "Builds the sentence for a basic model name."
          },
          {
            input: ["Vision Transformer"],
            expected: "Model: Vision Transformer helps turn patterns into predictions.",
            description: "Handles model names with spaces."
          }
        ],
        position: 1
      }
    ],
    "workflow-design-basics": [
      {
        type: "MINI_PROJECT",
        title: "Plan a calm workflow",
        slug: "plan-a-calm-workflow",
        instructions:
          "Build a function named solve that receives three workflow steps as strings and returns them joined with ` -> ` in the same order. This mini project helps learners organize a simple AI workflow clearly.",
        starterCode: [
          "function solve(stepOne, stepTwo, stepThree) {",
          "  // Join the steps in order.",
          "}",
          "",
          "module.exports = solve;"
        ].join("\n"),
        solutionCode: [
          "function solve(stepOne, stepTwo, stepThree) {",
          "  return [stepOne, stepTwo, stepThree].join(\" -> \");",
          "}",
          "",
          "module.exports = solve;"
        ].join("\n"),
        hints: [
          "Store the steps in an array first.",
          "Array join can combine items with a custom separator.",
          "Keep the original order unchanged."
        ],
        solutionNotes: "The project passes when the three steps are returned in order with ` -> ` between them.",
        testCases: [
          {
            input: ["Collect notes", "Summarize insights", "Draft output"],
            expected: "Collect notes -> Summarize insights -> Draft output",
            description: "Returns the expected workflow sequence."
          },
          {
            input: ["Research", "Review", "Ship"],
            expected: "Research -> Review -> Ship",
            description: "Handles short workflow labels too."
          }
        ],
        position: 1
      }
    ]
  };

  const seededLessons = await prisma.lesson.findMany({
    select: {
      id: true,
      slug: true
    }
  });

  for (const lesson of seededLessons) {
    const exercises = exerciseBlueprints[lesson.slug] ?? [];

    for (const exercise of exercises) {
      await prisma.practiceExercise.create({
        data: {
          lessonId: lesson.id,
          type: exercise.type,
          title: exercise.title,
          slug: exercise.slug,
          instructions: exercise.instructions,
          starterCode: exercise.starterCode,
          solutionCode: exercise.solutionCode,
          hints: exercise.hints,
          solutionNotes: exercise.solutionNotes,
          testCases: exercise.testCases as Prisma.InputJsonValue,
          position: exercise.position
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
