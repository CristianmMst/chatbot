"use client";

import { useMemo } from "react";
import AvatarViewer from "@/components/scene/avatar-viewer";
import { defaultFacialControls, type FacialControls } from "@/lib/avatar-face";
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

      <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
        {/* Header */}
        <header className="absolute left-6 top-6 sm:left-10 sm:top-10 flex items-center gap-3 opacity-60 transition-opacity hover:opacity-100">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10 backdrop-blur-xl shadow-lg shadow-black/20">
            <span className="text-[11px] font-black tracking-[0.2em] text-white">
              AV
            </span>
          </div>
          <span className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-300">
            Aura Voice
          </span>
        </header>

        {/* Status indicator - top right */}
        <div className="absolute right-6 top-6 sm:right-10 sm:top-10 pointer-events-auto flex items-center gap-3 rounded-full border border-white/5 bg-black/20 px-4 py-2 backdrop-blur-xl shadow-lg shadow-black/20 transition-all">
          <span className="relative flex h-2 w-2">
            <span
              className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${status === "listening" ? "animate-ping bg-cyan-400" : "bg-emerald-400"}`}
            />
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${status === "error" ? "bg-rose-500" : status === "unsupported" ? "bg-amber-400" : status === "speaking" ? "bg-fuchsia-400" : "bg-emerald-500"}`}
            />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-300">
            {getStatusCopy(status)}
          </span>
        </div>

        {/* Avatar Speech/Thought Bubble */}
        {(reply ||
          currentHint ||
          status === "processing" ||
          status === "speaking") && (
          <div className="absolute left-1/2 top-24 sm:top-10 z-20 w-[90%] sm:max-w-lg -translate-x-1/2 pointer-events-auto origin-bottom animate-in fade-in slide-in-from-bottom-4 zoom-in-95 duration-500">
            <div className="relative rounded-3xl border border-white/10 bg-zinc-900/95 p-5 sm:p-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)] ring-1 ring-fuchsia-500/20 backdrop-blur-xl transition-all">
              {/* Little triangle pointing to the avatar */}
              <div className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-b border-r border-fuchsia-500/30 bg-zinc-900 shadow-sm" />

              <div className="flex flex-col gap-3 relative z-10">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-fuchsia-400 animate-pulse shadow-[0_0_8px_rgba(232,121,249,0.8)]" />
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-fuchsia-300">
                    {status === "processing" ? "Pensando..." : "Aura"}
                  </span>
                </div>

                <p className="text-[15px] sm:text-base font-medium leading-relaxed text-zinc-100">
                  {status === "processing" && !reply
                    ? "Generando respuesta..."
                    : reply || "..."}
                </p>

                {currentHint && (
                  <div className="mt-2 inline-flex items-center gap-2 self-start rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1.5">
                    <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-amber-400">
                      Pista
                    </span>
                    <span className="text-xs text-amber-200/90">
                      {currentHint}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Dialog Card - Bottom Left */}
        <div className="absolute bottom-6 left-6 sm:bottom-10 sm:left-10 w-full max-w-50 sm:max-w-xs flex flex-col gap-4 pointer-events-auto">
          {/* Main Card (Only Transcript now) */}
          <div className="rounded-3xl border border-white/10 bg-black/40 p-5 text-white shadow-2xl backdrop-blur-2xl ring-1 ring-white/5 transition-opacity">
            <section className="group relative">
              <div className="mb-2 flex items-center gap-2">
                <div
                  className={`h-1.5 w-1.5 rounded-full ${status === "listening" ? "bg-cyan-400 animate-pulse" : "bg-cyan-400/50"}`}
                />
                <h3
                  className={`text-[10px] font-bold uppercase tracking-[0.25em] ${status === "listening" ? "text-cyan-400" : "text-cyan-400/50"}`}
                >
                  {status === "listening" ? "Escuchando..." : "Tú dijiste"}
                </h3>
              </div>
              <p className="text-xs font-medium leading-relaxed text-zinc-200/90 line-clamp-3">
                {transcript ||
                  (status === "listening"
                    ? "Habla ahora..."
                    : "Presiona el micrófono para hablar.")}
              </p>
            </section>
          </div>

          {/* Helper & Replay Bar */}
          <div className="flex flex-col gap-3 rounded-3xl border border-white/5 bg-black/30 p-4 backdrop-blur-xl">
            <p className="text-[10px] font-medium leading-relaxed text-zinc-400">
              {helperMessage}
            </p>
            <button
              className="w-full rounded-full bg-white/10 py-2 text-[10px] font-bold uppercase tracking-wider text-zinc-200 transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30"
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
              Repetir Respuesta
            </button>
          </div>
        </div>

        {/* Center Microphone Button */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 sm:bottom-10 pointer-events-auto">
          <button
            aria-label={status === "listening" ? "Detener escucha" : "Hablar"}
            className="group relative flex h-20 w-20 items-center justify-center outline-none"
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
            {/* Outer animated rings for listening state */}
            {status === "listening" && (
              <>
                <div className="absolute inset-0 animate-ping rounded-full bg-cyan-400/30" />
                <div className="absolute -inset-4 animate-pulse rounded-full border border-cyan-400/20" />
              </>
            )}

            {/* Main Button Surface */}
            <div
              className={`relative flex h-full w-full items-center justify-center rounded-full border border-white/10 shadow-2xl backdrop-blur-2xl transition-all duration-300 ease-out group-hover:scale-105 group-active:scale-95 ${status === "listening" ? "bg-cyan-500/20 shadow-cyan-500/20 ring-1 ring-cyan-400/30" : status === "speaking" ? "bg-fuchsia-500/20 shadow-fuchsia-500/20 ring-1 ring-fuchsia-400/30" : "bg-white/5 hover:bg-white/10 hover:ring-1 hover:ring-white/20"}`}
            >
              {/* Inner glow */}
              <div className="absolute inset-0 rounded-full bg-linear-to-b from-white/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`relative z-10 transition-all duration-300 ${status === "listening" ? "text-cyan-300 scale-110 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]" : status === "speaking" ? "text-fuchsia-300 scale-100" : "text-zinc-300 group-hover:text-white group-hover:scale-110"}`}
              >
                {status === "speaking" ? (
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                ) : (
                  <>
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" x2="12" y1="19" y2="22" />
                  </>
                )}
              </svg>
            </div>
          </button>
        </div>
      </div>
    </>
  );
}
