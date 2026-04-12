import { synthesizeSpeech } from "@/lib/tts-pipeline";
import { getMissingTtsConfigMessage, getTtsConfig } from "@/lib/tts-config";

type TtsRequestBody = {
  text?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as TtsRequestBody | null;
  const text = body?.text?.trim();

  if (!text) {
    return Response.json({ error: "Falta el texto para sintetizar." }, { status: 400 });
  }

  const config = getTtsConfig();

  if (!config.apiKey || !config.voiceId) {
    return Response.json({ error: getMissingTtsConfigMessage() }, { status: 500 });
  }

  try {
    const speech = await synthesizeSpeech(text);

    return Response.json(
      {
        audioBase64: speech.audioBase64,
        contentType: speech.contentType,
        mouthCues: speech.mouthCues,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "La sintesis de voz con ElevenLabs fallo.",
      },
      { status: 500 },
    );
  }
}
