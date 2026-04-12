"use client";

import { useMemo, useState } from "react";
import AvatarViewer from "@/components/scene/avatar-viewer";
import {
  defaultFacialControls,
  facialControlLabels,
  facialPresets,
  type FacialControls,
} from "@/lib/avatar-face";
import { useVoiceConversation, type VoiceStatus } from "@/components/home/use-voice-conversation";
import { useSpeechFacialAnimation } from "@/components/home/use-speech-facial-animation";

const facialControlKeys = Object.keys(defaultFacialControls) as Array<keyof FacialControls>;

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

function getVoiceFacialControls(status: VoiceStatus, jawOpen: number): FacialControls {
  switch (status) {
    case "listening":
      return {
        smile: 0.1,
        browsUp: 0.35,
        browsDown: 0,
        blink: 0,
        jawOpen: 0.03,
        frown: 0,
      };
    case "processing":
      return {
        smile: 0,
        browsUp: 0.08,
        browsDown: 0,
        blink: 0,
        jawOpen: 0,
        frown: 0,
      };
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
  const [isFacialControlMinimized, setIsFacialControlMinimized] = useState(true);
  const [manualFacialControls, setManualFacialControls] = useState(defaultFacialControls);
  const {
    errorMessage,
    hasResolvedSupport,
    isSupported,
    reply,
    speechBoundarySupported,
    speechCharIndex,
    speechProgress,
    speechStartedAt,
    speechText,
    startListening,
    status,
    stopAll,
    transcript,
  } = useVoiceConversation();
  const speechTargetOverrides = useSpeechFacialAnimation({
    isSpeaking: status === "speaking",
    speechBoundarySupported,
    speechCharIndex,
    speechProgress,
    speechStartedAt,
    speechText,
  });
  const voiceFacialControls = useMemo(
    () => getVoiceFacialControls(status, status === "speaking" ? 0.08 : 0),
    [status],
  );
  const facialControls = status === "idle" || status === "unsupported"
    ? manualFacialControls
    : voiceFacialControls;
  const helperMessage = errorMessage ??
    (!hasResolvedSupport
      ? "Comprobando compatibilidad de voz del navegador..."
      : isSupported
        ? "Usa Chrome o Edge para la prueba mas estable. Pulsa el microfono y habla con naturalidad."
        : "Este navegador no expone una implementacion usable de Web Speech API para esta demo.");

  function updateControl(control: keyof FacialControls, value: number) {
    setManualFacialControls((current) => ({
      ...current,
      [control]: value,
    }));
  }

  return (
    <>
      <div className="absolute inset-0 z-0">
        <AvatarViewer facialControls={facialControls} facialTargetOverrides={speechTargetOverrides} />
      </div>

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-6 sm:p-10">
        <header className="flex justify-center sm:justify-start">
          <div className="flex items-center gap-3 opacity-40 transition-opacity hover:opacity-100">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10 backdrop-blur-md">
              <span className="text-[10px] font-bold tracking-[0.3em] text-white">AV</span>
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
              </section>
            </div>

            <div className="mt-4 flex items-center gap-4">
              <button
                aria-label={status === "listening" ? "Detener escucha" : "Hablar"}
                className="group relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/5 text-zinc-300 ring-1 ring-white/10 backdrop-blur-2xl transition-all hover:scale-105 hover:bg-white/10 hover:text-white hover:ring-white/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!hasResolvedSupport || !isSupported || status === "processing"}
                onClick={status === "listening" || status === "speaking" ? stopAll : startListening}
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

              <div className="text-[10px] text-zinc-400 leading-relaxed">
                {helperMessage}
              </div>
            </div>
          </div>
        </div>
      </div>

      <aside className="pointer-events-auto absolute inset-x-4 bottom-28 z-20 sm:inset-x-auto sm:bottom-8 sm:right-8 sm:w-80 transition-all duration-300">
        <section className="rounded-3xl border border-white/10 bg-black/35 p-4 text-white shadow-2xl shadow-black/30 backdrop-blur-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-300/80">
                Pruebas Faciales
              </p>
              <h2 className="mt-1 text-sm font-medium text-zinc-100">
                Control manual del rostro
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="rounded-full border border-white/10 px-3 py-1 text-[11px] font-medium text-zinc-300 transition hover:border-white/20 hover:text-white"
                onClick={() => setManualFacialControls(defaultFacialControls)}
                type="button"
                title="Resetear controles"
              >
                Reset
              </button>
              <button
                className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 text-zinc-300 transition hover:border-white/20 hover:text-white"
                onClick={() => setIsFacialControlMinimized(!isFacialControlMinimized)}
                type="button"
                title={isFacialControlMinimized ? "Maximizar panel" : "Minimizar panel"}
              >
                {isFacialControlMinimized ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                )}
              </button>
            </div>
          </div>

          <div className={`transition-all duration-300 overflow-hidden ${isFacialControlMinimized ? 'h-0 opacity-0 mt-0' : 'h-auto opacity-100 mt-4'}`}>
            <div className="mb-4 flex flex-wrap gap-2">
              {facialPresets.map((preset) => (
                <button
                  key={preset.label}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:border-cyan-300/40 hover:bg-cyan-300/10 hover:text-white"
                  onClick={() => setManualFacialControls(preset.controls)}
                  type="button"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {facialControlKeys.map((control) => (
                <label key={control} className="block">
                  <div className="mb-1 flex items-center justify-between text-xs text-zinc-300">
                    <span>{facialControlLabels[control]}</span>
                    <span className="tabular-nums text-zinc-500">
                      {manualFacialControls[control].toFixed(2)}
                    </span>
                  </div>
                  <input
                    aria-label={facialControlLabels[control]}
                    className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-cyan-300"
                    max="1"
                    min="0"
                    onChange={(event) => updateControl(control, Number(event.target.value))}
                    step="0.01"
                    type="range"
                    value={manualFacialControls[control]}
                  />
                </label>
              ))}
            </div>
          </div>
        </section>
      </aside>
    </>
  );
}
