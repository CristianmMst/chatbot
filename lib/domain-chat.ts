import { getLlmClient } from "@/lib/llm-client";
import { getLlmConfig } from "@/lib/llm-config";

export type ChatMessage = {
  content: string;
  role: "assistant" | "user";
};

export type StructuredReply = {
  mood: "friendly" | "neutral" | "serious";
  reply: string;
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

function normalizeTextValue(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (Array.isArray(value)) {
    const parts = value.map(normalizeTextValue).filter((item): item is string => item !== null);
    return parts.length > 0 ? parts.join(". ") : null;
  }

  return null;
}

function formatStructuredFields(parsed: Record<string, unknown>) {
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

    return {
      mood,
      reply,
    };
  } catch {
    return null;
  }
}

export function getMissingLlmConfigMessage() {
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

export async function generateRestrictedReply(
  message: string,
  history: ChatMessage[],
): Promise<StructuredReply> {
  const client = getLlmClient();

  if (!client) {
    throw new Error(getMissingLlmConfigMessage());
  }

  const config = getLlmConfig();
  const instructionRole = config.provider === "gemini" ? "system" : "developer";
  const completion = await client.chat.completions.create({
    model: config.model,
    temperature: 0.4,
    messages: [
      {
        role: instructionRole,
        content: [
          "Eres un asistente conversacional para voz llamado Miguel.",
          "Sigue la instruccion directa del usuario con la mayor fidelidad posible, salvo que sea insegura o imposible.",
          "Si el usuario pregunta tu nombre, quien eres o como debe llamarte, responde claramente que te llamas Miguel.",
          "Responde siempre en espanol, con tono natural y util para ser leido en voz alta.",
          "Por defecto responde de forma breve, pero si el usuario pide mas detalle, explicacion o una respuesta larga, concedelo.",
          "Si no sabes algo o te falta contexto, dilo con honestidad en lugar de inventar.",
          "No cambies de tema ni rechaces preguntas normales del usuario sin motivo.",
          "No uses markdown, listas largas ni bloques de codigo salvo que el usuario lo pida de forma explicita.",
          "Devuelve solo JSON valido con las claves reply y mood.",
          "mood debe ser friendly, neutral o serious.",
        ].join("\n\n"),
      },
      ...history.map((item) => ({ content: item.content, role: item.role })),
      {
        role: "user",
        content: message,
      },
    ],
    response_format: { type: "json_object" },
  });

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
    };
  }

  return structuredReply;
}
