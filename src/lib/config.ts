// Central tuning knobs for the app. Adjust these instead of hardcoding
// constants scattered around the codebase.
//
// All values are overridable via environment variables so the app stays
// deployable without code changes.

const env = process.env;

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === "1" || value.toLowerCase() === "true";
}

function int(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

export const CONFIG = {
  /** How many questions to generate per category (CODING/BEHAVIORAL/SYSTEM_DESIGN/DOMAIN). */
  questionsPerCategory: Number(env.QUESTIONS_PER_CATEGORY ?? 2),

  /** OpenAI model used by the "openai" provider. */
  openaiModel: env.OPENAI_MODEL?.trim() || "gpt-4o-mini",

  /** Model used for the optional live interview-report research pass. */
  openaiResearchModel: env.OPENAI_RESEARCH_MODEL?.trim() || "gpt-4.1",

  /**
   * Provider selection mode:
   *  - "auto"    -> OpenAI if OPENAI_API_KEY is set, else built-in curated questions
   *  - "openai"  -> always use OpenAI (errors if no key)
   *  - "curated" -> always use the built-in curated generator (offline, free)
   */
  providerMode: (env.QUESTION_PROVIDER || "auto").trim().toLowerCase(),

  /** Whether an OpenAI API key is present. */
  hasOpenAIKey: Boolean(env.OPENAI_API_KEY?.trim()),

  /**
   * Search public web sources before OpenAI question generation. This only has
   * an effect when an OpenAI key is configured; curated mode stays offline.
   */
  webResearchEnabled: bool(env.OPENAI_WEB_RESEARCH, true),

  /** Maximum research text passed into the question-generation prompt. */
  maxResearchChars: int(env.MAX_RESEARCH_CHARS, 16_000, 4_000, 40_000),

  /** Show the "how to extend" hints on the dashboard (nice in local dev). */
  showExtras: bool(env.SHOW_EXTRAS, true),

  // ---------- practice codepad (runs real code) ----------

  /**
   * Master switch for POST /api/questions/:id/run.
   * Executing submitted code is safe enough for a local single-user app, but it
   * is NOT sandboxed, so it must be opted into explicitly in production.
   */
  codeExecutionEnabled: bool(env.CODE_EXECUTION_ENABLED, env.NODE_ENV !== "production"),

  /** Hard wall-clock limit for one run (ms). */
  runTimeoutMs: int(env.RUN_TIMEOUT_MS, 8_000, 1_000, 60_000),

  /** Per-stream output cap (chars) so a print loop cannot exhaust memory. */
  maxRunOutputChars: int(env.MAX_RUN_OUTPUT_CHARS, 64_000, 2_000, 500_000),
} as const;
