"use client";

import { useEffect, useMemo, useState } from "react";
import type { FacialTargetOverrides } from "@/lib/avatar-face";
import type { MouthCue, MouthCueValue } from "@/lib/lip-sync";

type SpeechFacialAnimationInput = {
  isSpeaking: boolean;
  mouthCues: MouthCue[];
  speechBoundarySupported: boolean;
  speechCharIndex: number;
  speechCurrentTime: number;
  speechProgress: number;
  speechStartedAt: number | null;
  speechText: string;
};

const AVERAGE_CHARACTERS_PER_SECOND = 14;

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function getPauseWeight(character: string | undefined) {
  if (!character) {
    return 0.18;
  }

  if (/[.,;:!?]/.test(character)) {
    return 0.08;
  }

  if (/\s/.test(character)) {
    return 0.12;
  }

  return 1;
}

function getEstimatedSpeechCharIndex(speechText: string, speechStartedAt: number | null, now: number) {
  if (!speechText || speechStartedAt === null) {
    return 0;
  }

  const elapsedSeconds = Math.max(0, now - speechStartedAt) / 1000;
  return Math.min(speechText.length, Math.floor(elapsedSeconds * AVERAGE_CHARACTERS_PER_SECOND));
}

function getCurrentCharacter(
  speechText: string,
  speechCharIndex: number,
  speechBoundarySupported: boolean,
  speechProgress: number,
  speechStartedAt: number | null,
  now: number,
) {
  const fallbackIndex = speechProgress > 0
    ? Math.min(speechText.length, Math.floor(speechText.length * speechProgress))
    : getEstimatedSpeechCharIndex(speechText, speechStartedAt, now);
  const index = speechBoundarySupported ? speechCharIndex : fallbackIndex;
  return speechText[index]?.toLowerCase() ?? "";
}

function getSpeechPose(character: string, phase: number): FacialTargetOverrides {
  const pulse = 0.86 + Math.sin(phase * 1.7) * 0.14;
  const swing = (Math.sin(phase * 0.9) + 1) / 2;
  const pauseWeight = getPauseWeight(character);

  if (!character || /\s|[.,;:!?]/.test(character)) {
    return {
      jawOpen: 0.06 * pauseWeight,
      mouthClose: 0.18,
    };
  }

  if (/[mbp]/.test(character)) {
    return {
      jawOpen: 0.05,
      mouthClose: 0.9,
    };
  }

  if (/[ou]/.test(character)) {
    return {
      jawOpen: 0.18 * pulse,
      mouthFunnel: 0.58 * pulse,
      mouthPucker: 0.42 * (0.9 + swing * 0.2),
    };
  }

  if (/[ei]/.test(character)) {
    return {
      jawOpen: 0.16 * pulse,
      mouthStretchLeft: 0.56 * (0.92 + swing * 0.16),
      mouthStretchRight: 0.56 * (0.92 + (1 - swing) * 0.16),
      mouthUpperUpLeft: 0.12,
      mouthUpperUpRight: 0.12,
    };
  }

  if (/[fv]/.test(character)) {
    return {
      jawOpen: 0.12 * pulse,
      mouthClose: 0.32,
      mouthUpperUpLeft: 0.22,
      mouthUpperUpRight: 0.22,
    };
  }

  if (/[aá]/.test(character)) {
    return {
      jawOpen: 0.44 * pulse,
      mouthLowerDownLeft: 0.26,
      mouthLowerDownRight: 0.26,
    };
  }

  return {
    jawOpen: 0.24 * pulse,
    mouthStretchLeft: 0.18 * swing,
    mouthStretchRight: 0.18 * (1 - swing),
  };
}

function getCuePose(cue: MouthCueValue): FacialTargetOverrides {
  switch (cue) {
    case "A":
      return {
        jawOpen: 0.03,
        mouthClose: 0.82,
      };
    case "B":
      return {
        jawOpen: 0.11,
        mouthStretchLeft: 0.18,
        mouthStretchRight: 0.18,
      };
    case "C":
      return {
        jawOpen: 0.22,
        mouthLowerDownLeft: 0.05,
        mouthLowerDownRight: 0.05,
      };
    case "D":
      return {
        jawOpen: 0.4,
        mouthLowerDownLeft: 0.1,
        mouthLowerDownRight: 0.1,
      };
    case "E":
      return {
        jawOpen: 0.15,
        mouthFunnel: 0.34,
      };
    case "F":
      return {
        jawOpen: 0.1,
        mouthFunnel: 0.44,
        mouthPucker: 0.42,
      };
    case "G":
      return {
        jawOpen: 0.05,
        mouthClose: 0.12,
        mouthUpperUpLeft: 0.1,
        mouthUpperUpRight: 0.1,
      };
    case "H":
      return {
        jawOpen: 0.18,
        mouthStretchLeft: 0.1,
        mouthStretchRight: 0.1,
      };
    default:
      return {
        jawOpen: 0.02,
        mouthClose: 0.12,
      };
  }
}

function getActiveMouthCue(mouthCues: MouthCue[], speechCurrentTime: number) {
  return mouthCues.find((cue) => speechCurrentTime >= cue.start && speechCurrentTime < cue.end) ?? null;
}

function sanitizeTargets(targets: FacialTargetOverrides) {
  return Object.fromEntries(
    Object.entries(targets)
      .filter(([, value]) => typeof value === "number")
      .map(([key, value]) => [key, clamp(value as number)]),
  ) as FacialTargetOverrides;
}

export function useSpeechFacialAnimation({
  isSpeaking,
  mouthCues,
  speechBoundarySupported,
  speechCharIndex,
  speechCurrentTime,
  speechProgress,
  speechStartedAt,
  speechText,
}: SpeechFacialAnimationInput) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isSpeaking) {
      return;
    }

    let frameId = 0;

    const tick = () => {
      setNow(Date.now());
      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [isSpeaking]);

  return useMemo(() => {
    if (!isSpeaking) {
      return {} as FacialTargetOverrides;
    }

    const phase = speechStartedAt === null ? 0 : Math.max(0, now - speechStartedAt) / 140;
    const activeMouthCue = getActiveMouthCue(mouthCues, speechCurrentTime);

    if (activeMouthCue) {
      return sanitizeTargets(getCuePose(activeMouthCue.value));
    }

    const currentCharacter = getCurrentCharacter(
      speechText,
      speechCharIndex,
      speechBoundarySupported,
      speechProgress,
      speechStartedAt,
      now,
    );

    return sanitizeTargets(getSpeechPose(currentCharacter, phase));
  }, [
    isSpeaking,
    mouthCues,
    now,
    speechBoundarySupported,
    speechCharIndex,
    speechCurrentTime,
    speechProgress,
    speechStartedAt,
    speechText,
  ]);
}
