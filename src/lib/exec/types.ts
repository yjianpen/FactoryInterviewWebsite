import { z } from "zod";

// Types for the practice codepad: what languages a question can be solved in,
// the starter code shown in the editor, and the server-side test harness that
// decides pass/fail.
//
// HOW TO EXTEND WITH A NEW LANGUAGE:
//  1. Add its id to RUN_LANGUAGES + LANGUAGE_META below.
//  2. Add the key to `languagesSchema` (one line).
//  3. Implement a LanguageRuntime for it and register it in src/lib/exec/runner.ts.
//  4. Add `starter` + `harness` for that language to the questions in
//     src/lib/practice/specs.ts.

export const RUN_LANGUAGES = ["python", "cpp", "java"] as const;
export type RunLanguage = (typeof RUN_LANGUAGES)[number];

export const LANGUAGE_META: Record<RunLanguage, { label: string; fileExt: string }> = {
  python: { label: "Python 3", fileExt: "py" },
  cpp: { label: "C++ 20", fileExt: "cpp" },
  java: { label: "Java 21", fileExt: "java" },
};

/** Starter code (sent to the browser) + harness (server-side only). */
export const languageSpecSchema = z.object({
  /** Skeleton pre-filled in the editor. Never contains the answer. */
  starter: z.string().min(1),
  /**
   * Test harness appended server-side. Calls `case(label, lambda: fn(...), expected)`
   * for each test. Omit to allow running code without automated checking.
   */
  harness: z.string().min(1).optional(),
});

const languagesSchema = z.object({
  python: languageSpecSchema.optional(),
  cpp: languageSpecSchema.optional(),
  java: languageSpecSchema.optional(),
});

export const execSpecSchema = z.object({
  /** Human-readable entry point, e.g. "twoSum(nums, target) -> list[int]". */
  entry: z.string().max(300).optional(),
  /** Shown above the editor, e.g. "numpy is unavailable; use plain lists." */
  note: z.string().max(600).optional(),
  languages: languagesSchema,
});

export type LanguageSpec = z.infer<typeof languageSpecSchema>;
export type ExecSpec = z.infer<typeof execSpecSchema>;

/** Per-language info the client needs (harness deliberately excluded). */
export interface PracticeMeta {
  /** "checked" = real pass/fail; "freeform" = runs code, no assertions. */
  mode: "checked" | "freeform";
  entry?: string;
  note?: string;
  languages: RunLanguage[];
  starters: Partial<Record<RunLanguage, string>>;
}

export interface CaseResult {
  label: string;
  passed: boolean;
  expected: string;
  actual: string;
}

export interface RunResult {
  language: RunLanguage;
  mode: "checked" | "freeform";
  /** Infrastructure-level success: the code was compiled/started and observed. */
  ok: boolean;
  cases: CaseResult[];
  passed: number;
  total: number;
  allPassed: boolean;
  /** Program output with harness protocol lines removed. */
  stdout: string;
  stderr: string;
  compileError: string | null;
  /** The submitted code (or harness) blew up before/while producing results. */
  runtimeError: string | null;
  timedOut: boolean;
  truncated: boolean;
  exitCode: number | null;
  durationMs: number;
}

export interface RuntimeStatus {
  language: RunLanguage;
  label: string;
  available: boolean;
  version: string | null;
  /** Resolved executable (e.g. "python3") when available. */
  command: string | null;
  /** Actionable message when unavailable (e.g. how to install the toolchain). */
  hint: string | null;
}

export const runRequestSchema = z.object({
  language: z.enum(RUN_LANGUAGES),
  code: z.string().min(1, "Write some code first.").max(100_000, "Code is too large (100 KB limit)."),
});
