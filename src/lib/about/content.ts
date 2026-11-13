import type { Locale } from "@/lib/i18n";

export type AboutPageContent = {
  heroBadge: string;
  heroTitle: string;
  heroDescription: string;
  heroStats: Array<{ label: string; value: string }>;
  ctas: {
    exploreCourses: string;
    startLearning: string;
    contactUs: string;
  };
  sections: {
    whatIsEra: {
      title: string;
      body: string;
    };
    mission: {
      title: string;
      body: string;
    };
    whoItIsFor: {
      title: string;
      body: string;
      groups: Array<{ title: string; description: string }>;
    };
    whatUsersLearn: {
      title: string;
      body: string;
      items: string[];
    };
    whyChooseEra: {
      title: string;
      body: string;
      points: Array<{ title: string; description: string }>;
    };
    teachingStyle: {
      title: string;
      body: string;
      steps: string[];
    };
    support: {
      title: string;
      body: string;
      communityNote: string;
      supportEmailLabel: string;
    };
  };
};

const englishContent: AboutPageContent = {
  heroBadge: "About ERA",
  heroTitle: "Clear, practical learning for people who want more than random content",
  heroDescription:
    "ERA helps learners build real skills through guided courses, real projects, and a study path that is easier to trust and follow.",
  heroStats: [
    { label: "Focus", value: "AI and practical skills" },
    { label: "Style", value: "Guided project learning" },
    { label: "Level", value: "Beginner to growing learner" }
  ],
  ctas: {
    exploreCourses: "Explore Courses",
    startLearning: "Start Learning",
    contactUs: "Contact Us"
  },
  sections: {
    whatIsEra: {
      title: "What is ERA?",
      body:
        "ERA is an education platform designed to make learning clearer, more practical, and easier to continue. Instead of leaving users to jump between disconnected videos or notes, ERA gives them a more guided learning path with visible progress and real direction."
    },
    mission: {
      title: "Our mission",
      body:
        "Our mission is to help learners grow with confidence through structured education, practical work, and simple explanations. We want learning to feel focused, useful, and realistic for everyday progress."
    },
    whoItIsFor: {
      title: "Who ERA is for",
      body:
        "ERA is built for people who want a better way to learn. It is especially helpful for learners who need clarity, guidance, and a step-by-step path instead of confusion.",
      groups: [
        {
          title: "Beginners",
          description: "People starting from the basics and looking for a clear and calm entry point."
        },
        {
          title: "Growing learners",
          description: "Students who already started learning and now want more structure and consistency."
        },
        {
          title: "Serious self-learners and families",
          description: "People who want visible course direction, stronger trust, and better learning support."
        }
      ]
    },
    whatUsersLearn: {
      title: "What users can learn",
      body:
        "ERA is designed around useful skills that can be practiced, applied, and improved over time. The goal is not only to watch lessons, but to understand and use what is being taught.",
      items: [
        "AI foundations and practical AI workflows",
        "Project-based problem solving and step-by-step thinking",
        "Clearer digital learning habits and study rhythm",
        "Skills that grow through guided lessons, practice, and repetition"
      ]
    },
    whyChooseEra: {
      title: "Why choose ERA",
      body:
        "Users trust learning platforms when they can understand the journey, see the next step, and feel that the experience was designed carefully. ERA is built around that idea.",
      points: [
        {
          title: "Clarity first",
          description: "Lessons, pathways, and outcomes are presented in a way that feels easier to understand."
        },
        {
          title: "Practical learning",
          description: "Courses focus on real use, not only theory, so learners can apply what they study."
        },
        {
          title: "Guided structure",
          description: "ERA helps users move through learning with more confidence and less guesswork."
        }
      ]
    },
    teachingStyle: {
      title: "Our teaching style",
      body:
        "ERA follows a guided learning approach. We keep the process simple: start at the right level, learn through focused lessons, practice with purpose, and continue with a visible next step.",
      steps: [
        "Start from the right level instead of guessing where to begin.",
        "Learn through short, focused lessons inside a bigger pathway.",
        "Practice through examples, projects, and practical tasks.",
        "Keep moving with visible progress and a clearer next step."
      ]
    },
    support: {
      title: "Contact, support, and community",
      body:
        "Learning works better when users know where to ask questions and how to get help. ERA is designed to give support through clear contact options and simple guidance across the platform.",
      communityNote:
        "Users can also use ERA Guide on public pages for quick help with navigation, login, courses, and basic platform questions.",
      supportEmailLabel: "Support email"
    }
  }
};

