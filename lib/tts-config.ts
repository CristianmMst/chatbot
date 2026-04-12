export type TtsProvider = "elevenlabs";

type TtsConfig = {
  apiKey: string | null;
  ffmpegBin: string | null;
  modelId: string;
  outputFormat: string;
  provider: TtsProvider;
  rhubarbBin: string | null;
  voiceId: string | null;
};

const DEFAULT_ELEVENLABS_MODEL_ID = "eleven_flash_v2_5";
const DEFAULT_ELEVENLABS_OUTPUT_FORMAT = "mp3_44100_128";

export function getTtsConfig(): TtsConfig {
  return {
    apiKey: process.env.ELEVENLABS_API_KEY ?? null,
    ffmpegBin: process.env.FFMPEG_BIN ?? null,
    modelId: process.env.ELEVENLABS_MODEL_ID ?? DEFAULT_ELEVENLABS_MODEL_ID,
    outputFormat: process.env.ELEVENLABS_OUTPUT_FORMAT ?? DEFAULT_ELEVENLABS_OUTPUT_FORMAT,
    provider: "elevenlabs",
    rhubarbBin: process.env.RHUBARB_BIN ?? null,
    voiceId: process.env.ELEVENLABS_VOICE_ID ?? null,
  };
}

export function getMissingTtsConfigMessage() {
  const config = getTtsConfig();

  if (!config.apiKey) {
    return "Falta configurar ELEVENLABS_API_KEY en el servidor.";
  }

  if (!config.voiceId) {
    return "Falta configurar ELEVENLABS_VOICE_ID en el servidor.";
  }

  return "La configuracion de ElevenLabs no esta completa.";
}
