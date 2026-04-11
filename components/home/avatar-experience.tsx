"use client";

import { useState } from "react";
import AvatarViewer from "@/components/scene/avatar-viewer";
import {
  defaultFacialControls,
  facialControlLabels,
  facialPresets,
  type FacialControls,
} from "@/lib/avatar-face";

const facialControlKeys = Object.keys(defaultFacialControls) as Array<keyof FacialControls>;

export default function AvatarExperience() {
  const [facialControls, setFacialControls] = useState(defaultFacialControls);

  function updateControl(control: keyof FacialControls, value: number) {
    setFacialControls((current) => ({
      ...current,
      [control]: value,
    }));
  }

  return (
    <>
      <div className="absolute inset-0 z-0">
        <AvatarViewer facialControls={facialControls} />
      </div>

      <aside className="pointer-events-auto absolute inset-x-4 bottom-28 z-20 sm:inset-x-auto sm:bottom-8 sm:right-8 sm:w-80">
        <section className="rounded-3xl border border-white/10 bg-black/35 p-4 text-white shadow-2xl shadow-black/30 backdrop-blur-2xl">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-300/80">
                Pruebas Faciales
              </p>
              <h2 className="mt-1 text-sm font-medium text-zinc-100">
                Control manual del rostro
              </h2>
            </div>
            <button
              className="rounded-full border border-white/10 px-3 py-1 text-[11px] font-medium text-zinc-300 transition hover:border-white/20 hover:text-white"
              onClick={() => setFacialControls(defaultFacialControls)}
              type="button"
            >
              Reset
            </button>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {facialPresets.map((preset) => (
              <button
                key={preset.label}
                className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:border-cyan-300/40 hover:bg-cyan-300/10 hover:text-white"
                onClick={() => setFacialControls(preset.controls)}
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
                    {facialControls[control].toFixed(2)}
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
                  value={facialControls[control]}
                />
              </label>
            ))}
          </div>
        </section>
      </aside>
    </>
  );
}
