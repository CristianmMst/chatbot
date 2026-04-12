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

  const endpoint = new URL(`https://api.elevenlabs.io/v1/text-to-speech/${config.voiceId}`);
  endpoint.searchParams.set("output_format", config.outputFormat);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "audio/mpeg",
      "Content-Type": "application/json",
      "xi-api-key": config.apiKey,
    },
    body: JSON.stringify({
      language_code: "es",
      model_id: config.modelId,
      text,
      voice_settings: {
        similarity_boost: 0.75,
        stability: 0.45,
        style: 0.18,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");

    return Response.json(
      {
        error: errorText || "La sintesis de voz con ElevenLabs fallo.",
      },
      { status: response.status },
    );
  }

  return new Response(response.body, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": response.headers.get("content-type") ?? "audio/mpeg",
    },
  });
}