const uzbekContent: AboutPageContent = {
  heroBadge: "ERA haqida",
  heroTitle: "Tasodifiy kontentdan ko'ra aniqroq va amaliyroq o'rganish",
  heroDescription:
    "ERA o'quvchilarga yo'naltirilgan kurslar, haqiqiy loyihalar va ishonch bilan davom ettirish mumkin bo'lgan o'quv yo'li orqali real ko'nikmalarni rivojlantirishga yordam beradi.",
  heroStats: [
    { label: "Yo'nalish", value: "AI va amaliy ko'nikmalar" },
    { label: "Uslub", value: "Yo'naltirilgan loyiha asosli o'qish" },
    { label: "Daraja", value: "Boshlang'ichdan rivojlanayotgan o'quvchigacha" }
  ],
  ctas: {
    exploreCourses: "Kurslarni ko'rish",
    startLearning: "O'qishni boshlash",
    contactUs: "Bog'lanish"
  },
  sections: {
    whatIsEra: {
      title: "ERA nima?",
      body:
        "ERA bu o'rganishni aniqroq, amaliyroq va davom ettirishni osonroq qilish uchun yaratilgan ta'lim platformasi. Foydalanuvchini uzilgan videolar va qaydlar orasida qoldirish o'rniga, ERA ko'rinadigan progress va aniq yo'nalish bilan boshqariladigan o'quv yo'lini beradi."
    },
    mission: {
      title: "Bizning missiyamiz",
      body:
        "Bizning missiyamiz o'quvchilarga tartibli ta'lim, amaliy ish va sodda tushuntirishlar orqali ishonch bilan rivojlanishga yordam berishdir. O'qish foydali, aniq va kundalik progress uchun real his qilinishi kerak."
    },
    whoItIsFor: {
      title: "ERA kimlar uchun",
      body:
        "ERA yaxshiroq o'rganish usulini xohlaydiganlar uchun qurilgan. Ayniqsa aniqlik, yo'l-yo'riq va bosqichma-bosqich harakatni xohlaydigan o'quvchilar uchun foydali.",
      groups: [
        {
          title: "Boshlovchilar",
          description: "Asoslardan boshlayotgan va sokin, tushunarli kirish nuqtasini izlayotganlar uchun."
        },
        {
          title: "Rivojlanayotgan o'quvchilar",
          description: "Allaqachon boshlab, endi ko'proq tuzilma va izchillik xohlaydigan talabalar uchun."
        },
        {
          title: "Jiddiy mustaqil o'rganuvchilar va oilalar",
          description: "Aniq kurs yo'nalishi, kuchliroq ishonch va yaxshiroq yordamni xohlaydiganlar uchun."
        }
      ]
    },
    whatUsersLearn: {
      title: "Foydalanuvchilar nimalarni o'rganadi",
      body:
        "ERA vaqt o'tishi bilan mashq qilish, qo'llash va yaxshilash mumkin bo'lgan foydali ko'nikmalar atrofida qurilgan. Maqsad faqat dars ko'rish emas, balki o'rganilgan narsani tushunish va ishlata olishdir.",
      items: [
        "AI asoslari va amaliy AI ish jarayonlari",
        "Loyiha asosida muammo yechish va bosqichma-bosqich fikrlash",
        "Aniqroq raqamli o'qish odatlari va o'quv ritmi",
        "Yo'naltirilgan dars, mashq va takrorlash orqali o'sadigan ko'nikmalar"
      ]
    },
    whyChooseEra: {
      title: "Nega ERA ni tanlash kerak",
      body:
        "Foydalanuvchilar yo'lni tushuna olsa, keyingi qadamni ko'ra olsa va tajriba puxta ishlab chiqilganini his qilsa, platformaga ko'proq ishonadi. ERA aynan shu g'oya atrofida qurilgan.",
      points: [
        {
          title: "Avval aniqlik",
          description: "Darslar, yo'nalishlar va natijalar tushunishni osonlashtiradigan usulda ko'rsatiladi."
        },
        {
          title: "Amaliy o'rganish",
          description: "Kurslar faqat nazariyaga emas, balki haqiqiy qo'llashga ham e'tibor beradi."
        },
        {
          title: "Yo'naltirilgan tuzilma",
          description: "ERA foydalanuvchilarga kamroq taxmin va ko'proq ishonch bilan harakat qilishga yordam beradi."
        }
      ]
    },
    teachingStyle: {
      title: "Bizning o'qitish uslubimiz",
      body:
        "ERA yo'naltirilgan o'qish usuliga amal qiladi. Jarayonni sodda ushlaymiz: mos darajadan boshlang, maqsadli darslar orqali o'rganing, maqsadli mashq qiling va ko'rinadigan keyingi qadam bilan davom eting.",
      steps: [
        "Qayerdan boshlashni taxmin qilmay, mos darajadan boshlang.",
        "Katta yo'nalish ichidagi qisqa va maqsadli darslar orqali o'rganing.",
        "Misollar, loyihalar va amaliy vazifalar orqali mashq qiling.",
        "Ko'rinadigan progress va aniqroq keyingi qadam bilan davom eting."
      ]
    },
    support: {
      title: "Aloqa, support va hamjamiyat",
      body:
        "Foydalanuvchi savolni qayerga berishni va yordamni qanday olishni bilsa, o'qish yaxshiroq ishlaydi. ERA platforma bo'ylab aniq aloqa usullari va sodda yo'l-yo'riq bilan support berishga mo'ljallangan.",
      communityNote:
        "Foydalanuvchilar public sahifalarda ERA Guide dan ham foydalanib, navigatsiya, login, kurslar va asosiy platforma savollari bo'yicha tez yordam olishi mumkin.",
      supportEmailLabel: "Support email"
    }
  }
};

export function getAboutPageContent(locale: Locale): AboutPageContent {
  return locale === "uz" ? uzbekContent : englishContent;
}
