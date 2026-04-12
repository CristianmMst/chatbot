import OpenAI from "openai";
import { getLlmConfig } from "@/lib/llm-config";

export function getLlmClient() {
  const config = getLlmConfig();

  if (!config.apiKey) {
    return null;
  }

  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  });
}
