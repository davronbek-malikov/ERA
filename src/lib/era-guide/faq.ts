import type { EraGuideFaqEntry, EraGuideQuickAction } from "@/lib/era-guide/types";

export const eraGuideQuickActions: EraGuideQuickAction[] = [
  {
    id: "register",
    label: "Register Account",
    prompt: "How can I register?"
  },
  {
    id: "login",
    label: "Login",
    prompt: "How do I log in?"
  },
  {
    id: "courses",
    label: "Find Courses",
    prompt: "Where can I find courses?"
  },
  {
    id: "dashboard",
    label: "My Dashboard",
    prompt: "Where is my dashboard?"
  },
  {
    id: "support",
    label: "Contact Support",
    prompt: "How do I contact support?"
  },
  {
    id: "era",
    label: "How ERA Works",
    prompt: "How does ERA work?"
  }
];

export const eraGuideFaqEntries: EraGuideFaqEntry[] = [
  {
    id: "register-account",
    label: "How can I register?",
    keywords: ["register", "sign up", "signup", "create account", "join", "account"],
    answer: {
      title: "Create your account",
      body: "You can register in a few short steps.",
      steps: [
        "Open the sign up page.",
        "Enter your name, email address, and password.",
        "Submit the form to create your student account."
      ],
      links: [
        { label: "Open Sign Up", href: "/sign-up" },
        { label: "Browse Courses", href: "/courses" }
      ]
    }
  },
  {
    id: "login-account",
    label: "How do I log in?",
    keywords: ["login", "log in", "sign in", "signin", "access account"],
    answer: {
      title: "Sign in to your account",
      body: "Use your email or phone number with your password.",
      steps: [
        "Open the sign in page.",
        "Enter your email or phone number and password.",
        "Submit the form to continue to your account."
      ],
      links: [
        { label: "Open Sign In", href: "/sign-in" },
        { label: "Forgot Password", href: "/forgot-password" }
      ]
    }
  },
  {
    id: "find-courses",
    label: "Where can I find courses?",
    keywords: ["find course", "courses", "catalog", "browse", "subjects", "learn", "course list"],
    answer: {
      title: "Find courses",
      body: "The main course catalog is the best place to start.",
      steps: [
        "Open the Courses page.",
        "Browse the catalog or use filters to narrow your search.",
        "Open a course page to review its lessons and details."
      ],
      links: [
        { label: "Browse Courses", href: "/courses" },
        { label: "Explore Subjects", href: "/subjects" }
      ]
    }
  },
  {
    id: "take-course",
    label: "How can I take a course?",
    keywords: ["take course", "start course", "enroll", "begin course", "study", "learn course"],
    answer: {
      title: "Start learning in a course",
      body: "You can begin from the course catalog and then open a lesson.",
      steps: [
        "Open the Courses page and choose a course.",
        "Use the course page to review the curriculum.",
        "Open a lesson to start studying and continue your learning."
      ],
      links: [
        { label: "Go to Courses", href: "/courses" },
        { label: "Open My Learning", href: "/my-learning" }
      ]
    }
  },
  {
    id: "dashboard",
    label: "Where is my dashboard?",
    keywords: ["dashboard", "my learning", "progress", "continue learning", "student dashboard"],
    answer: {
      title: "Your learning dashboard",
      body: "Students can continue from the My Learning page after signing in.",
      steps: [
        "Sign in to your account.",
        "Open My Learning from the navigation.",
        "Use that page to continue active courses and track progress."
      ],
      links: [
        { label: "Open My Learning", href: "/my-learning" },
        { label: "Sign In", href: "/sign-in" }
      ]
    }
  },
  {
    id: "contact-support",
    label: "How do I contact support?",
    keywords: ["support", "contact", "help", "email", "customer service", "assistance"],
    answer: {
      title: "Contact support",
      body: "Support details are handled through the website contact information.",
      steps: [
        "Check the footer or platform contact details for the current support email.",
        "If your issue is about account access, open the sign in or forgot password page first.",
        "Share the page you were using and a short description of the problem."
      ],
      links: [
        { label: "Open Sign In", href: "/sign-in" },
        { label: "Forgot Password", href: "/forgot-password" }
      ]
    }
  },
  {
    id: "what-is-era",
    label: "What is ERA?",
    keywords: ["what is era", "era", "how era works", "assistant", "ai", "guide"],
    answer: {
      title: "What ERA does",
      body: "ERA is the learning assistant built into the platform.",
      steps: [
        "ERA Guide helps users understand how to use the website and where to go next.",
        "ERA lesson chat can help explain course lessons step by step inside lesson pages.",
        "Use ERA when you need quick help, navigation guidance, or simpler explanations."
      ],
      links: [
        { label: "Browse Courses", href: "/courses" },
        { label: "Open Home", href: "/" }
      ]
    }
  }
];

export const eraGuideFallbackAnswer = {
  title: "I can help with the website basics",
  body: "I do not have a confident answer for that yet, but I can still help you with the main platform steps.",
  steps: [
    "Try one of the quick actions below.",
    "Ask about registration, login, courses, dashboard, support, or how ERA works.",
    "If you are trying to continue studying, open My Learning after signing in."
  ],
  links: [
    { label: "Open Courses", href: "/courses" },
    { label: "Open Sign In", href: "/sign-in" },
    { label: "Open My Learning", href: "/my-learning" }
  ]
};
