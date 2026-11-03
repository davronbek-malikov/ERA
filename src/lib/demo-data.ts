import { ActivityType, CourseDifficulty, PublicationStatus, UserRole } from "@prisma/client";

const now = new Date("2026-03-17T12:00:00.000Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

export const demoUsers = [
  {
    id: "user-admin",
    name: "ERA Admin",
    email: "admin@eraacademy.com",
    phone: "+821012345678",
    passwordHash: null,
    image: null,
    role: UserRole.ADMIN,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "user-mina",
    name: "Mina Park",
    email: "mina@eraacademy.com",
    phone: "+821012345679",
    passwordHash: null,
    image: null,
    role: UserRole.STUDENT,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "user-daniel",
    name: "Daniel Kim",
    email: "daniel@eraacademy.com",
    phone: "+821012345680",
    passwordHash: null,
    image: null,
    role: UserRole.STUDENT,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now
  }
];

export const demoInstructors = [
  {
    id: "inst-david",
    userId: null,
    name: "David R.",
    slug: "david-r",
    title: "Lead AI Instructor",
    bio: "Builds structured, high-clarity courses across AI, mathematics, and academic performance.",
    imageUrl:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=80",
    email: "david@eraacademy.com",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "inst-sara",
    userId: null,
    name: "Sara Lee",
    slug: "sara-lee",
    title: "Learning Strategy Instructor",
    bio: "Focuses on exam systems, writing clarity, and student momentum.",
    imageUrl:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=800&q=80",
    email: "sara@eraacademy.com",
    createdAt: now,
    updatedAt: now
  }
];

export const demoSubjects = [
  {
    id: "subject-ai",
    name: "AI",
    slug: "ai",
    description: "Your flagship AI teaching library with structured pathways for modern learners.",
    thumbnailUrl: null,
    status: PublicationStatus.PUBLISHED,
    position: 1,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "subject-math",
    name: "Mathematics",
    slug: "mathematics",
    description: "Concept-first learning paths for strong quantitative foundations.",
    thumbnailUrl: null,
    status: PublicationStatus.PUBLISHED,
    position: 2,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "subject-english",
    name: "English",
    slug: "english",
    description: "Polished instruction for writing, reading, and fluency development.",
    thumbnailUrl: null,
    status: PublicationStatus.PUBLISHED,
    position: 3,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "subject-exam",
    name: "Exam Preparation",
    slug: "exam-preparation",
    description: "Outcome-focused preparation tracks for high-stakes assessments.",
    thumbnailUrl: null,
    status: PublicationStatus.PUBLISHED,
    position: 4,
    createdAt: now,
    updatedAt: now
  }
];

export const demoCategories = [
  {
    id: "cat-deep-learning",
    subjectId: "subject-ai",
    name: "Deep Learning",
    slug: "deep-learning",
    description: "Neural networks, model intuition, and practical implementation.",
    status: PublicationStatus.PUBLISHED,
    position: 1,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "cat-ai-productivity",
    subjectId: "subject-ai",
    name: "AI Productivity",
    slug: "ai-productivity",
    description: "Workflows for research, synthesis, and execution.",
    status: PublicationStatus.PUBLISHED,
    position: 2,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "cat-problem-solving",
    subjectId: "subject-math",
    name: "Problem Solving",
    slug: "problem-solving",
    description: "Structured reasoning and exam-style practice.",
    status: PublicationStatus.PUBLISHED,
    position: 1,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "cat-academic-writing",
    subjectId: "subject-english",
    name: "Academic Writing",
    slug: "academic-writing",
    description: "Structure, clarity, and expression for academic contexts.",
    status: PublicationStatus.PUBLISHED,
    position: 1,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "cat-strategy-sessions",
    subjectId: "subject-exam",
    name: "Strategy Sessions",
    slug: "strategy-sessions",
    description: "Planning, timing, and performance discipline.",
    status: PublicationStatus.PUBLISHED,
    position: 1,
    createdAt: now,
    updatedAt: now
  }
];

export const demoCourses = [
  {
    id: "course-deep-learning",
    categoryId: "cat-deep-learning",
    instructorId: "inst-david",
    title: "Deep Learning Fundamentals",
    subtitle: "From intuition to implementation",
    slug: "deep-learning-fundamentals",
    shortDescription: "A structured introduction to deep learning concepts and intuition.",
    description:
      "Build a rigorous mental model for neural networks, training dynamics, and real-world application patterns.",
    thumbnailUrl:
      "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=1200&q=80",
    promoVideoUrl: null,
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
    createdAt: now,
    updatedAt: now
  },
  {
    id: "course-prompt-engineering",
    categoryId: "cat-deep-learning",
    instructorId: "inst-david",
    title: "Applied Prompt Engineering",
    subtitle: "Practical systems for better AI outputs",
    slug: "applied-prompt-engineering",
    shortDescription: "Practical prompt design for repeatable learning and workflow outcomes.",
    description:
      "Move beyond ad hoc prompting into structured frameworks for iteration, evaluation, and classroom-ready usage.",
    thumbnailUrl:
      "https://images.unsplash.com/photo-1686191128892-3b4c72779a65?auto=format&fit=crop&w=1200&q=80",
    promoVideoUrl: null,
    difficulty: CourseDifficulty.INTERMEDIATE,
    outcomes: [
      "Design prompts with clearer intent and constraints.",
      "Evaluate prompt quality through structured iteration.",
      "Apply prompting patterns to research and teaching workflows."
    ],
    isFeatured: false,
    isPopular: true,
    homepagePriority: 7,
    viewCount: 1260,
    status: PublicationStatus.PUBLISHED,
    position: 2,
    publishedAt: daysAgo(12),
    createdAt: now,
    updatedAt: now
  },
  {
    id: "course-ai-productivity",
    categoryId: "cat-ai-productivity",
    instructorId: "inst-david",
    title: "AI Tools for Productivity",
    subtitle: "Structured workflows for modern work",
    slug: "ai-tools-for-productivity",
    shortDescription: "Thoughtful workflows for getting more done with less friction.",
    description:
      "Use AI tools in a disciplined way to improve planning, writing, research, and execution quality.",
    thumbnailUrl:
      "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80",
    promoVideoUrl: null,
    difficulty: CourseDifficulty.BEGINNER,
    outcomes: [
      "Create repeatable AI-assisted workflows.",
      "Improve research and note synthesis quality.",
      "Avoid chaotic tool usage with structured systems."
    ],
    isFeatured: true,
    isPopular: false,
    homepagePriority: 8,
    viewCount: 980,
    status: PublicationStatus.PUBLISHED,
    position: 1,
    publishedAt: daysAgo(5),
    createdAt: now,
    updatedAt: now
  },
  {
    id: "course-problem-solving",
    categoryId: "cat-problem-solving",
    instructorId: "inst-david",
    title: "Problem Solving Intensive",
    subtitle: "A repeatable framework for hard questions",
    slug: "problem-solving-intensive",
    shortDescription: "A modular framework for turning difficult questions into repeatable steps.",
    description:
      "Learn how to deconstruct questions, identify patterns, and improve solution quality under time pressure.",
    thumbnailUrl:
      "https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&w=1200&q=80",
    promoVideoUrl: null,
    difficulty: CourseDifficulty.INTERMEDIATE,
    outcomes: [
      "Approach complex questions with structure.",
      "Improve accuracy under timed conditions.",
      "Build repeatable problem-solving habits."
    ],
    isFeatured: false,
    isPopular: false,
    homepagePriority: 5,
    viewCount: 610,
    status: PublicationStatus.PUBLISHED,
    position: 1,
    publishedAt: daysAgo(22),
    createdAt: now,
    updatedAt: now
  },
  {
    id: "course-writing",
    categoryId: "cat-academic-writing",
    instructorId: "inst-sara",
    title: "Academic Writing Clarity",
    subtitle: "Write with precision and elegance",
    slug: "academic-writing-clarity",
    shortDescription: "A calm, premium writing path focused on precision and elegance.",
    description:
      "Refine sentence flow, paragraph structure, and argument clarity through a guided writing system.",
    thumbnailUrl:
      "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1200&q=80",
    promoVideoUrl: null,
    difficulty: CourseDifficulty.BEGINNER,
    outcomes: [
      "Write with stronger structure and flow.",
      "Improve clarity in arguments and explanations.",
      "Develop editing habits that elevate academic work."
    ],
    isFeatured: false,
    isPopular: false,
    homepagePriority: 4,
    viewCount: 430,
    status: PublicationStatus.PUBLISHED,
    position: 1,
    publishedAt: daysAgo(2),
    createdAt: now,
    updatedAt: now
  },
  {
    id: "course-exam-strategy",
    categoryId: "cat-strategy-sessions",
    instructorId: "inst-sara",
    title: "Exam Strategy Blueprint",
    subtitle: "Pacing, revision, and confidence systems",
    slug: "exam-strategy-blueprint",
    shortDescription: "A practical framework for pacing, revision, and confidence under pressure.",
    description:
      "Build a reliable exam routine that improves timing, reduces decision fatigue, and strengthens performance consistency.",
    thumbnailUrl:
      "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=1200&q=80",
    promoVideoUrl: null,
    difficulty: CourseDifficulty.BEGINNER,
    outcomes: [
      "Create a repeatable exam strategy.",
      "Manage time and energy more effectively.",
      "Approach assessments with stronger confidence."
    ],
    isFeatured: true,
    isPopular: true,
    homepagePriority: 8,
    viewCount: 1185,
    status: PublicationStatus.PUBLISHED,
    position: 1,
    publishedAt: daysAgo(18),
    createdAt: now,
    updatedAt: now
  }
];

export const demoLessons = [
  {
    id: "lesson-deep-1",
    courseId: "course-deep-learning",
    title: "Why Deep Learning Matters",
    slug: "why-deep-learning-matters",
    description: "A big-picture view of modern deep learning systems.",
    videoUrl: null,
    duration: "18 min",
    position: 1,
    status: PublicationStatus.PUBLISHED,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "lesson-deep-2",
    courseId: "course-deep-learning",
    title: "Neurons, Layers, and Representations",
    slug: "neurons-layers-and-representations",
    description: "Learn the conceptual building blocks of neural networks.",
    videoUrl: null,
    duration: "24 min",
    position: 2,
    status: PublicationStatus.PUBLISHED,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "lesson-deep-3",
    courseId: "course-deep-learning",
    title: "Training and Optimization Basics",
    slug: "training-and-optimization-basics",
    description: "Loss functions, backpropagation, and practical intuition.",
    videoUrl: null,
    duration: "28 min",
    position: 3,
    status: PublicationStatus.PUBLISHED,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "lesson-prompt-1",
    courseId: "course-prompt-engineering",
    title: "Prompt Design Principles",
    slug: "prompt-design-principles",
    description: "Structure, clarity, and role framing.",
    videoUrl: null,
    duration: "20 min",
    position: 1,
    status: PublicationStatus.PUBLISHED,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "lesson-prompt-2",
    courseId: "course-prompt-engineering",
    title: "Evaluation Loops",
    slug: "evaluation-loops",
    description: "How to test and improve prompt outputs.",
    videoUrl: null,
    duration: "22 min",
    position: 2,
    status: PublicationStatus.PUBLISHED,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "lesson-productivity-1",
    courseId: "course-ai-productivity",
    title: "Workflow Design Basics",
    slug: "workflow-design-basics",
    description: "Build calm, reliable productivity systems.",
    videoUrl: null,
    duration: "17 min",
    position: 1,
    status: PublicationStatus.PUBLISHED,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "lesson-productivity-2",
    courseId: "course-ai-productivity",
    title: "Research and Synthesis",
    slug: "research-and-synthesis",
    description: "Collect, refine, and summarize information effectively.",
    videoUrl: null,
    duration: "19 min",
    position: 2,
    status: PublicationStatus.PUBLISHED,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "lesson-problem-1",
    courseId: "course-problem-solving",
    title: "Problem Framing",
    slug: "problem-framing",
    description: "How to decode what a problem is really asking.",
    videoUrl: null,
    duration: "21 min",
    position: 1,
    status: PublicationStatus.PUBLISHED,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "lesson-writing-1",
    courseId: "course-writing",
    title: "Writing with Structure",
    slug: "writing-with-structure",
    description: "Paragraph control and logical sequencing.",
    videoUrl: null,
    duration: "16 min",
    position: 1,
    status: PublicationStatus.PUBLISHED,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "lesson-exam-1",
    courseId: "course-exam-strategy",
    title: "Planning the Exam Window",
    slug: "planning-the-exam-window",
    description: "Prepare before the exam instead of reacting during it.",
    videoUrl: null,
    duration: "14 min",
    position: 1,
    status: PublicationStatus.PUBLISHED,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "lesson-exam-2",
    courseId: "course-exam-strategy",
    title: "Timed Decision Making",
    slug: "timed-decision-making",
    description: "Improve pacing and question selection.",
    videoUrl: null,
    duration: "16 min",
    position: 2,
    status: PublicationStatus.PUBLISHED,
    createdAt: now,
    updatedAt: now
  }
];

export const demoEnrollments = [
  { id: "enroll-1", userId: "user-mina", courseId: "course-deep-learning", progress: 62, createdAt: now, updatedAt: now },
  { id: "enroll-2", userId: "user-mina", courseId: "course-ai-productivity", progress: 28, createdAt: now, updatedAt: now },
  { id: "enroll-3", userId: "user-daniel", courseId: "course-exam-strategy", progress: 80, createdAt: now, updatedAt: now }
];

export const demoCourseReviews = [
  {
    id: "review-1",
    userId: "user-mina",
    courseId: "course-deep-learning",
    rating: 5,
    comment: "Clear explanations and a strong beginner-friendly flow.",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "review-2",
    userId: "user-daniel",
    courseId: "course-deep-learning",
    rating: 4,
    comment: "Well structured and easy to continue lesson by lesson.",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "review-3",
    userId: "user-mina",
    courseId: "course-ai-productivity",
    rating: 5,
    comment: "The workflow examples feel practical right away.",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "review-4",
    userId: "user-daniel",
    courseId: "course-exam-strategy",
    rating: 4,
    comment: "Helpful pacing advice and calm strategy guidance.",
    createdAt: now,
    updatedAt: now
  }
];

export const demoActivityLog = [
  {
    id: "act-1",
    type: ActivityType.COURSE_CREATED,
    message: "Deep Learning Fundamentals was published.",
    userId: "user-admin",
    context: null,
    createdAt: now
  },
  {
    id: "act-2",
    type: ActivityType.LESSON_CREATED,
    message: "Added a new lesson to Applied Prompt Engineering.",
    userId: "user-admin",
    context: null,
    createdAt: now
  },
  {
    id: "act-3",
    type: ActivityType.ENROLLMENT_CREATED,
    message: "Mina Park enrolled in AI Tools for Productivity.",
    userId: "user-admin",
    context: null,
    createdAt: now
  },
  {
    id: "act-4",
    type: ActivityType.USER_CREATED,
    message: "Created student account for Daniel Kim.",
    userId: "user-admin",
    context: null,
    createdAt: now
  }
];
