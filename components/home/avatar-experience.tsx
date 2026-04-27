"use client";

import { useMemo } from "react";
import AvatarViewer from "@/components/scene/avatar-viewer";
import {
  defaultFacialControls,
  type FacialControls,
} from "@/lib/avatar-face";
import {
  useVoiceConversation,
  type VoiceStatus,
} from "@/components/home/use-voice-conversation";
import { useSpeechFacialAnimation } from "@/components/home/use-speech-facial-animation";

function getStatusCopy(status: VoiceStatus) {
  switch (status) {
    case "listening":
      return "Escuchando";
    case "processing":
      return "Procesando";
    case "speaking":
      return "Hablando";
    case "error":
      return "Error de voz";
    case "unsupported":
      return "No compatible";
    default:
      return "Lista para escuchar";
  }
}

function getVoiceFacialControls(
  status: VoiceStatus,
  jawOpen: number,
): FacialControls {
  switch (status) {
    case "listening":
      return {
        smile: 0,
        browsUp: 0.25,
        browsDown: 0,
        blink: 0,
        jawOpen: 0,
        frown: 0,
      };
    case "processing":
      return defaultFacialControls;
    case "speaking":
      return {
        smile: 0.2,
        browsUp: 0.12,
        browsDown: 0,
        blink: 0,
        jawOpen,
        frown: 0,
      };
    case "error":
      return {
        smile: 0,
        browsUp: 0,
        browsDown: 0.2,
        blink: 0,
        jawOpen: 0,
        frown: 0.25,
      };
    default:
      return defaultFacialControls;
  }
}

export default function AvatarExperience() {
  const {
    analyserRef,
    audioRef,
    canReplayLastReply,
    errorMessage,
    hasResolvedSupport,
    isSupported,
    mouthCues,
    reply,
    speechBoundarySupported,
    speechCharIndex,
    speechProgress,
    speechStartedAt,
    speechText,
    replayLastReply,
    startListening,
    status,
    stopAll,
    transcript,
    currentHint,
    lastAction,
  } = useVoiceConversation();
  const speechTargetOverrides = useSpeechFacialAnimation({
    isSpeaking: status === "speaking",
    speechBoundarySupported,
    speechCharIndex,
    speechProgress,
    speechStartedAt,
    speechText,
  });
  const facialControls = useMemo(
    () => getVoiceFacialControls(status, status === "speaking" ? 0.08 : 0),
    [status],
  );
  const helperMessage =
    errorMessage ??
    (!hasResolvedSupport
      ? "Comprobando compatibilidad de voz del navegador..."
      : isSupported
        ? "Usa Chrome o Edge para la prueba mas estable. Pulsa el microfono y habla con naturalidad."
        : "Este navegador no expone una implementacion usable de Web Speech API para esta demo.");

  return (
    <>
      <div className="absolute inset-0 z-0">
        <AvatarViewer
          action={lastAction}
          analyserRef={analyserRef}
          audioRef={audioRef}
          facialControls={facialControls}
          facialTargetOverrides={speechTargetOverrides}
          mouthCues={mouthCues}
          status={status}
        />
      </div>

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-6 sm:p-10">
        <header className="flex justify-center sm:justify-start">
          <div className="flex items-center gap-3 opacity-40 transition-opacity hover:opacity-100">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10 backdrop-blur-md">
              <span className="text-[10px] font-bold tracking-[0.3em] text-white">
                AV
              </span>
            </div>
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">
              Aura Voice
            </span>
          </div>
        </header>

        <div className="flex flex-col items-start justify-end gap-4 pb-4 sm:pb-8">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-white/5 bg-black/20 px-4 py-2 backdrop-blur-xl transition-all">
            <span className="relative flex h-2.5 w-2.5">
              <span
                className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${status === "listening" ? "animate-ping bg-cyan-300" : "bg-emerald-400"}`}
              />
              <span
                className={`relative inline-flex h-2.5 w-2.5 rounded-full ${status === "error" ? "bg-rose-500" : status === "unsupported" ? "bg-amber-400" : status === "speaking" ? "bg-fuchsia-400" : "bg-emerald-500"}`}
              />
            </span>
            <span className="text-xs font-medium tracking-wide text-zinc-300">
              {getStatusCopy(status)}
            </span>
          </div>

          <div className="pointer-events-auto w-full max-w-md rounded-3xl border border-white/10 bg-black/30 p-4 text-white shadow-2xl shadow-black/30 backdrop-blur-2xl">
            <div className="flex flex-col gap-3">
              <section className="space-y-1.5 rounded-2xl bg-white/5 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300/80">
                  Te escuche
                </p>
                <p className="text-xs text-zinc-100/90 line-clamp-2">
                  {transcript || "Todavia no hay transcripcion."}
                </p>
              </section>

              <section className="space-y-1.5 rounded-2xl bg-white/5 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-fuchsia-300/80">
                  Respuesta del modelo
                </p>
                <p className="text-xs text-zinc-100/90 line-clamp-3">
                  {reply || "La respuesta sintetizada aparecera aqui."}
                </p>
                {currentHint && (
                  <div className="mt-2 rounded-xl bg-amber-500/10 p-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-300/80">
                      Pista
                    </p>
                    <p className="text-xs text-amber-200/90">{currentHint}</p>
                  </div>
                )}
              </section>
            </div>

            <div className="mt-4 flex items-center gap-4">
              <button
                aria-label={
                  status === "listening" ? "Detener escucha" : "Hablar"
                }
                className="group relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/5 text-zinc-300 ring-1 ring-white/10 backdrop-blur-2xl transition-all hover:scale-105 hover:bg-white/10 hover:text-white hover:ring-white/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={
                  !hasResolvedSupport || !isSupported || status === "processing"
                }
                onClick={
                  status === "listening" || status === "speaking"
                    ? stopAll
                    : startListening
                }
                type="button"
              >
                <div className="absolute inset-0 rounded-full bg-white/5 opacity-0 blur-xl transition-opacity group-hover:opacity-100" />
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="relative z-10 transition-transform group-hover:scale-110"
                >
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" x2="12" y1="19" y2="22" />
                </svg>
              </button>

              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="text-[10px] leading-relaxed text-zinc-400">
                  {helperMessage}
                </div>
                <button
                  className="self-start rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={
                    !canReplayLastReply ||
                    status === "processing" ||
                    status === "listening"
                  }
                  onClick={() => {
                    void replayLastReply();
                  }}
                  type="button"
                >
                  Reproducir de nuevo
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

    </>
  );
}
