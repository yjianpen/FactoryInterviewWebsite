import { CONFIG } from "@/lib/config";
import { curatedProvider } from "./curated";
import { openAIProvider } from "./openai";
import type { GeneratedQuestion, LLMProvider, QuestionGenInput } from "./types";

// Provider registry / factory.
// HOW TO EXTEND: add a new provider (e.g. Anthropic) by implementing LLMProvider,
// then import it here and register it in `PROVIDERS` + the switch below.

const PROVIDERS: Record<string, LLMProvider> = {
  curated: curatedProvider,
  openai: openAIProvider,
};

export function resolveProvider(): LLMProvider {
  switch (CONFIG.providerMode) {
    case "openai":
      if (!CONFIG.hasOpenAIKey) {
        throw new Error("QUESTION_PROVIDER is set to \"openai\" but OPENAI_API_KEY is missing. Add it to .env or switch QUESTION_PROVIDER to \"auto\".");
      }
      return PROVIDERS.openai;
    case "curated":
      return PROVIDERS.curated;
    case "auto":
    default:
      // Offline by default; transparently upgrade to OpenAI when a key exists.
      return CONFIG.hasOpenAIKey ? PROVIDERS.openai : PROVIDERS.curated;
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
    questionsPerCategory: CONFIG.questionsPerCategory,
    // nice-to-know: this provider call intentionally routes the active provider;
    // if no OpenAI key, "openai" stays listed as installable.
    availableProviders: Object.keys(PROVIDERS),
  };
}

export async function generateQuestionSet(
  input: QuestionGenInput,
): Promise<{ source: string; questions: GeneratedQuestion[] }> {
  const provider = resolveProvider();
  const questions = await provider.generateQuestions(input, CONFIG.questionsPerCategory);
  return { source: provider.name, questions };
}
