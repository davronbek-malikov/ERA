import type { Locale } from "@/lib/i18n";

export type FaqCategory = {
  id: string;
  title: string;
  description: string;
};

export type FaqItem = {
  id: string;
  categoryId: string;
  question: string;
  answer: string;
  keywords: string[];
};

export type FaqPageContent = {
  badge: string;
  title: string;
  description: string;
  searchPlaceholder: string;
  searchHint: string;
  noResultsTitle: string;
  noResultsDescription: string;
  resetLabel: string;
  supportTitle: string;
  supportDescription: string;
  supportEmailLabel: string;
  supportButtonLabel: string;
  categories: FaqCategory[];
  items: FaqItem[];
};

const englishContent: FaqPageContent = {
  badge: "Help Center",
  title: "Simple answers for students, parents, and new users",
  description:
    "Use this page to find quick answers about your account, courses, certificates, support, and common website problems.",
  searchPlaceholder: "Search a question, topic, or keyword",
  searchHint: "Try words like login, register, course, certificate, video, or support.",
  noResultsTitle: "No matching questions found",
  noResultsDescription:
    "Try a shorter word or check another category. If you still need help, use the support section below.",
  resetLabel: "Clear search",
  supportTitle: "Still need help?",
  supportDescription:
    "If you cannot find the answer here, contact support or open the ERA Guide button at the bottom right of the page.",
  supportEmailLabel: "Support email",
  supportButtonLabel: "Contact support",
  categories: [
    {
      id: "account-login",
      title: "Account / Login",
      description: "Help with signing in, password issues, and account access."
    },
    {
      id: "registration",
      title: "Registration",
      description: "Basic steps for creating an account and joining ERA."
    },
    {
      id: "courses",
      title: "Courses",
      description: "Finding courses, starting lessons, and continuing your study."
    },
    {
      id: "payments",
      title: "Payments",
      description: "General payment and access questions."
    },
    {
      id: "certificates",
      title: "Certificates",
      description: "What to expect after finishing a course."
    },
    {
      id: "technical-issues",
      title: "Technical Issues",
      description: "Fixes for loading problems and common device issues."
    },
    {
      id: "contact-support",
      title: "Contact / Support",
      description: "How to contact the team when you still need help."
    }
  ],
  items: [
    {
      id: "register-account",
      categoryId: "registration",
      question: "How do I register?",
      answer:
        "Open the Sign Up page, enter your name, email address, and password, then submit the form. After your account is created, you can sign in and start exploring courses.",
      keywords: ["register", "sign up", "create account", "join", "registration"]
    },
    {
      id: "login-account",
      categoryId: "account-login",
      question: "How do I log in?",
      answer:
        "Open the Sign In page and enter your email address or phone number with your password. If your details are correct, you will go to your account or learning area.",
      keywords: ["log in", "login", "sign in", "account access"]
    },
    {
      id: "forgot-password",
      categoryId: "account-login",
      question: "What should I do if I forgot my password?",
      answer:
        "Open the Forgot Password page and follow the reset steps. After you create a new password, return to the Sign In page and log in again.",
      keywords: ["forgot password", "reset password", "cannot sign in", "password help"]
    },
    {
      id: "start-course",
      categoryId: "courses",
      question: "How do I start a course?",
      answer:
        "Open the Courses page, choose a course, and review the course details. From there, open the first lesson or add the course to My Learning so you can return to it easily.",
      keywords: ["start course", "begin course", "open course", "first lesson"]
    },
    {
      id: "continue-lesson",
      categoryId: "courses",
      question: "How do I continue my lesson?",
      answer:
        "Sign in and open My Learning. Choose your course to continue from your current lesson and keep track of your progress in one place.",
      keywords: ["continue lesson", "continue course", "my learning", "progress"]
    },
    {
      id: "cannot-see-course",
      categoryId: "courses",
      question: "Why can't I see my course?",
      answer:
        "First, make sure you are signed in with the correct account. Then check My Learning and the Courses page. If the course is still missing, contact support and include the course name.",
      keywords: ["cannot see course", "missing course", "course not visible", "my course"]
    },
    {
      id: "course-not-open",
      categoryId: "courses",
      question: "Why does a course page show limited content?",
      answer:
        "Some course pages may show overview information first while lesson content is being prepared or updated. If you are unsure whether a course is ready, contact support for confirmation.",
      keywords: ["course page", "limited content", "curriculum", "lessons missing"]
    },
    {
      id: "payments-accepted",
      categoryId: "payments",
      question: "How do payments work?",
      answer:
        "Payment options may depend on the course or enrollment setup currently used by ERA. If payment details are not shown on your course page, contact support before making a decision.",
      keywords: ["payments", "pay", "price", "billing", "fees"]
    },
    {
      id: "refund-policy",
      categoryId: "payments",
      question: "Can I ask about refunds or payment issues?",
      answer:
        "Yes. If you have a payment question, contact support with your name, course name, and a short explanation of the issue so the team can guide you correctly.",
      keywords: ["refund", "payment issue", "billing help", "payment support"]
    },
    {
      id: "certificate-availability",
      categoryId: "certificates",
      question: "Will I get a certificate after finishing a course?",
      answer:
        "Certificate availability depends on the course and platform setup. If certificates are offered for your course, support or course information will explain how they are issued.",
      keywords: ["certificate", "completion certificate", "finish course", "award"]
    },
    {
      id: "certificate-missing",
      categoryId: "certificates",
      question: "What should I do if I finished a course but did not get a certificate?",
      answer:
        "Contact support and share your account name, the course title, and the date you completed the course. The team can check your progress and confirm the next step.",
      keywords: ["missing certificate", "no certificate", "completed course"]
    },
    {
      id: "video-not-loading",
      categoryId: "technical-issues",
      question: "What should I do if video does not load?",
      answer:
        "Refresh the page first. If the video still does not load, check your internet connection, try another browser, and make sure your device is updated. If the problem continues, contact support with the course and lesson name.",
      keywords: ["video", "video not loading", "lesson video", "media issue"]
    },
    {
      id: "page-not-working",
      categoryId: "technical-issues",
      question: "What should I do if a page is not working correctly?",
      answer:
        "Try refreshing the page, signing out and back in, or opening the page on another device or browser. If the same problem keeps happening, send support a short description and a screenshot if possible.",
      keywords: ["page issue", "website problem", "error", "not working"]
    },
    {
      id: "contact-support",
      categoryId: "contact-support",
      question: "How do I contact support?",
      answer:
        "Use the support email shown at the bottom of this page. You can also use the ERA Guide button on the website for quick help with login, courses, and basic navigation.",
      keywords: ["contact support", "help", "email", "assistance", "support"]
    }
  ]
};

