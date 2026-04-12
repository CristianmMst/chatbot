"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { MouthCue } from "@/lib/lip-sync";

type VoiceStatus = "idle" | "listening" | "processing" | "speaking" | "error" | "unsupported";

type ConversationMessage = {
  content: string;
  role: "assistant" | "user";
};

type VoiceConversationState = {
  hasResolvedSupport: boolean;
  history: ConversationMessage[];
  isSupported: boolean;
  errorMessage: string | null;
  reply: string;
  mouthCues: MouthCue[];
  speechBoundarySupported: boolean;
  speechCharIndex: number;
  speechCurrentTime: number;
  speechProgress: number;
  speechStartedAt: number | null;
  speechText: string;
  startListening: () => void;
  status: VoiceStatus;
  stopAll: () => void;
  transcript: string;
};

type ChatReplyPayload = {
  mood: "friendly" | "neutral" | "serious";
  reply: string;
};

type TtsPayload = {
  audioBase64: string;
  contentType: string;
  mouthCues: MouthCue[];
};

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionAlternative = {
  transcript: string;
};

type SpeechRecognitionResult = {
  isFinal: boolean;
  0: SpeechRecognitionAlternative;
};

type SpeechRecognitionResultList = {
  [index: number]: SpeechRecognitionResult;
  length: number;
};

type SpeechRecognitionEvent = {
  resultIndex: number;
  results: SpeechRecognitionResultList;
};

type SpeechRecognitionErrorEvent = {
  error: string;
};

type SpeechRecognitionCtor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

function subscribeToBrowserFeatures() {
  return () => {};
}

function getRecognitionCtorSnapshot() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

function getHydrationSnapshot() {
  return true;
}

function getSpeechErrorMessage(error: string) {
  switch (error) {
    case "audio-capture":
      return "No pude acceder al microfono.";
    case "not-allowed":
      return "El navegador no tiene permiso para usar el microfono.";
    case "no-speech":
      return "No detecte voz. Intentalo de nuevo.";
    case "network":
      return "La transcripcion del navegador fallo por red.";
    default:
      return "La transcripcion por voz no pudo completarse.";
  }
}

