"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode } from "react";
import type { FacialControls, FacialTargetOverrides } from "@/lib/avatar-face";
import type { MouthCue } from "@/lib/lip-sync";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

type AvatarViewerProps = {
  analyserRef?: React.RefObject<AnalyserNode | null>;
  audioRef?: React.RefObject<HTMLAudioElement | null>;
  facialControls?: FacialControls;
  facialTargetOverrides?: FacialTargetOverrides;
  mouthCues?: MouthCue[];
};

const AvatarScene = dynamic(() => import("@/components/scene/avatar-scene"), {
  ssr: false,
  loading: () => <SceneLoadingState />,
});

class SceneErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override render() {
    if (this.state.hasError) {
      return <SceneErrorState />;
    }

    return this.props.children;
  }
}

function SceneFrame({ children }: ErrorBoundaryProps) {
  return (
    <div className="absolute inset-0 h-full w-full overflow-hidden bg-transparent">
      {children}
    </div>
  );
}

function SceneLoadingState() {
  return (
    <SceneFrame>
      <div
        aria-live="polite"
        className="flex h-full w-full items-center justify-center bg-zinc-950"
      >
        <div className="text-center opacity-50 transition-opacity">
          <div className="mx-auto h-12 w-12 animate-pulse rounded-full border border-white/10 bg-white/5" />
        </div>
      </div>
    </SceneFrame>
  );
}

function SceneErrorState() {
  return (
    <SceneFrame>
      <div className="flex h-full w-full items-center justify-center bg-zinc-950 px-8 text-center opacity-70">
        <div className="max-w-sm space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-400">
            Error de Renderizado
          </p>
        </div>
      </div>
    </SceneFrame>
  );
}

export default function AvatarViewer({
  analyserRef,
  audioRef,
  facialControls,
  facialTargetOverrides,
  mouthCues,
}: AvatarViewerProps) {
  return (
    <SceneErrorBoundary>
      <SceneFrame>
        <AvatarScene
          analyserRef={analyserRef}
          audioRef={audioRef}
          facialControls={facialControls}
          facialTargetOverrides={facialTargetOverrides}
          mouthCues={mouthCues}
        />
      </SceneFrame>
    </SceneErrorBoundary>
  );
}