const uzbekContent: FaqPageContent = {
  ...englishContent,
  badge: "Yordam markazi",
  title: "Talabalar, ota-onalar va yangi foydalanuvchilar uchun sodda javoblar",
  description:
    "Bu sahifada akkaunt, kurslar, sertifikatlar, yordam va keng uchraydigan sayt muammolari bo'yicha tez javoblarni toping.",
  searchPlaceholder: "Savol, mavzu yoki kalit so'zni qidiring",
  searchHint: "Masalan: login, register, course, certificate, video yoki support.",
  noResultsTitle: "Mos savol topilmadi",
  noResultsDescription:
    "Qisqaroq so'z bilan qidirib ko'ring yoki boshqa bo'limni tekshiring. Hali ham yordam kerak bo'lsa, pastdagi yordam bo'limidan foydalaning.",
  resetLabel: "Qidiruvni tozalash",
  supportTitle: "Hali ham yordam kerakmi?",
  supportDescription:
    "Bu yerda javob topa olmasangiz, support bilan bog'laning yoki sahifaning past o'ng burchagidagi ERA Guide tugmasini oching.",
  supportEmailLabel: "Support email",
  supportButtonLabel: "Support bilan bog'lanish",
  categories: [
    {
      id: "account-login",
      title: "Akkaunt / Kirish",
      description: "Tizimga kirish, parol va akkaunt ochilishi bo'yicha yordam."
    },
    {
      id: "registration",
      title: "Ro'yxatdan o'tish",
      description: "ERA ga qo'shilish va akkaunt yaratish bo'yicha asosiy qadamlar."
    },
    {
      id: "courses",
      title: "Kurslar",
      description: "Kurs topish, darsni boshlash va o'qishni davom ettirish."
    },
    {
      id: "payments",
      title: "To'lovlar",
      description: "To'lov va kirish huquqi bo'yicha umumiy savollar."
    },
    {
      id: "certificates",
      title: "Sertifikatlar",
      description: "Kurs tugagandan keyin nimalarni kutish mumkin."
    },
    {
      id: "technical-issues",
      title: "Texnik muammolar",
      description: "Yuklanish muammolari va odatiy qurilma xatolari uchun yechimlar."
    },
    {
      id: "contact-support",
      title: "Aloqa / Support",
      description: "Hali ham yordam kerak bo'lsa, jamoa bilan qanday bog'lanish."
    }
  ]
};

export function getFaqPageContent(locale: Locale): FaqPageContent {
  return locale === "uz" ? uzbekContent : englishContent;
}
