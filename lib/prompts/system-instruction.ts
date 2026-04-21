import { readFileSync } from "node:fs";
import path from "node:path";

export type PromptMode = "conversation" | "qa";

const DEFAULT_MODE: PromptMode = "conversation";

const modeToFileName: Record<PromptMode, string> = {
  conversation: "conversacion.md",
  qa: "preguntas-respuestas.md",
};

const fileCache = new Map<string, string>();

function readPromptFile(relativePath: string): string {
  if (fileCache.has(relativePath)) {
    return fileCache.get(relativePath)!;
  }

  const absolutePath = path.join(process.cwd(), "prompts", relativePath);
  const content = readFileSync(absolutePath, "utf8").trim();

  if (!content) {
    throw new Error(`El archivo de prompt esta vacio: ${absolutePath}`);
  }

  fileCache.set(relativePath, content);
  return content;
}

export function normalizePromptMode(value: unknown): PromptMode {
  if (typeof value !== "string") {
    return DEFAULT_MODE;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "qa" ? "qa" : DEFAULT_MODE;
}

export function getSystemInstruction(mode: PromptMode): string {
  return [
    readPromptFile("01-contexto-general.md"),
    readPromptFile(path.join("modes", modeToFileName[mode])),
    readPromptFile("02-formato-salida.md"),
  ].join("\n\n");
}
