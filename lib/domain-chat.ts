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

function formatStructuredFields(parsed: Record<string, unknown>) {
  const entries = Object.entries(parsed).filter(([key]) => {
    return !["reply", "respuesta", "answer", "message", "mood"].includes(key);
  });

  if (entries.length === 0) {
    return null;
  }

  const parts = entries
    .map(([key, value]) => {
      const normalizedKey = key.replace(/_/g, " ");

      if (Array.isArray(value)) {
        const items = value.filter((item) => item !== null && item !== undefined).map(String);

        if (items.length === 0) {
          return null;
        }

        return `${normalizedKey}: ${items.join(", ")}`;
      }

      if (typeof value === "object" && value !== null) {
        return `${normalizedKey}: ${JSON.stringify(value)}`;
      }

      if (value === null || value === undefined) {
        return null;
      }

      return `${normalizedKey}: ${String(value)}`;
    })
    .filter((part): part is string => Boolean(part));

  if (parts.length === 0) {
    return null;
  }

  return parts.join(". ");
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

  return config.provider === "custom"
    ? "Falta configurar LLM_API_KEY en el servidor."
    : `Falta configurar LLM_API_KEY para el proveedor ${config.provider}.`;
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
  const completion = await client.chat.completions.create({
    model: config.model,
    temperature: 0.2,
    messages: [
      {
        role: "developer",
        content: [
          "Eres un asistente conversacional para voz y tu nombre es Miguel.",
          "Si el usuario pregunta tu nombre o quien eres, responde que te llamas Miguel.",
          "Responde en espanol, con 1 o 2 frases breves y naturales para ser leidas en voz alta.",
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
