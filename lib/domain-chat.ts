import { getLlmClient } from "@/lib/llm-client";
import { getLlmConfig } from "@/lib/llm-config";
import { getSystemInstruction, normalizePromptMode, type PromptMode } from "@/lib/prompts/system-instruction";

export type ChatMessage = {
  content: string;
  role: "assistant" | "user";
};

export type StructuredReply = {
  mood: "friendly" | "neutral" | "serious";
  reply: string;
  hint: string | null;
};

export function sanitizeHistory(history: ChatMessage[] | undefined) {
  return (history ?? [])
    .filter(
      (item): item is ChatMessage =>
        (item.role === "assistant" || item.role === "user") && typeof item.content === "string",
    )
    .map((item) => ({
      content: item.content.trim().slice(0, 500),
      role: item.role,
    }))
    .filter((item) => item.content.length > 0)
    .slice(-6);
}

const replyFieldKeys = [
  "reply",
  "respuesta",
  "answer",
  "message",
  "texto",
  "contenido",
  "presentacion",
  "saludo",
  "introduccion",
  "descripcion",
];

function normalizeTextValue(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (Array.isArray(value)) {
    const parts: string[] = value
      .map(normalizeTextValue)
      .filter((item): item is string => item !== null);
    return parts.length > 0 ? parts.join(". ") : null;
  }

  return null;
}

function formatStructuredFields(parsed: Record<string, unknown>): string | null {
  const entries = Object.entries(parsed).filter(([key]) => !["mood"].includes(key));

  if (entries.length === 0) {
    return null;
  }

  const preferredParts = replyFieldKeys
    .map((key) => normalizeTextValue(parsed[key]))
    .filter((part): part is string => part !== null);

  if (preferredParts.length > 0) {
    return Array.from(new Set(preferredParts)).join(". ");
  }

  const parts = entries
    .map(([, value]) => normalizeTextValue(value))
    .filter((part): part is string => part !== null);

  if (parts.length === 0) {
    return null;
  }

  return Array.from(new Set(parts)).join(". ");
}

function parseStructuredReply(payload: string): StructuredReply | null {
  try {
    const parsed = JSON.parse(payload) as Partial<StructuredReply> & Record<string, unknown>;
    const reply =
      typeof parsed.reply === "string"
        ? parsed.reply
        : typeof (parsed as { respuesta?: unknown }).respuesta === "string"
          ? (parsed as { respuesta: string }).respuesta
          : typeof (parsed as { answer?: unknown }).answer === "string"
            ? (parsed as { answer: string }).answer
            : typeof (parsed as { message?: unknown }).message === "string"
              ? (parsed as { message: string }).message
              : formatStructuredFields(parsed);

    if (!reply) {
      return null;
    }

    const mood =
      parsed.mood === "friendly" || parsed.mood === "neutral" || parsed.mood === "serious"
        ? parsed.mood
        : "neutral";

    const hint = typeof parsed.hint === "string" ? parsed.hint : null;

    return {
      mood,
      reply,
      hint,
    };
  } catch {
    return null;
  }
}

export function getMissingLlmConfigMessage(): string {
  const config = getLlmConfig();

  switch (config.provider) {
    case "gemini":
      return "Falta configurar GEMINI_API_KEY o LLM_API_KEY para Gemini en el servidor.";
    case "custom":
      return "Falta configurar una clave LLM_API_KEY en el servidor.";
    default:
      return `Falta configurar LLM_API_KEY para el proveedor ${config.provider}.`;
  }
}

function getLlmErrorStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

function formatLlmError(error: unknown, provider: string): {
  publicMessage: string;
  status: number | null;
  technicalMessage: string;
} {
  const status = getLlmErrorStatus(error);
  const message = error instanceof Error ? error.message : "Error desconocido del proveedor LLM.";

  if (status === 429) {
    return {
      publicMessage:
        provider === "gemini"
          ? "Gemini rechazo la solicitud por limite de uso o cuota agotada. Revisa tu cuota o intenta de nuevo en unos minutos."
          : `El proveedor ${provider} rechazo la solicitud por limite de uso o cuota agotada. Intenta de nuevo en unos minutos.`,
      status,
      technicalMessage: message,
    };
  }

  if (status === 401 || status === 403) {
    return {
      publicMessage: `El proveedor ${provider} rechazo la solicitud por credenciales o permisos invalidos.`,
      status,
      technicalMessage: message,
    };
  }

  if (status !== null && status >= 500) {
    return {
      publicMessage: `El proveedor ${provider} fallo temporalmente al generar la respuesta.`,
      status,
      technicalMessage: message,
    };
  }

  return {
    publicMessage: `El proveedor ${provider} no pudo completar la respuesta.`,
    status,
    technicalMessage: message,
  };
}

export async function generateRestrictedReply(
  message: string,
  history: ChatMessage[],
  options?: { mode?: unknown },
): Promise<StructuredReply> {
  const client = getLlmClient();

  if (!client) {
    throw new Error(getMissingLlmConfigMessage());
  }

  const config = getLlmConfig();
  const instructionRole = config.provider === "gemini" ? "system" : "developer";
  const mode: PromptMode = normalizePromptMode(options?.mode);
  const systemInstruction = getSystemInstruction(mode);

  let completion;

  try {
    completion = await client.chat.completions.create({
      model: config.model,
      temperature: 0.4,
      messages: [
        {
          role: instructionRole,
          content: systemInstruction,
        },
        ...history.map((item) => ({ content: item.content, role: item.role })),
        {
          role: "user",
          content: message,
        },
      ],
      response_format: { type: "json_object" },
    });
  } catch (error) {
    const formattedError = formatLlmError(error, config.provider);

    console.error("[llm:request-failed]", {
      model: config.model,
      provider: config.provider,
      status: formattedError.status,
      technicalMessage: formattedError.technicalMessage,
    });

    throw new Error(formattedError.publicMessage);
  }

  const rawReply = completion.choices[0]?.message?.content ?? "";
  const structuredReply = parseStructuredReply(rawReply);

  if (!structuredReply) {
    console.error("[llm:parse-failed]", {
      model: config.model,
      provider: config.provider,
      rawReply,
    });

    return {
      mood: "neutral",
      reply: rawReply.trim() || "No pude interpretar una respuesta valida del modelo en este intento.",
      hint: null,
    };
  }

  return structuredReply;
}
