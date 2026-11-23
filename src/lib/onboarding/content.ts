import { CourseDifficulty, LearningGoal, TimeAvailability } from "@prisma/client";

export type OnboardingQuestionOption = {
  id: string;
  label: string;
  correct: boolean;
};

export type OnboardingQuestion = {
  id: string;
  prompt: string;
  options: OnboardingQuestionOption[];
};

export const onboardingGoalOptions: Array<{
  value: LearningGoal;
  label: string;
  subjectSlug: string;
}> = [
  { value: LearningGoal.AI, label: "AI", subjectSlug: "ai" },
  { value: LearningGoal.MATHEMATICS, label: "Math", subjectSlug: "mathematics" },
  { value: LearningGoal.ENGLISH, label: "English", subjectSlug: "english" },
  { value: LearningGoal.EXAM_PREPARATION, label: "Exam Prep", subjectSlug: "exam-preparation" }
];

export const onboardingLevelOptions: Array<{
  value: CourseDifficulty;
  label: string;
}> = [
  { value: CourseDifficulty.BEGINNER, label: "Beginner" },
  { value: CourseDifficulty.INTERMEDIATE, label: "Intermediate" },
  { value: CourseDifficulty.ADVANCED, label: "Advanced" }
];

export const onboardingTimeOptions: Array<{
  value: TimeAvailability;
  label: string;
  description: string;
  weeklyMinutes: number;
}> = [
  {
    value: TimeAvailability.LIGHT,
    label: "2 to 3 hours / week",
    description: "A calm start for busy learners.",
    weeklyMinutes: 150
  },
  {
    value: TimeAvailability.MODERATE,
    label: "4 to 5 hours / week",
    description: "A balanced pace with room to practice.",
    weeklyMinutes: 270
  },
  {
    value: TimeAvailability.FOCUSED,
    label: "6 to 8 hours / week",
    description: "A stronger pace for steady momentum.",
    weeklyMinutes: 420
  },
  {
    value: TimeAvailability.INTENSIVE,
    label: "9+ hours / week",
    description: "An intensive plan for serious growth.",
    weeklyMinutes: 600
  }
];

