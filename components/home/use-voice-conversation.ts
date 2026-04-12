"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

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
  speechBoundarySupported: boolean;
  speechCharIndex: number;
  speechStartedAt: number | null;
  speechText: string;
  startListening: () => void;
  status: VoiceStatus;
  stopAll: () => void;
  transcript: string;
};

type ChatReplyPayload = {
  hasSufficientContext: boolean;
  inDomain: boolean;
  mood: "friendly" | "neutral" | "serious";
  reply: string;
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
    "speechSynthesis" in window;
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [history, setHistory] = useState<ConversationMessage[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [speechText, setSpeechText] = useState("");
  const [speechCharIndex, setSpeechCharIndex] = useState(0);
  const [speechStartedAt, setSpeechStartedAt] = useState<number | null>(null);
  const [speechBoundarySupported, setSpeechBoundarySupported] = useState(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const finalTranscriptRef = useRef("");
  const shouldHandleResultRef = useRef(false);
  const statusRef = useRef<VoiceStatus>("idle");
  const historyRef = useRef<ConversationMessage[]>([]);

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

          if (!("speechSynthesis" in window)) {
            setStatus("unsupported");
            return;
          }

          window.speechSynthesis.cancel();

          const utterance = new SpeechSynthesisUtterance(nextReply);
          utterance.lang = "es-ES";
          utterance.rate = 1;
          utterance.pitch = 1;

          const availableVoices = window.speechSynthesis
            .getVoices()
            .filter((voice) => voice.lang.toLowerCase().startsWith("es"));

          if (availableVoices[0]) {
            utterance.voice = availableVoices[0];
          }

          utterance.onstart = () => {
            setSpeechText(nextReply);
            setSpeechCharIndex(0);
            setSpeechStartedAt(Date.now());
            setSpeechBoundarySupported(false);
            setStatus("speaking");
          };

          utterance.onboundary = (event) => {
            if (typeof event.charIndex !== "number") {
              return;
            }

            setSpeechBoundarySupported(true);
            setSpeechCharIndex(event.charIndex);
          };

          utterance.onend = () => {
            setSpeechCharIndex(0);
            setSpeechStartedAt(null);
            setSpeechBoundarySupported(false);
            setStatus("idle");
          };

          utterance.onerror = () => {
            setErrorMessage("La voz sintetizada del navegador fallo.");
            setSpeechCharIndex(0);
            setSpeechStartedAt(null);
            setSpeechBoundarySupported(false);
            setStatus("error");
          };

          window.speechSynthesis.speak(utterance);
        } catch (error) {
          setErrorMessage(error instanceof Error ? error.message : "La respuesta del asistente fallo.");
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
      recognitionRef.current = null;
    };
  }, [recognitionCtor]);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    const handleVoicesChanged = () => {
      window.speechSynthesis.getVoices();
    };

    window.speechSynthesis.addEventListener("voiceschanged", handleVoicesChanged);
    handleVoicesChanged();

    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", handleVoicesChanged);
      window.speechSynthesis.cancel();
    };
  }, []);

  function startListening() {
    if (!recognitionRef.current || !isSupported) {
      setStatus("unsupported");
      return;
    }

    window.speechSynthesis.cancel();
    finalTranscriptRef.current = "";
    shouldHandleResultRef.current = true;
    setErrorMessage(null);
    setReply("");
    setSpeechText("");
    setSpeechCharIndex(0);
    setSpeechStartedAt(null);
    setSpeechBoundarySupported(false);
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

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    setSpeechCharIndex(0);
    setSpeechStartedAt(null);
    setSpeechBoundarySupported(false);
    setStatus(isSupported ? "idle" : "unsupported");
  }

  const resolvedStatus = !hasResolvedSupport ? "idle" : isSupported ? status : "unsupported";

  return {
    errorMessage,
    hasResolvedSupport,
    history,
    isSupported,
    reply,
    speechBoundarySupported,
    speechCharIndex,
    speechStartedAt,
    speechText,
    startListening,
    status: resolvedStatus,
    stopAll,
    transcript,
  };
}

export type { VoiceStatus };
