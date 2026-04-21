import { NextResponse } from "next/server";
import { generateRestrictedReply, sanitizeHistory, type ChatMessage } from "@/lib/domain-chat";
import { normalizePromptMode } from "@/lib/prompts/system-instruction";

type ChatRequestBody = {
  history?: ChatMessage[];
  message?: string;
  mode?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as ChatRequestBody | null;
  const message = body?.message?.trim();
  const mode = normalizePromptMode(body?.mode);
  const history = sanitizeHistory(body?.history);

  if (!message) {
    return NextResponse.json({ error: "Falta el mensaje del usuario." }, { status: 400 });
  }

  try {
    const structuredReply = await generateRestrictedReply(message, history, { mode });

    return NextResponse.json(structuredReply);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "La respuesta del proveedor LLM no pudo completarse.",
      },
      { status: 500 },
    );
  }
}
