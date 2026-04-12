export type LlmProvider = "custom" | "gemini" | "groq" | "openai" | "openrouter" | "together";

type LlmConfig = {
  apiKey: string | null;
  baseURL: string | undefined;
  model: string;
  provider: LlmProvider;
};

function normalizeProvider(value: string | undefined): LlmProvider {
  switch (value?.toLowerCase()) {
    case "gemini":
      return "gemini";
    case "groq":
      return "groq";
    case "openai":
      return "openai";
    case "openrouter":
      return "openrouter";
    case "together":
      return "together";
    default:
      return "gemini";
  }
}

function getDefaultBaseURL(provider: LlmProvider) {
  switch (provider) {
    case "gemini":
      return "https://generativelanguage.googleapis.com/v1beta/openai/";
    case "groq":
      return "https://api.groq.com/openai/v1";
    case "openrouter":
      return "https://openrouter.ai/api/v1";
    case "together":
      return "https://api.together.xyz/v1";
    default:
      return undefined;
  }
}

function getDefaultModel(provider: LlmProvider) {
  switch (provider) {
    case "gemini":
      return "gemini-2.5-flash";
    case "groq":
      return "llama-3.3-70b-versatile";
    case "openrouter":
      return "meta-llama/llama-3.3-70b-instruct";
    case "together":
      return "meta-llama/Llama-3.3-70B-Instruct-Turbo";
    case "openai":
      return "gpt-4o-mini";
    default:
      return "gpt-4o-mini";
  }
}

export function getLlmConfig(): LlmConfig {
  const provider = normalizeProvider(process.env.LLM_PROVIDER);

  return {
    apiKey:
      process.env.LLM_API_KEY ??
      process.env.GEMINI_API_KEY ??
      process.env.OPENAI_API_KEY ??
      null,
    baseURL: process.env.LLM_BASE_URL ?? getDefaultBaseURL(provider),
    model: process.env.LLM_MODEL ?? getDefaultModel(provider),
    provider,
  };
}
