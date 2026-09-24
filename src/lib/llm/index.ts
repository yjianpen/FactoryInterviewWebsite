import { CONFIG } from "@/lib/config";
import { curatedProvider } from "./curated";
import { openAIProvider } from "./openai";
import type {
  GenerateOptions,
  GeneratedQuestion,
  LLMProvider,
  QuestionGenInput,
} from "./types";

// Provider registry / factory.
// HOW TO EXTEND: add a new provider (e.g. Anthropic) by implementing LLMProvider,
// then import it here and register it in `PROVIDERS` + the switch below.

const PROVIDERS: Record<string, LLMProvider> = {
  curated: curatedProvider,
  openai: openAIProvider,
};

export function resolveProvider(options: GenerateOptions = {}): LLMProvider {
  const requestKey = options.openAIKey?.trim();

  if (options.provider === "curated") return PROVIDERS.curated;

  // An explicitly entered key is an opt-in override for this generation, even
  // when the server normally runs in offline curated mode.
  if (requestKey) return PROVIDERS.openai;

  if (options.provider === "openai") {
    return CONFIG.hasOpenAIKey ? PROVIDERS.openai : PROVIDERS.curated;
  }

  switch (CONFIG.providerMode) {
    case "openai":
      return CONFIG.hasOpenAIKey ? PROVIDERS.openai : PROVIDERS.curated;
    case "curated":
      return PROVIDERS.curated;
    case "auto":
    default:
      // A request key is a one-time opt-in; otherwise use the server key or
      // stay offline with the existing curated generator.
      return CONFIG.hasOpenAIKey || requestKey ? PROVIDERS.openai : PROVIDERS.curated;
  }
}

/** Human-readable status for /api/status and the UI. */
export function providerStatus() {
  const provider = resolveProvider();
  return {
    provider: provider.name,
    providerMode: CONFIG.providerMode,
    hasOpenAIKey: CONFIG.hasOpenAIKey,
    model: CONFIG.openaiModel,
    webResearchEnabled:
      provider.name === "openai" && CONFIG.webResearchEnabled && CONFIG.hasOpenAIKey,
    researchModel: CONFIG.openaiResearchModel,
    questionsPerCategory: CONFIG.questionsPerCategory,
    // nice-to-know: this provider call intentionally routes the active provider;
    // if no OpenAI key, "openai" stays listed as installable.
    availableProviders: Object.keys(PROVIDERS),
  };
}

export async function generateQuestionSet(
  input: QuestionGenInput,
  options: GenerateOptions = {},
): Promise<{ source: string; questions: GeneratedQuestion[] }> {
  const provider = resolveProvider(options);
  const questions = await provider.generateQuestions(input, CONFIG.questionsPerCategory, options);
  const researched = questions.some((question) => (question.researchSources?.length ?? 0) > 0);
  return { source: researched ? "openai-web" : provider.name, questions };
}
