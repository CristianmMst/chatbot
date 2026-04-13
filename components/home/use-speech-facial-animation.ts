"use client";

import { useEffect, useMemo, useState } from "react";
import type { FacialTargetOverrides } from "@/lib/avatar-face";

type SpeechFacialAnimationInput = {
  isSpeaking: boolean;
  speechBoundarySupported: boolean;
  speechCharIndex: number;
  speechProgress: number;
  speechStartedAt: number | null;
  speechText: string;
};

const AVERAGE_CHARACTERS_PER_SECOND = 14;

export type SpeechVisemeProfile = "closed" | "open" | "round" | "wide" | "soft" | "rest";

export type SpeechPose = {
  profile: SpeechVisemeProfile;
  targets: FacialTargetOverrides;
};

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

function createSpeechPose(profile: SpeechVisemeProfile, targets: FacialTargetOverrides): SpeechPose {
  return {
    profile,
    targets,
  };
}

function getSpeechPose(character: string, phase: number): SpeechPose {
  const pulse = 0.86 + Math.sin(phase * 1.7) * 0.14;
  const swing = (Math.sin(phase * 0.9) + 1) / 2;
  const pauseWeight = getPauseWeight(character);

  if (!character || /\s|[.,;:!?]/.test(character)) {
    return createSpeechPose("rest", {
      jawOpen: 0.04 * pauseWeight,
    });
  }

  if (/[mbp]/.test(character)) {
    return createSpeechPose("closed", {
      jawOpen: 0.03,
      mouthPucker: 0.06,
    });
  }

  if (/[ou]/.test(character)) {
    return createSpeechPose("round", {
      jawOpen: 0.13 * pulse,
      mouthFunnel: 0.24 * pulse,
      mouthPucker: 0.14 * (0.92 + swing * 0.12),
    });
  }

  if (/[ei]/.test(character)) {
    return createSpeechPose("wide", {
      jawOpen: 0.11 * pulse,
      mouthStretchLeft: 0.23 * (0.94 + swing * 0.1),
      mouthStretchRight: 0.23 * (0.94 + (1 - swing) * 0.1),
      mouthUpperUpLeft: 0.05,
      mouthUpperUpRight: 0.05,
    });
  }

  if (/[fv]/.test(character)) {
    return createSpeechPose("soft", {
      jawOpen: 0.08 * pulse,
      mouthUpperUpLeft: 0.08,
      mouthUpperUpRight: 0.08,
    });
  }

  if (/[aá]/.test(character)) {
    return createSpeechPose("open", {
      jawOpen: 0.24 * pulse,
      mouthLowerDownLeft: 0.11,
      mouthLowerDownRight: 0.11,
    });
  }

  return createSpeechPose("soft", {
    jawOpen: 0.14 * pulse,
    mouthStretchLeft: 0.1 * swing,
    mouthStretchRight: 0.1 * (1 - swing),
  });
}

function sanitizeTargets(targets: FacialTargetOverrides) {
  return Object.fromEntries(
    Object.entries(targets)
      .filter(([, value]) => typeof value === "number")
      .map(([key, value]) => [key, clamp(value as number)]),
  ) as FacialTargetOverrides;
}

function normalizeSpeechTargets(profile: SpeechVisemeProfile, targets: FacialTargetOverrides) {
  const nextTargets = { ...targets };

  if (profile === "round") {
    nextTargets.mouthStretchLeft = 0;
    nextTargets.mouthStretchRight = 0;
  }

  if (profile === "wide") {
    nextTargets.mouthFunnel = 0;
    nextTargets.mouthPucker = 0;
  }

  if (profile === "open") {
    nextTargets.mouthPucker = 0;
    nextTargets.mouthUpperUpLeft = Math.min(nextTargets.mouthUpperUpLeft ?? 0, 0.04);
    nextTargets.mouthUpperUpRight = Math.min(nextTargets.mouthUpperUpRight ?? 0, 0.04);
  }

  if (profile === "closed") {
    nextTargets.mouthLowerDownLeft = 0;
    nextTargets.mouthLowerDownRight = 0;
  }

  return nextTargets;
}

export function useSpeechFacialAnimation({
  isSpeaking,
  speechBoundarySupported,
  speechCharIndex,
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
    const currentCharacter = getCurrentCharacter(
      speechText,
      speechCharIndex,
      speechBoundarySupported,
      speechProgress,
      speechStartedAt,
      now,
    );

    const pose = getSpeechPose(currentCharacter, phase);
    return sanitizeTargets(normalizeSpeechTargets(pose.profile, pose.targets));
  }, [
    isSpeaking,
    now,
    speechBoundarySupported,
    speechCharIndex,
    speechProgress,
    speechStartedAt,
    speechText,
  ]);
}