export const onboardingAssessmentBank: Record<LearningGoal, OnboardingQuestion[]> = {
  [LearningGoal.AI]: [
    {
      id: "ai-1",
      prompt: "What helps an AI prompt give better results?",
      options: [
        { id: "a", label: "Clear instructions and context", correct: true },
        { id: "b", label: "Using random words", correct: false },
        { id: "c", label: "Making it as short as possible every time", correct: false }
      ]
    },
    {
      id: "ai-2",
      prompt: "What is a dataset?",
      options: [
        { id: "a", label: "A computer screen layout", correct: false },
        { id: "b", label: "A collection of examples or records", correct: true },
        { id: "c", label: "A single model prediction", correct: false }
      ]
    },
    {
      id: "ai-3",
      prompt: "Why do we test a model after training?",
      options: [
        { id: "a", label: "To see how it performs on unseen data", correct: true },
        { id: "b", label: "To make the code look longer", correct: false },
        { id: "c", label: "To avoid using data at all", correct: false }
      ]
    },
    {
      id: "ai-4",
      prompt: "What is a good first step before building an AI workflow?",
      options: [
        { id: "a", label: "Define the task and desired outcome", correct: true },
        { id: "b", label: "Choose the fanciest tool immediately", correct: false },
        { id: "c", label: "Skip planning and test later", correct: false }
      ]
    },
    {
      id: "ai-5",
      prompt: "What does iteration mean in AI work?",
      options: [
        { id: "a", label: "Improving step by step", correct: true },
        { id: "b", label: "Starting over every time", correct: false },
        { id: "c", label: "Avoiding feedback", correct: false }
      ]
    },
    {
      id: "ai-6",
      prompt: "Which habit usually improves prompt quality most?",
      options: [
        { id: "a", label: "Refining based on output quality", correct: true },
        { id: "b", label: "Never checking the result", correct: false },
        { id: "c", label: "Using only one prompt forever", correct: false }
      ]
    }
  ],
  [LearningGoal.MATHEMATICS]: [
    {
      id: "math-1",
      prompt: "What should you do first when solving a word problem?",
      options: [
        { id: "a", label: "Understand what the question is asking", correct: true },
        { id: "b", label: "Guess the answer quickly", correct: false },
        { id: "c", label: "Ignore the units", correct: false }
      ]
    },
    {
      id: "math-2",
      prompt: "What is 15% of 200?",
      options: [
        { id: "a", label: "20", correct: false },
        { id: "b", label: "30", correct: true },
        { id: "c", label: "45", correct: false }
      ]
    },
    {
      id: "math-3",
      prompt: "Why is showing steps useful in math?",
      options: [
        { id: "a", label: "It helps you find where mistakes happened", correct: true },
        { id: "b", label: "It makes answers less clear", correct: false },
        { id: "c", label: "It is only useful for teachers", correct: false }
      ]
    },
    {
      id: "math-4",
      prompt: "What is the value of x in x + 7 = 12?",
      options: [
        { id: "a", label: "19", correct: false },
        { id: "b", label: "5", correct: true },
        { id: "c", label: "7", correct: false }
      ]
    },
    {
      id: "math-5",
      prompt: "A balanced study approach in math usually means:",
      options: [
        { id: "a", label: "Concept review plus regular practice", correct: true },
        { id: "b", label: "Memorizing answers only", correct: false },
        { id: "c", label: "Doing difficult questions first every time", correct: false }
      ]
    },
    {
      id: "math-6",
      prompt: "Which strategy is best if you feel stuck?",
      options: [
        { id: "a", label: "Break the problem into smaller parts", correct: true },
        { id: "b", label: "Skip every similar problem", correct: false },
        { id: "c", label: "Change the numbers randomly", correct: false }
      ]
    }
  ],
  [LearningGoal.ENGLISH]: [
    {
      id: "eng-1",
      prompt: "What usually improves English fluency most?",
      options: [
        { id: "a", label: "Regular reading, listening, and writing", correct: true },
        { id: "b", label: "Studying once a month", correct: false },
        { id: "c", label: "Ignoring feedback", correct: false }
      ]
    },
    {
      id: "eng-2",
      prompt: "What makes a paragraph easier to understand?",
      options: [
        { id: "a", label: "One clear idea with supporting details", correct: true },
        { id: "b", label: "Many unrelated ideas", correct: false },
        { id: "c", label: "No topic sentence", correct: false }
      ]
    },
    {
      id: "eng-3",
      prompt: "Which sentence sounds more natural?",
      options: [
        { id: "a", label: "I am interested in learning AI.", correct: true },
        { id: "b", label: "I interest learn AI.", correct: false },
        { id: "c", label: "AI learn I interested.", correct: false }
      ]
    },
    {
      id: "eng-4",
      prompt: "What should you check during revision?",
      options: [
        { id: "a", label: "Clarity, grammar, and flow", correct: true },
        { id: "b", label: "Only the word count", correct: false },
        { id: "c", label: "Only the first sentence", correct: false }
      ]
    },
    {
      id: "eng-5",
      prompt: "A strong vocabulary habit usually comes from:",
      options: [
        { id: "a", label: "Seeing and using words in context", correct: true },
        { id: "b", label: "Memorizing long lists without examples", correct: false },
        { id: "c", label: "Avoiding reading", correct: false }
      ]
    },
    {
      id: "eng-6",
      prompt: "What helps speaking confidence improve?",
      options: [
        { id: "a", label: "Frequent low-pressure practice", correct: true },
        { id: "b", label: "Waiting until everything is perfect", correct: false },
        { id: "c", label: "Never listening to others speak", correct: false }
      ]
    }
  ],
  [LearningGoal.EXAM_PREPARATION]: [
    {
      id: "exam-1",
      prompt: "What is the best reason to use a study plan before an exam?",
      options: [
        { id: "a", label: "It helps you spread work over time", correct: true },
        { id: "b", label: "It makes revision less necessary", correct: false },
        { id: "c", label: "It replaces practice completely", correct: false }
      ]
    },
    {
      id: "exam-2",
      prompt: "What should you do if a question takes too long during a timed test?",
      options: [
        { id: "a", label: "Move on and return later if possible", correct: true },
        { id: "b", label: "Stay on it until time ends", correct: false },
        { id: "c", label: "Leave the whole section", correct: false }
      ]
    },
    {
      id: "exam-3",
      prompt: "What kind of practice is most useful before a major exam?",
      options: [
        { id: "a", label: "Timed practice with review", correct: true },
        { id: "b", label: "Reading notes only", correct: false },
        { id: "c", label: "Skipping weak areas", correct: false }
      ]
    },
    {
      id: "exam-4",
      prompt: "What does review do after practice?",
      options: [
        { id: "a", label: "Shows patterns in your mistakes", correct: true },
        { id: "b", label: "Makes practice unnecessary", correct: false },
        { id: "c", label: "Only changes your score sheet", correct: false }
      ]
    },
    {
      id: "exam-5",
      prompt: "Why are shorter regular sessions often better than cramming?",
      options: [
        { id: "a", label: "They improve retention and reduce burnout", correct: true },
        { id: "b", label: "They remove the need for planning", correct: false },
        { id: "c", label: "They work only for easy topics", correct: false }
      ]
    },
    {
      id: "exam-6",
      prompt: "What helps confidence most before exam day?",
      options: [
        { id: "a", label: "Clear routines and realistic practice", correct: true },
        { id: "b", label: "Changing strategy every day", correct: false },
        { id: "c", label: "Avoiding feedback", correct: false }
      ]
    }
  ]
};

export function getGoalOption(goal: LearningGoal) {
  return onboardingGoalOptions.find((option) => option.value === goal) ?? onboardingGoalOptions[0];
}

export function getTimeAvailabilityOption(value: TimeAvailability) {
  return onboardingTimeOptions.find((option) => option.value === value) ?? onboardingTimeOptions[0];
}

export function getRecommendedLevelFromScore(score: number) {
  if (score >= 5) {
    return CourseDifficulty.ADVANCED;
  }

  if (score >= 3) {
    return CourseDifficulty.INTERMEDIATE;
  }

  return CourseDifficulty.BEGINNER;
}

export function getAssessmentQuestions(goal: LearningGoal) {
  return onboardingAssessmentBank[goal];
}
