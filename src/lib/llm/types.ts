import { z } from "zod";

// Shared types for question generation. Add a new provider by implementing
// LLMProvider (see src/lib/llm/) and registering it in src/lib/llm/index.ts.

export const CATEGORIES = ["CODING", "BEHAVIORAL", "SYSTEM_DESIGN", "DOMAIN"] as const;
export type Category = (typeof CATEGORIES)[number];

export const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** One example test case: input -> expected output (optional explanation). */
export interface TestCaseDTO {
  input: string;
  expected: string;
  explanation?: string;
}

/** Public source used by the live company-research pass. */
export interface ResearchSource {
  title: string;
  url: string;
}

/** A fully-formed question produced by a generator (curated or LLM). */
export interface GeneratedQuestion {
  category: Category;
  title: string;
  prompt: string;
  difficulty: Difficulty;
  testCases: TestCaseDTO[];
  solution: string;
  /**
   * Optional editor skeleton per language, e.g. { python: "def twoSum(...)" }.
   * A provider that supplies this (but no verified test harness) gets a codepad
   * in freeform mode: the code runs, but nothing is asserted. Verified harnesses
   * live in src/lib/practice/specs.ts and take precedence.
   */
  starterCode?: Partial<Record<"python", string>>;
  /** Sources used to tailor this question, when live research was enabled. */
  researchSources?: ResearchSource[];
}

/** Everything a generator needs to produce company-specific questions. */
export interface QuestionGenInput {
  companyName: string;
  role?: string | null;
  /** e.g. ["CUDA", "GPU architecture"] – from the company knowledge base. */
  domains: string[];
  /** Detailed focus areas sent to the LLM. */
  focusAreas: string[];
}

/** Per-request generation overrides. Secrets are intentionally never persisted. */
export interface GenerateOptions {
  openAIKey?: string;
  provider?: "curated" | "openai";
}

/** Contract every question generator must implement. */
export interface LLMProvider {
  readonly name: string;
  generateQuestions(
    input: QuestionGenInput,
    perCategory?: number,
    options?: GenerateOptions,
  ): Promise<GeneratedQuestion[]>;
}

// ---------- zod schemas (validate LLM output before it touches the DB) ----------

export const testCaseSchema = z.object({
  input: z.string().min(1),
  expected: z.string().min(1),
  explanation: z.string().optional(),
});

export const generatedQuestionSchema = z.object({
  category: z.enum(CATEGORIES),
  title: z.string().min(1).max(200),
  prompt: z.string().min(1),
  difficulty: z.enum(DIFFICULTIES),
  testCases: z.array(testCaseSchema).max(8).default([]),
  solution: z.string().min(1),
  starterCode: z
    .object({ python: z.string().min(1).max(4000).optional() })
    .optional(),
});

/** The exact JSON shape we ask OpenAI to return. */
export const openAIResponseSchema = z.object({
  questions: z.array(generatedQuestionSchema).min(1).max(32),
});
