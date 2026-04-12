import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { sanitizeMouthCues, type MouthCue } from "@/lib/lip-sync";
import { getTtsConfig } from "@/lib/tts-config";

const execFileAsync = promisify(execFile);

type RhubarbJsonOutput = {
  mouthCues?: MouthCue[];
};

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

async function generateRhubarbMouthCues(audioBuffer: Buffer, text: string) {
  const config = getTtsConfig();

  if (!config.ffmpegBin || !config.rhubarbBin) {
    return [];
  }

  const tempDir = await mkdtemp(join(tmpdir(), "aura-voice-"));
  const mp3Path = join(tempDir, "speech.mp3");
  const wavPath = join(tempDir, "speech.wav");
  const dialogPath = join(tempDir, "speech.txt");
  const outputPath = join(tempDir, "speech.json");

  try {
    await writeFile(mp3Path, audioBuffer);
    await writeFile(dialogPath, text, "utf8");

    await execFileAsync(config.ffmpegBin, ["-y", "-i", mp3Path, wavPath], {
      windowsHide: true,
    });

    await execFileAsync(config.rhubarbBin, [
      "--quiet",
      "--recognizer",
      "phonetic",
      "--dialogFile",
      dialogPath,
      "--exportFormat",
      "json",
      "--output",
      outputPath,
      wavPath,
    ], {
      windowsHide: true,
    });

    const output = JSON.parse(await readFile(outputPath, "utf8")) as RhubarbJsonOutput;
    return sanitizeMouthCues(output.mouthCues);
  } catch (error) {
    console.warn("[tts:rhubarb-failed]", error);
    return [];
  } finally {
    await rm(tempDir, { force: true, recursive: true }).catch(() => undefined);
  }
}

export async function synthesizeSpeech(text: string): Promise<SynthesizedSpeech> {
  const { audioBuffer, contentType } = await synthesizeElevenLabsAudio(text);
  const mouthCues = await generateRhubarbMouthCues(audioBuffer, text);

  return {
    audioBase64: audioBuffer.toString("base64"),
    contentType,
    mouthCues,
  };
}
