/*
 * Study guide content (docs/ERA_STUDY_ROOM.md). One JSON document per language, stored on LessonStudyGuide.
 * Everything that comes from the model goes through `normalize*` here: unknown fields are dropped, text is
 * trimmed and capped, and missing pieces become empty, so a page never breaks on a strange model answer.
 */

export const STUDY_LANGUAGES = ["uz", "en"] as const;
export type StudyLanguage = (typeof STUDY_LANGUAGES)[number];
export const isStudyLanguage = (value: unknown): value is StudyLanguage => value === "uz" || value === "en";

export const QUESTION_LEVELS = ["EASY", "MEDIUM", "ADVANCED", "CHECKPOINT"] as const;
export type QuestionLevel = (typeof QUESTION_LEVELS)[number];

export type StudyQuestion = {
  id: string;
  level: QuestionLevel;
  /** "choice": pick one option (graded instantly). "open": written answer graded by AI, with an interview follow-up. */
  kind: "choice" | "open";
  prompt: string;
  options: string[];
  correct: number | null;
  explanation: string;
  /** What a good written answer contains (open questions; never shown before answering). */
  modelAnswer: string;
};

export type StudySection = { id: string; title: string; body: string; checkpoint: StudyQuestion[] };

export type StudyGuideContent = {
  title: string;
  briefing: string;
  outcomes: string[];
  keyPoints: string[];
  keyTerms: Array<{ term: string; definition: string }>;
  sections: StudySection[];
  questions: StudyQuestion[];
};

export const emptyContent = (): StudyGuideContent => ({ title: "", briefing: "", outcomes: [], keyPoints: [], keyTerms: [], sections: [], questions: [] });

const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\u0000/g, "").trim().slice(0, max) : "");
const list = (value: unknown, maxItems: number, maxLength: number) =>
  Array.isArray(value) ? value.map((item) => text(item, maxLength)).filter(Boolean).slice(0, maxItems) : [];

export function normalizeQuestion(raw: unknown, level: QuestionLevel, id: string): StudyQuestion | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const prompt = text(value.prompt ?? value.question, 1500);
  if (!prompt) return null;
  const options = list(value.options, 6, 400);
  const correctRaw = typeof value.correct === "number" ? value.correct : typeof value.correctIndex === "number" ? value.correctIndex : Number(value.correct);
  const isChoice = options.length >= 2 && Number.isInteger(correctRaw) && correctRaw >= 0 && correctRaw < options.length;
  return {
    id,
    level,
    kind: isChoice ? "choice" : "open",
    prompt,
    options: isChoice ? options : [],
    correct: isChoice ? correctRaw : null,
    explanation: text(value.explanation, 2000),
    modelAnswer: text(value.modelAnswer ?? value.answer, 3000)
  };
}

/** Rebuilds a valid guide from anything (a model answer, a teacher's edit). Ids are kept when valid. */
export function normalizeContent(raw: unknown): StudyGuideContent {
  if (!raw || typeof raw !== "object") return emptyContent();
  const value = raw as Record<string, unknown>;
  const seen = new Set<string>();
  const idFor = (candidate: unknown, fallback: string) => {
    const id = typeof candidate === "string" && /^[a-z0-9-]{1,40}$/i.test(candidate) && !seen.has(candidate) ? candidate : fallback;
    seen.add(id);
    return id;
  };
  const sections = (Array.isArray(value.sections) ? value.sections : []).slice(0, 20).flatMap((entry, index): StudySection[] => {
    if (!entry || typeof entry !== "object") return [];
    const section = entry as Record<string, unknown>;
    const title = text(section.title, 200);
    const body = text(section.body ?? section.content, 20_000);
    if (!title && !body) return [];
    const sectionId = idFor(section.id, `s${index + 1}`);
    const checkpoint = (Array.isArray(section.checkpoint) ? section.checkpoint : [])
      .slice(0, 4)
      .map((question, position) => normalizeQuestion(question, "CHECKPOINT", idFor((question as { id?: unknown })?.id, `${sectionId}-c${position + 1}`)))
      .filter((question): question is StudyQuestion => Boolean(question));
    return [{ id: sectionId, title: title || `${index + 1}`, body, checkpoint }];
  });
  const questions = (Array.isArray(value.questions) ? value.questions : []).slice(0, 30).flatMap((entry, index) => {
    const level = (entry as { level?: unknown })?.level;
    const normalizedLevel: QuestionLevel = level === "EASY" || level === "MEDIUM" || level === "ADVANCED" ? level : "MEDIUM";
    const question = normalizeQuestion(entry, normalizedLevel, idFor((entry as { id?: unknown })?.id, `q${index + 1}`));
    return question ? [question] : [];
  });
  return {
    title: text(value.title, 200),
    briefing: text(value.briefing, 4000),
    outcomes: list(value.outcomes, 10, 400),
    keyPoints: list(value.keyPoints, 15, 400),
    keyTerms: (Array.isArray(value.keyTerms) ? value.keyTerms : [])
      .slice(0, 20)
      .map((entry) => ({ term: text((entry as { term?: unknown })?.term, 120), definition: text((entry as { definition?: unknown })?.definition, 600) }))
      .filter((entry) => entry.term && entry.definition),
    sections,
    questions
  };
}

/** Every question of a guide by id (checkpoints included). */
export function questionIndex(content: StudyGuideContent) {
  const index = new Map<string, StudyQuestion>();
  for (const section of content.sections) for (const question of section.checkpoint) index.set(question.id, question);
  for (const question of content.questions) index.set(question.id, question);
  return index;
}

/** The guide as students see it: correct answers and model answers stay on the server until they answer. */
export function publicContent(content: StudyGuideContent) {
  const strip = (question: StudyQuestion) => ({ id: question.id, level: question.level, kind: question.kind, prompt: question.prompt, options: question.options });
  return {
    title: content.title,
    briefing: content.briefing,
    outcomes: content.outcomes,
    keyPoints: content.keyPoints,
    keyTerms: content.keyTerms,
    sections: content.sections.map((section) => ({ id: section.id, title: section.title, body: section.body, checkpoint: section.checkpoint.map(strip) })),
    questions: content.questions.map(strip)
  };
}
export type PublicStudyContent = ReturnType<typeof publicContent>;
export type PublicQuestion = PublicStudyContent["questions"][number];

/** Pulls the JSON object out of a model answer (tolerates ```json fences and text around it). */
export function parseModelJson(answer: string): unknown {
  const trimmed = answer.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function countQuestions(content: StudyGuideContent) {
  const by = { EASY: 0, MEDIUM: 0, ADVANCED: 0, CHECKPOINT: 0 } as Record<QuestionLevel, number>;
  for (const question of questionIndex(content).values()) by[question.level] += 1;
  return by;
}
