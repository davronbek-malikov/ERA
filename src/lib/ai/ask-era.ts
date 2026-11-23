/*
 * Ask ERA AI — shared configuration (docs/ERA_CONTEXTUAL_AI.md).
 * Imported by the browser (to show actions) and by the server (to validate requests). The server is
 * authoritative: anything the browser sends is re-checked against this table and the user's real role.
 */

export type AskEraWorkspace = "student" | "teacher" | "admin";

export type AskEraAction = "ask" | "explain" | "example" | "translate" | "summarize";

export type AskEraSourceType = "lesson" | "assignment" | "reading" | "course" | "report" | "documentation";

export type AskEraLanguage = "uz" | "en" | "ru";

export const ASK_ERA_LIMITS = {
  /** Longest selection sent to the AI. Longer selections are trimmed in the browser with a notice. */
  maxSelection: 4000,
  /** Surrounding text the browser may add (it is untrusted and only used as a hint). */
  maxSurrounding: 1500,
  /** The user's own question for "Ask about this". */
  maxQuestion: 1000
} as const;

export const ASK_ERA_ACTIONS: AskEraAction[] = ["ask", "explain", "example", "translate", "summarize"];

/** Which actions each workspace offers for each kind of content. Edit here to change the menu. */
const ACTIONS_BY_SOURCE: Record<AskEraWorkspace, Partial<Record<AskEraSourceType, AskEraAction[]>>> = {
  student: {
    lesson: ["ask", "explain", "example", "translate", "summarize"],
    assignment: ["ask", "explain", "example", "translate"],
    reading: ["ask", "explain", "example", "translate", "summarize"]
  },
  teacher: {
    lesson: ["ask", "explain", "example", "translate", "summarize"],
    course: ["ask", "explain", "example", "translate", "summarize"],
    documentation: ["ask", "explain", "summarize", "translate"]
  },
  admin: {
    lesson: ["ask", "explain", "summarize", "translate"],
    report: ["ask", "explain", "summarize", "translate"],
    documentation: ["ask", "explain", "summarize", "translate"]
  }
};

export function askEraActions(workspace: AskEraWorkspace, sourceType: AskEraSourceType): AskEraAction[] {
  return ACTIONS_BY_SOURCE[workspace][sourceType] ?? [];
}

export function isAskEraAction(value: unknown): value is AskEraAction {
  return typeof value === "string" && (ASK_ERA_ACTIONS as string[]).includes(value);
}

export function isAskEraSourceType(value: unknown): value is AskEraSourceType {
  return value === "lesson" || value === "assignment" || value === "reading" || value === "course" || value === "report" || value === "documentation";
}

export const ASK_ERA_LABELS: Record<"en" | "uz", Record<AskEraAction, string> & { title: string; askPlaceholder: string; send: string; close: string; trimmed: string; translateTo: string; languages: Record<AskEraLanguage, string>; openAssistant: string; stop: string }> = {
  en: {
    title: "Ask ERA AI",
    ask: "Ask about this",
    explain: "Explain simply",
    example: "Give an example",
    translate: "Translate",
    summarize: "Summarize",
    askPlaceholder: "What do you want to know about this?",
    send: "Ask",
    close: "Close",
    trimmed: "Long selection: only the first 4,000 characters are sent.",
    translateTo: "Translate to",
    languages: { uz: "O'zbekcha", en: "English", ru: "Русский" },
    openAssistant: "Continue in the assistant",
    stop: "Stop"
  },
  uz: {
    title: "ERA AI dan so'rash",
    ask: "Bu haqida so'rash",
    explain: "Soddaroq tushuntirish",
    example: "Misol keltirish",
    translate: "Tarjima qilish",
    summarize: "Qisqacha mazmuni",
    askPlaceholder: "Bu haqida nimani bilmoqchisiz?",
    send: "So'rash",
    close: "Yopish",
    trimmed: "Uzun matn: faqat birinchi 4 000 belgi yuboriladi.",
    translateTo: "Qaysi tilga",
    languages: { uz: "O'zbekcha", en: "English", ru: "Русский" },
    openAssistant: "Yordamchida davom ettirish",
    stop: "To'xtatish"
  }
};

/** What the browser sends with a contextual request (validated again on the server). */
export type AskEraSelectionPayload = {
  action: AskEraAction;
  selectedText: string;
  sourceType: AskEraSourceType;
  sourceId?: string;
  surroundingText?: string;
  question?: string;
  targetLanguage?: AskEraLanguage;
};

/** Short text for the user's own bubble in the conversation. */
export function askEraBubble(payload: Pick<AskEraSelectionPayload, "action" | "selectedText" | "question" | "targetLanguage">, locale: "en" | "uz" = "en") {
  const t = ASK_ERA_LABELS[locale];
  const quote = payload.selectedText.length > 160 ? `${payload.selectedText.slice(0, 157)}…` : payload.selectedText;
  const label =
    payload.action === "ask" && payload.question
      ? payload.question
      : payload.action === "translate" && payload.targetLanguage
        ? `${t.translate} → ${t.languages[payload.targetLanguage]}`
        : t[payload.action];
  // Same shape as the stored turn ("label", blank line, "> quote"), so both render as a quote.
  return [label, "", `> ${quote.replace(/\s*\n+\s*/g, " ")}`].join(String.fromCharCode(10));
}