async function requestChatReply(message: string, history: ConversationMessage[]) {
  const response = await fetch("/api/chat", {
    body: JSON.stringify({ history, message }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  const payload = (await response.json().catch(() => null)) as
    | ChatReplyPayload
    | { error?: string }
    | null;

  if (!response.ok || !payload || !("reply" in payload) || typeof payload.reply !== "string") {
    throw new Error(
      payload && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : "No pude obtener una respuesta valida del servidor.",
    );
  }

  return payload.reply;
}

async function requestSpeechAudio(text: string) {
  const response = await fetch("/api/tts", {
    body: JSON.stringify({ text }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;

    throw new Error(
      payload && typeof payload.error === "string"
        ? payload.error
        : "La voz sintetizada de ElevenLabs fallo.",
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | TtsPayload
    | { error?: string }
    | null;

  if (
    !payload ||
    !("audioBase64" in payload) ||
    typeof payload.audioBase64 !== "string" ||
    !("contentType" in payload) ||
    typeof payload.contentType !== "string" ||
    !("mouthCues" in payload) ||
    !Array.isArray(payload.mouthCues)
  ) {
    throw new Error("La respuesta de TTS no fue valida.");
  }

  return payload;
}

function decodeBase64ToBlob(base64: string, contentType: string) {
  const binaryString = window.atob(base64);
  const bytes = new Uint8Array(binaryString.length);

  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index);
  }

  return new Blob([bytes], { type: contentType });
}

export function useVoiceConversation(): VoiceConversationState {
  const recognitionCtor = useSyncExternalStore(
    subscribeToBrowserFeatures,
    getRecognitionCtorSnapshot,
    () => null,
  );
  const hasResolvedSupport = useSyncExternalStore(
    subscribeToBrowserFeatures,
    getHydrationSnapshot,
    () => false,
  );
  const isSupported =
    hasResolvedSupport &&
    recognitionCtor !== null &&
    typeof window !== "undefined" &&
    typeof window.Audio !== "undefined";
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [history, setHistory] = useState<ConversationMessage[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mouthCues, setMouthCues] = useState<MouthCue[]>([]);
  const [speechText, setSpeechText] = useState("");
  const [speechCharIndex, setSpeechCharIndex] = useState(0);
  const [speechCurrentTime, setSpeechCurrentTime] = useState(0);
  const [speechProgress, setSpeechProgress] = useState(0);
  const [speechStartedAt, setSpeechStartedAt] = useState<number | null>(null);
  const [speechBoundarySupported, setSpeechBoundarySupported] = useState(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const activeAudioUrlRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const finalTranscriptRef = useRef("");
  const shouldHandleResultRef = useRef(false);
  const statusRef = useRef<VoiceStatus>("idle");
  const historyRef = useRef<ConversationMessage[]>([]);

  const clearActiveAudioUrl = useCallback(() => {
    if (!activeAudioUrlRef.current) {
      return;
    }

    URL.revokeObjectURL(activeAudioUrlRef.current);
    activeAudioUrlRef.current = null;
  }, []);

  function resetSpeechState() {
    setMouthCues([]);
    setSpeechCharIndex(0);
    setSpeechCurrentTime(0);
    setSpeechProgress(0);
    setSpeechStartedAt(null);
    setSpeechBoundarySupported(false);
  }

  const stopCurrentAudio = useCallback(() => {
    if (!audioRef.current) {
      clearActiveAudioUrl();
      return;
    }

    audioRef.current.pause();
    audioRef.current.src = "";
    audioRef.current = null;
    clearActiveAudioUrl();
  }, [clearActiveAudioUrl]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    if (!recognitionCtor) {
      return;
    }

    const recognition = new recognitionCtor();
    recognition.lang = "es-ES";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let finalTranscript = finalTranscriptRef.current;
      let interimTranscript = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const chunk = result[0]?.transcript?.trim();

        if (!chunk) {
          continue;
        }

        if (result.isFinal) {
          finalTranscript = `${finalTranscript} ${chunk}`.trim();
        } else {
          interimTranscript = `${interimTranscript} ${chunk}`.trim();
        }
      }

      finalTranscriptRef.current = finalTranscript;
      setTranscript(`${finalTranscript} ${interimTranscript}`.trim());
    };

    recognition.onerror = (event) => {
      shouldHandleResultRef.current = false;
      setErrorMessage(getSpeechErrorMessage(event.error));
      setStatus(event.error === "not-allowed" ? "error" : "idle");
    };

    recognition.onend = () => {
      if (!shouldHandleResultRef.current) {
        return;
      }

      const nextTranscript = finalTranscriptRef.current.trim();
      shouldHandleResultRef.current = false;

      if (!nextTranscript) {
        if (statusRef.current === "listening") {
          setStatus("idle");
        }

        return;
      }

      setTranscript(nextTranscript);
      setStatus("processing");

      void (async () => {
        try {
          const nextReply = await requestChatReply(nextTranscript, historyRef.current);
          setReply(nextReply);
          setHistory((current) => {
            const nextHistory: ConversationMessage[] = [
              ...current,
              { content: nextTranscript, role: "user" },
              { content: nextReply, role: "assistant" },
            ];

            return nextHistory.slice(-6);
          });

          const speechPayload = await requestSpeechAudio(nextReply);
          const speechAudioBlob = decodeBase64ToBlob(
            speechPayload.audioBase64,
            speechPayload.contentType,
          );
          const audioUrl = URL.createObjectURL(speechAudioBlob);
          const audio = new Audio(audioUrl);

          stopCurrentAudio();
          activeAudioUrlRef.current = audioUrl;
          audioRef.current = audio;
          setSpeechText(nextReply);
          resetSpeechState();
          setMouthCues(speechPayload.mouthCues);

          audio.preload = "auto";
          audio.onplay = () => {
            setSpeechStartedAt(Date.now());
            setStatus("speaking");
          };
          audio.ontimeupdate = () => {
            const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
            const progress = duration > 0 ? Math.min(audio.currentTime / duration, 1) : 0;

            setSpeechCurrentTime(audio.currentTime);
            setSpeechProgress(progress);
            setSpeechCharIndex(Math.min(nextReply.length, Math.floor(nextReply.length * progress)));
          };
          audio.onended = () => {
            resetSpeechState();
            setStatus("idle");
            stopCurrentAudio();
          };
          audio.onerror = () => {
            resetSpeechState();
            setErrorMessage("La reproduccion del audio de ElevenLabs fallo.");
            setStatus("error");
            stopCurrentAudio();
          };

          await audio.play();
        } catch (error) {
          setErrorMessage(error instanceof Error ? error.message : "La respuesta del asistente fallo.");
          resetSpeechState();
          setStatus("error");
        }
      })();
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      recognition.stop();
      stopCurrentAudio();
      recognitionRef.current = null;
    };
  }, [recognitionCtor, stopCurrentAudio]);

  useEffect(() => {
    return () => {
      stopCurrentAudio();
    };
  }, [stopCurrentAudio]);

  function startListening() {
    if (!recognitionRef.current || !isSupported) {
      setStatus("unsupported");
      return;
    }

    stopCurrentAudio();
    finalTranscriptRef.current = "";
    shouldHandleResultRef.current = true;
    setErrorMessage(null);
    setReply("");
    setSpeechText("");
    resetSpeechState();
    setTranscript("");
    setStatus("listening");

    try {
      recognitionRef.current.start();
    } catch {
      setErrorMessage("La escucha ya estaba activa o no pudo iniciarse.");
      setStatus("error");
    }
  }

  function stopAll() {
    shouldHandleResultRef.current = false;
    recognitionRef.current?.stop();

    stopCurrentAudio();
    resetSpeechState();
    setStatus(isSupported ? "idle" : "unsupported");
  }

  const resolvedStatus = !hasResolvedSupport ? "idle" : isSupported ? status : "unsupported";

  return {
    errorMessage,
    hasResolvedSupport,
    history,
    isSupported,
    mouthCues,
    reply,
    speechCurrentTime,
    speechBoundarySupported,
    speechCharIndex,
    speechProgress,
    speechStartedAt,
    speechText,
    startListening,
    status: resolvedStatus,
    stopAll,
    transcript,
  };
}

export type { VoiceStatus };
