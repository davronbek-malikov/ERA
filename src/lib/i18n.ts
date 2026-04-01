export const localeCookieName = "era_locale";
export const locales = ["en", "uz"] as const;
export type Locale = (typeof locales)[number];

export function isLocale(value: string | undefined | null): value is Locale {
  return locales.includes((value ?? "") as Locale);
}

export const messages = {
  en: {
    language: { english: "English", uzbek: "Uzbek", short: "Lang" },
    navbar: {
      brandTagline: "Modern learning",
      subjects: "Subjects",
      courses: "Courses",
      learningPaths: "Paths",
      faq: "FAQ",
      signedInAs: "Account",
      myLearning: "My Learning",
      dashboard: "Dashboard",
      signOut: "Sign Out",
      signIn: "Sign In",
      signUp: "Sign Up",
      startLearning: "Start Learning"
    },
    footer: {
      description:
        "A refined EdTech foundation for ambitious learners exploring AI, mathematics, English, and exam preparation through structured, high-trust digital courses.",
      explore: "Explore",
      platform: "Platform",
      about: "About",
      contact: "Contact"
    },
    home: {
      heroBadge: "Now Enrolling",
      heroTitle:
        "Learn AI with real projects, clear mentorship, and a study path built for momentum.",
      heroDescription:
        "ERA Academy gives students one calm place to learn AI, math, English, and exam prep through guided tracks, project-based lessons, and progress they can actually see.",
      exploreCourses: "Start Learning",
      browseSubjects: "See Learning Paths",
      publishedCourses: "Published courses",
      lessonModules: "Lesson modules",
      subjectTracks: "Subject tracks",
      viewCourse: "View course"
    },
    signIn: {
      badge: "Secure Access",
      title: "Sign in with your email or phone number.",
      description:
        "Use one account to manage the admin workspace and review your learning platform. Admin users will be sent to the CMS automatically after login.",
      cards: ["Email or phone login", "Protected admin workspace", "Phone-ready account support"],
      welcome: "Welcome back",
      continueText: "Enter your email address or phone number and password to continue.",
      signedOut: "You have been signed out successfully.",
      reset: "Your password has been reset. You can sign in now.",
      identifier: "Email or phone number",
      identifierPlaceholder: "admin@eraacademy.com or +821012345678",
      password: "Password",
      passwordPlaceholder: "Enter password",
      forgot: "Forgot password?",
      newHere: "New here?",
      createAccount: "Create an account",
      needCatalog: "Need the catalog instead?",
      browseCourses: "Browse courses",
      submit: "Sign In",
      submitting: "Signing in...",
      errors: {
        "missing-fields": "Enter your email or phone number and your password.",
        "invalid-credentials": "We could not sign you in with those credentials.",
        "inactive-account": "This account is not active. Contact support if you need access restored.",
        "rate-limited": "Too many sign-in attempts. Please wait a little and try again.",
        "service-unavailable":
          "Sign-in is temporarily unavailable because the database is busy. Please try again in a moment."
      }
    },
    signUp: {
      badge: "New Account",
      title: "Create your account with Gmail and phone number.",
      description:
        "Students can create an ERA Academy account with their name, email, and password, then add a phone number if they want phone-based sign-in later.",
      cards: ["Gmail-ready sign up", "Phone number login support", "Secure password access"],
      join: "Join ERA Academy",
      details: "Add your basic details below and we will create your student account.",
      name: "Full name",
      namePlaceholder: "Your full name",
      email: "Gmail address",
      emailPlaceholder: "student@gmail.com",
      phone: "Phone number",
      phonePlaceholder: "+821012345678",
      password: "Password",
      passwordPlaceholder: "At least 8 characters",
      confirmPassword: "Confirm password",
      confirmPasswordPlaceholder: "Repeat password",
      submit: "Create Account",
      already: "Already registered?",
      signInHere: "Sign in here",
      errors: {
        "missing-fields": "Please complete your name, Gmail, and password.",
        "invalid-email": "Enter a valid email address.",
        "invalid-phone": "Enter a valid phone number.",
        "password-too-short": "Passwords must be at least 8 characters long.",
        "password-mismatch": "Your password and confirmation do not match.",
        "email-exists": "That Gmail address is already being used.",
        "phone-exists": "That phone number is already being used.",
        "duplicate-email": "That Gmail address is already being used.",
        "duplicate-phone": "That phone number is already being used.",
        "duplicate-record": "An account with those details already exists.",
        "service-unavailable": "Sign-up is temporarily unavailable. Please try again in a moment."
      }
    },
    courses: {
      title: "A searchable catalog with room to scale.",
      description:
        "Filters are handled through server-rendered search params, so the catalog stays fast, indexable, and easy to expand as Prisma-backed content grows.",
      signedUp:
        "Account created successfully. You can now explore courses and save your learning progress.",
      signedIn:
        "Signed in successfully. Your course progress will stay synced to your account.",
      myLearningHint: "Looking for your selected courses only?",
      openMyLearning: "Open My Learning",
      noMatchTitle: "No courses matched your filters",
      noMatchDescription: "Try widening your search or clearing one of the selected filters.",
      resetCatalog: "Reset Catalog",
      searchPlaceholder: "Search courses, instructors, or topics",
      allSubjects: "All subjects",
      allCategories: "All categories",
      allLevels: "All levels",
      applyFilters: "Apply filters",
      add: "Add",
      myLearningShort: "My Learning",
      structuredOverview: "Structured course overview",
      curriculumSoon: "Curriculum details coming soon",
      selectedCourseFallback: "A structured course selected for your personal learning list.",
      polishedFallback: "A polished course experience designed for clarity and momentum."
    },
    myLearning: {
      successAdded:
        "Course added to My Learning successfully. You can continue from here anytime.",
      successSignedUp:
        "Account created successfully. Choose a course to start building your learning list.",
      successSignedIn: "Signed in successfully. Your selected courses will appear here.",
      badge: "My Learning",
      title: "Keep your selected courses in one focused place.",
      description:
        "This area is only for courses you have chosen. New students start with an empty learning list, then build it course by course.",
      emptyTitle: "Your learning list is empty",
      emptyDescription:
        "You have not added any courses yet. Browse the catalog, open a course, and use Add to My Learning to build your study space.",
      browseCourses: "Browse Courses",
      complete: "complete",
      lastUpdated: "Last updated",
      continueCourse: "Continue Course",
      browseMoreCourses: "Browse More Courses"
    },
    subjects: {
      title: "Four core domains, each ready to scale into a full catalog.",
      description:
        "The subject layer now reads from Prisma-backed models, so categories and course counts stay aligned with your database instead of static page content.",
      noSubjectsTitle: "No subjects yet",
      noSubjectsDescription:
        "Add subjects from the admin CMS to start structuring the learning catalog.",
      openAdmin: "Open Admin",
      courses: "courses",
      fallback:
        "A well-structured subject space designed to expand into categories, courses, and lesson sequences.",
      exploreSubject: "Explore subject"
    },
    courseDetail: {
      signedInSuccess:
        "Signed in successfully. Your lesson progress will now be saved to your account.",
      featured: "Featured",
      popular: "Popular",
      instructor: "Instructor",
      difficulty: "Difficulty",
      lessonCount: "Lesson Count",
      studyTime: "Study Time",
      category: "Category",
      viewCurriculum: "View curriculum",
      curriculumPreparing:
        "Curriculum details are being prepared for this course. Browse other live courses or return soon when lessons are published.",
      watchPromo: "Watch promo video",
      addDescription:
        "Add this course to your learning list so you can come back to it quickly from one focused place.",
      addCta: "Add to My Learning",
      goToMyLearning: "Go to My Learning",
      selectedSeparate: "Your selected courses stay separate from the full public catalog.",
      learningOutcomes: "Learning Outcomes",
      achieve: "What students will achieve",
      relatedCourses: "Related Courses",
      momentum: "Keep the learning momentum going.",
      noRelatedTitle: "No related courses yet",
      noRelatedDescription:
        "As the catalog grows, related courses from the same category or subject will appear here.",
      browseAllCourses: "Browse All Courses",
      curriculum: "Curriculum",
      curriculumDescription:
        "Follow the lessons in order, mark completed lessons, and download supporting study materials.",
      progress: "Progress",
      completeSuffix: "% complete",
      lessonsCompleted: "lessons completed",
      signInToSave:
        "Sign in to save lesson completion and keep your course progress after refresh.",
      courseMaterials: "Course materials",
      lessonLabel: "Lesson",
      watchLesson: "Watch lesson",
      completed: "Completed",
      markComplete: "Mark complete",
      couldNotLoadProgress: "Could not load lesson progress.",
      couldNotUpdateProgress: "Could not update lesson progress."
    },
    system: {
      pageNotFound: "This page does not exist.",
      pageNotFoundDescription:
        "The page you requested could not be found. It may have moved, or the slug may no longer be valid.",
      returnHome: "Return Home",
      somethingWentWrong: "Something went wrong",
      pageCouldNotLoad: "The page could not be loaded.",
      pageCouldNotLoadDescription:
        "An unexpected error occurred while rendering this route. Try again, and if the issue persists, check your environment variables and database connection.",
      tryAgain: "Try Again"
    }
  },
  uz: {
    language: { english: "English", uzbek: "Uzbek", short: "Til" },
    navbar: {
      brandTagline: "Zamonaviy ta'lim",
      subjects: "Fanlar",
      courses: "Kurslar",
      learningPaths: "Yo'llar",
      faq: "Savollar",
      signedInAs: "Akkaunt",
      myLearning: "Mening o'qishim",
      dashboard: "Boshqaruv paneli",
      signOut: "Chiqish",
      signIn: "Kirish",
      signUp: "Ro'yxatdan o'tish",
      startLearning: "Boshlash"
    },
    footer: {
      description:
        "AI, matematika, ingliz tili va imtihon tayyorgarligini puxta, ishonchli va tartibli raqamli kurslar orqali o'rganmoqchi bo'lgan intiluvchan o'quvchilar uchun zamonaviy EdTech asos.",
      explore: "Ko'rib chiqish",
      platform: "Platforma",
      about: "Haqida",
      contact: "Aloqa"
    },
    home: {
      heroBadge: "Qabul ochiq",
      heroTitle:
        "Haqiqiy loyihalar, aniq mentorlik va progressga xizmat qiladigan yo'l bilan AI ni o'rganing.",
      heroDescription:
        "ERA Academy o'quvchilarga AI, matematika, ingliz tili va imtihon tayyorgarligini bitta sokin joyda o'rganish imkonini beradi: yo'naltirilgan yo'llar, loyiha asosidagi darslar va ko'rinadigan progress bilan.",
      exploreCourses: "O'qishni boshlash",
      browseSubjects: "O'quv yo'nalishlarini ko'rish",
      publishedCourses: "Nashr qilingan kurslar",
      lessonModules: "Dars modullari",
      subjectTracks: "Fan yo'nalishlari",
      viewCourse: "Kursni ko'rish"
    },
    signIn: {
      badge: "Xavfsiz kirish",
      title: "Email yoki telefon raqamingiz bilan kiring.",
      description:
        "Bitta akkaunt orqali admin ish maydonini boshqaring va o'quv platformangizni ko'rib boring. Admin foydalanuvchilar kirgandan so'ng avtomatik ravishda CMS ga yuboriladi.",
      cards: ["Email yoki telefon orqali kirish", "Himoyalangan admin maydoni", "Telefon orqali kirish qo'llovi"],
      welcome: "Qaytganingizdan xursandmiz",
      continueText: "Davom etish uchun email yoki telefon raqamingiz va parolingizni kiriting.",
      signedOut: "Siz muvaffaqiyatli chiqdingiz.",
      reset: "Parolingiz yangilandi. Endi kirishingiz mumkin.",
      identifier: "Email yoki telefon raqami",
      identifierPlaceholder: "admin@eraacademy.com yoki +821012345678",
      password: "Parol",
      passwordPlaceholder: "Parolni kiriting",
      forgot: "Parolni unutdingizmi?",
      newHere: "Yangimisiz?",
      createAccount: "Akkaunt yarating",
      needCatalog: "Katalog kerakmi?",
      browseCourses: "Kurslarni ko'rish",
      submit: "Kirish",
      submitting: "Kirilmoqda...",
      errors: {
        "missing-fields": "Email yoki telefon raqamingiz va parolingizni kiriting.",
        "invalid-credentials": "Bu ma'lumotlar bilan tizimga kira olmadik.",
        "inactive-account": "Bu akkaunt faol emas. Kirish kerak bo'lsa, qo'llab-quvvatlash bilan bog'laning.",
        "rate-limited": "Juda ko'p kirish urinishi bo'ldi. Biroz kutib, qayta urinib ko'ring.",
        "service-unavailable":
          "Ma'lumotlar bazasi bandligi sababli kirish vaqtincha mavjud emas. Birozdan so'ng qayta urinib ko'ring."
      }
    },
    signUp: {
      badge: "Yangi akkaunt",
      title: "Gmail va telefon raqami bilan akkaunt yarating.",
      description:
        "O'quvchilar ERA Academy akkauntini ism, email va parol bilan yaratib, xohlasa keyin telefon raqamini ham qo'shishi mumkin.",
      cards: ["Gmail orqali ro'yxatdan o'tish", "Telefon orqali kirish qo'llovi", "Xavfsiz parol bilan kirish"],
      join: "ERA Academy ga qo'shiling",
      details: "Quyida asosiy ma'lumotlaringizni kiriting va biz siz uchun talaba akkauntini yaratamiz.",
      name: "To'liq ism",
      namePlaceholder: "To'liq ismingiz",
      email: "Gmail manzili",
      emailPlaceholder: "student@gmail.com",
      phone: "Telefon raqami",
      phonePlaceholder: "+821012345678",
      password: "Parol",
      passwordPlaceholder: "Kamida 8 ta belgi",
      confirmPassword: "Parolni tasdiqlang",
      confirmPasswordPlaceholder: "Parolni takrorlang",
      submit: "Akkaunt yaratish",
      already: "Avval ro'yxatdan o'tganmisiz?",
      signInHere: "Bu yerda kiring",
      errors: {
        "missing-fields": "Iltimos, ism, Gmail va parolni to'liq kiriting.",
        "invalid-email": "Yaroqli email manzilini kiriting.",
        "invalid-phone": "Yaroqli telefon raqamini kiriting.",
        "password-too-short": "Parol kamida 8 belgidan iborat bo'lishi kerak.",
        "password-mismatch": "Parol va tasdiqlash bir xil emas.",
        "email-exists": "Bu Gmail manzili allaqachon ishlatilmoqda.",
        "phone-exists": "Bu telefon raqami allaqachon ishlatilmoqda.",
        "duplicate-email": "Bu Gmail manzili allaqachon ishlatilmoqda.",
        "duplicate-phone": "Bu telefon raqami allaqachon ishlatilmoqda.",
        "duplicate-record": "Bu ma'lumotlar bilan akkaunt allaqachon mavjud.",
        "service-unavailable": "Ro'yxatdan o'tish vaqtincha mavjud emas. Birozdan so'ng qayta urinib ko'ring."
      }
    },
    courses: {
      title: "Kengayishga tayyor qidiruvli katalog.",
      description:
        "Filtrlar server-render qilingan search params orqali ishlaydi, shuning uchun katalog tez, indekslanadigan va Prisma asosidagi kontent kengayganda ham boshqarish oson bo'lib qoladi.",
      signedUp:
        "Akkaunt muvaffaqiyatli yaratildi. Endi kurslarni ko'rishingiz va progressni saqlashingiz mumkin.",
      signedIn:
        "Muvaffaqiyatli kirdingiz. Kurs progressi akkauntingiz bilan sinxron qoladi.",
      myLearningHint: "Faqat tanlangan kurslaringizni ko'rmoqchimisiz?",
      openMyLearning: "Mening o'qishimni ochish",
      noMatchTitle: "Filtrlarga mos kurs topilmadi",
      noMatchDescription: "Qidiruvni kengaytiring yoki tanlangan filtrlarni tozalang.",
      resetCatalog: "Katalogni tiklash",
      searchPlaceholder: "Kurslar, instruktorlar yoki mavzularni qidiring",
      allSubjects: "Barcha fanlar",
      allCategories: "Barcha kategoriyalar",
      allLevels: "Barcha darajalar",
      applyFilters: "Filtrlarni qo'llash",
      add: "Qo'shish",
      myLearningShort: "Mening o'qishim",
      structuredOverview: "Tartibli kurs ko'rinishi",
      curriculumSoon: "Dastur tafsilotlari tez orada",
      selectedCourseFallback: "Shaxsiy o'qish ro'yxatingiz uchun tanlangan tartibli kurs.",
      polishedFallback: "Aniqlik va sur'at uchun mo'ljallangan puxta kurs tajribasi."
    },
    myLearning: {
      successAdded:
        "Kurs Mening o'qishim bo'limiga muvaffaqiyatli qo'shildi. Endi shu yerdan davom ettirishingiz mumkin.",
      successSignedUp:
        "Akkaunt muvaffaqiyatli yaratildi. O'qish ro'yxatingizni tuzish uchun kurs tanlang.",
      successSignedIn: "Muvaffaqiyatli kirdingiz. Tanlangan kurslaringiz shu yerda ko'rinadi.",
      badge: "Mening o'qishim",
      title: "Tanlangan kurslaringizni bitta tartibli joyda saqlang.",
      description:
        "Bu bo'lim faqat siz tanlagan kurslar uchun. Yangi o'quvchilar bo'sh ro'yxatdan boshlaydi va uni kursma-kurs to'ldiradi.",
      emptyTitle: "O'qish ro'yxatingiz bo'sh",
      emptyDescription:
        "Siz hali hech qanday kurs qo'shmagansiz. Katalogni ko'ring, kursni oching va o'qish maydonini shakllantirish uchun Mening o'qishimga qo'shishdan foydalaning.",
      browseCourses: "Kurslarni ko'rish",
      complete: "bajarildi",
      lastUpdated: "Oxirgi yangilanish",
      continueCourse: "Kursni davom ettirish",
      browseMoreCourses: "Yana kurslarni ko'rish"
    },
    subjects: {
      title: "To'liq katalogga aylanishga tayyor to'rtta asosiy yo'nalish.",
      description:
        "Fanlar qatlami endi Prisma asosidagi modellardan o'qiladi, shuning uchun kategoriyalar va kurslar soni statik sahifa matniga emas, ma'lumotlar bazasiga mos qoladi.",
      noSubjectsTitle: "Hali fanlar yo'q",
      noSubjectsDescription:
        "O'quv katalogini tuzishni boshlash uchun admin CMS dan fanlar qo'shing.",
      openAdmin: "Adminni ochish",
      courses: "ta kurs",
      fallback:
        "Kategoriyalar, kurslar va dars ketma-ketligiga kengayishga tayyor puxta fan maydoni.",
      exploreSubject: "Fanni ko'rish"
    },
    courseDetail: {
      signedInSuccess:
        "Muvaffaqiyatli kirdingiz. Endi dars progressi akkauntingizda saqlanadi.",
      featured: "Tavsiya etilgan",
      popular: "Mashhur",
      instructor: "Instruktor",
      difficulty: "Daraja",
      lessonCount: "Darslar soni",
      studyTime: "O'qish vaqti",
      category: "Kategoriya",
      viewCurriculum: "Dasturini ko'rish",
      curriculumPreparing:
        "Bu kurs uchun dastur tafsilotlari tayyorlanmoqda. Boshqa faol kurslarni ko'ring yoki darslar nashr etilgach qayta keling.",
      watchPromo: "Promo videoni ko'rish",
      addDescription:
        "Bu kursni o'qish ro'yxatingizga qo'shing, shunda unga bitta tartibli joydan tez qayta olasiz.",
      addCta: "Mening o'qishimga qo'shish",
      goToMyLearning: "Mening o'qishimga o'tish",
      selectedSeparate: "Tanlangan kurslaringiz ommaviy katalogdan alohida saqlanadi.",
      learningOutcomes: "O'quv natijalari",
      achieve: "O'quvchilar nimaga erishadi",
      relatedCourses: "O'xshash kurslar",
      momentum: "O'rganish sur'atini davom ettiring.",
      noRelatedTitle: "Hali o'xshash kurslar yo'q",
      noRelatedDescription:
        "Katalog kengaygani sari shu kategoriya yoki fanga oid tegishli kurslar shu yerda ko'rinadi.",
      browseAllCourses: "Barcha kurslarni ko'rish",
      curriculum: "Dastur",
      curriculumDescription:
        "Darslarni ketma-ket o'ting, bajarilgan darslarni belgilang va qo'llab-quvvatlovchi materiallarni yuklab oling.",
      progress: "Progress",
      completeSuffix: "% bajarildi",
      lessonsCompleted: "dars bajarildi",
      signInToSave:
        "Darslarni bajarilgan deb saqlash va progressni yangilanishdan keyin ham saqlab qolish uchun tizimga kiring.",
      courseMaterials: "Kurs materiallari",
      lessonLabel: "Dars",
      watchLesson: "Darsni ko'rish",
      completed: "Bajarildi",
      markComplete: "Bajarildi deb belgilash",
      couldNotLoadProgress: "Dars progressini yuklab bo'lmadi.",
      couldNotUpdateProgress: "Dars progressini yangilab bo'lmadi."
    },
    system: {
      pageNotFound: "Bu sahifa mavjud emas.",
      pageNotFoundDescription:
        "Siz so'ragan sahifa topilmadi. U ko'chirilgan bo'lishi yoki slug endi yaroqsiz bo'lishi mumkin.",
      returnHome: "Bosh sahifaga qaytish",
      somethingWentWrong: "Nimadir xato ketdi",
      pageCouldNotLoad: "Sahifani yuklab bo'lmadi.",
      pageCouldNotLoadDescription:
        "Bu yo'nalishni render qilish paytida kutilmagan xatolik yuz berdi. Qayta urinib ko'ring, muammo davom etsa muhit o'zgaruvchilari va ma'lumotlar bazasi ulanishini tekshiring.",
      tryAgain: "Qayta urinib ko'rish"
    }
  }
} as const;

export function getMessages(locale: Locale) {
  return messages[locale];
}
