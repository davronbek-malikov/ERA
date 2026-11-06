export const PRACTICE_LANGUAGES = [
  { value: "python", label: "Python" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" }
] as const;

export type PracticeLanguage = (typeof PRACTICE_LANGUAGES)[number]["value"];

export function isPracticeLanguage(value: string): value is PracticeLanguage {
  return PRACTICE_LANGUAGES.some((language) => language.value === value);
}

export function getPracticeLanguageLabel(language: PracticeLanguage) {
  return PRACTICE_LANGUAGES.find((item) => item.value === language)?.label ?? language;
}
