import { CONFIG } from "@/lib/config";
import {
  GENERIC_BEHAVIORAL,
  GENERIC_CODING,
  GENERIC_DOMAIN,
  GENERIC_SYSTEM_DESIGN,
  profileFor,
} from "@/lib/companyKnowledge";
import type { Category, GeneratedQuestion, LLMProvider, QuestionGenInput } from "./types";

// Offline question generator: deterministic, free, no API key required.
// Uses each company's curated questions from companyKnowledge.ts, padded
// with the generic pools for unknown companies / missing categories.

const GENERIC_BY_CATEGORY: Record<Category, GeneratedQuestion[]> = {
  CODING: GENERIC_CODING,
  BEHAVIORAL: GENERIC_BEHAVIORAL,
  SYSTEM_DESIGN: GENERIC_SYSTEM_DESIGN,
  DOMAIN: GENERIC_DOMAIN,
};

const CATEGORY_ORDER: Category[] = ["CODING", "BEHAVIORAL", "SYSTEM_DESIGN", "DOMAIN"];

function pickForCategory(
  curatedPool: GeneratedQuestion[],
  category: Category,
  count: number,
  usedTitles: Set<string>,
): GeneratedQuestion[] {
  const picked: GeneratedQuestion[] = [];
  // Company-specific first, then generic pool, deduped by title.
  for (const q of [...curatedPool, ...GENERIC_BY_CATEGORY[category]]) {
    if (picked.length >= count) break;
    if (q.category === category && !usedTitles.has(q.title)) {
      picked.push(q);
      usedTitles.add(q.title);
    }
  }
  return picked;
}

export const curatedProvider: LLMProvider = {
  name: "curated",

  async generateQuestions(
    input: QuestionGenInput,
    perCategory = CONFIG.questionsPerCategory,
  ): Promise<GeneratedQuestion[]> {
    const profile = profileFor(input.companyName);
    const curatedPool = profile?.curated ?? [];
    const usedTitles = new Set<string>();
    const questions: GeneratedQuestion[] = [];

    for (const category of CATEGORY_ORDER) {
      const picked = pickForCategory(curatedPool, category, perCategory, usedTitles);
      for (const q of picked) questions.push(q);
    }

    // Never return an empty set (generic pools guarantee coverage).
    return questions;
  },
};
