import {
  eraGuideFallbackAnswer,
  eraGuideFaqEntries,
  eraGuideQuickActions
} from "@/lib/era-guide/faq";
import type { EraGuideAnswer, EraGuideFaqEntry } from "@/lib/era-guide/types";

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function scoreEntry(question: string, entry: EraGuideFaqEntry) {
  let score = 0;

  for (const keyword of entry.keywords) {
    const normalizedKeyword = normalizeText(keyword);

    if (!normalizedKeyword) {
      continue;
    }

    if (question.includes(normalizedKeyword)) {
      score += normalizedKeyword.includes(" ") ? 4 : 2;
    }
  }

  return score;
}

export function findEraGuideAnswer(question: string): {
  answer: EraGuideAnswer;
  matchedEntry: EraGuideFaqEntry | null;
} {
  const normalizedQuestion = normalizeText(question);

  if (!normalizedQuestion) {
    return {
      answer: eraGuideFallbackAnswer,
      matchedEntry: null
    };
  }

  const rankedEntries = eraGuideFaqEntries
    .map((entry) => ({
      entry,
      score: scoreEntry(normalizedQuestion, entry)
    }))
    .sort((a, b) => b.score - a.score);

  const bestMatch = rankedEntries[0];

  if (!bestMatch || bestMatch.score <= 0) {
    return {
      answer: eraGuideFallbackAnswer,
      matchedEntry: null
    };
  }

  return {
    answer: bestMatch.entry.answer,
    matchedEntry: bestMatch.entry
  };
}

export function getEraGuideQuickActions() {
  return eraGuideQuickActions;
}
