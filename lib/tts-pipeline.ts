import { type MouthCue } from "@/lib/lip-sync";
import { getTtsConfig } from "@/lib/tts-config";

export type SynthesizedSpeech = {
  audioBase64: string;
  contentType: string;
  mouthCues: MouthCue[];
};

async function synthesizeElevenLabsAudio(text: string) {
  const config = getTtsConfig();

  if (!config.apiKey || !config.voiceId) {
    throw new Error("La configuracion de ElevenLabs no esta completa.");
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
    throw new Error(errorText || "La sintesis de voz con ElevenLabs fallo.");
  }

  return {
    audioBuffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? "audio/mpeg",
  };
}

export async function synthesizeSpeech(text: string): Promise<SynthesizedSpeech> {
  const { audioBuffer, contentType } = await synthesizeElevenLabsAudio(text);

  return {
    audioBase64: audioBuffer.toString("base64"),
    contentType,
    mouthCues: [],
  };
}