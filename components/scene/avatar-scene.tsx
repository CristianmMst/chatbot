"use client";

import {
  Suspense,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  Center,
  OrbitControls,
  useAnimations,
  useGLTF,
} from "@react-three/drei";
import { Box3, MathUtils, Vector3 } from "three";
import type { AnimationClip, Group, Mesh, Object3D } from "three";
import {
  defaultFacialControls,
  facialTargetMap,
  speechTargetKeys,
  trackedFacialTargets,
  type FacialControls,
  type FacialTargetOverrides,
} from "@/lib/avatar-face";
import { siteConfig } from "@/lib/site";
import type { MouthCue, MouthCueValue } from "@/lib/lip-sync";
import type { SpeechVisemeProfile } from "@/components/home/use-speech-facial-animation";

type AvatarSceneProps = {
  analyserRef?: React.RefObject<AnalyserNode | null>;
  audioRef?: React.RefObject<HTMLAudioElement | null>;
  facialControls?: FacialControls;
  facialTargetOverrides?: FacialTargetOverrides;
  mouthCues?: MouthCue[];
};

type AvatarModelProps = AvatarSceneProps & {
  onFocusTargetChange?: (target: [number, number, number]) => void;
};

type MorphMesh = Mesh & {
  morphTargetDictionary: Record<string, number>;
  morphTargetInfluences: number[];
};

type IdleRotationTargetKey =
  | "head"
  | "neck"
  | "chest"
  | "spine"
  | "leftEye"
  | "rightEye"
  | "leftArm"
  | "rightArm"
  | "leftShoulder"
  | "rightShoulder"
  | "leftForeArm"
  | "rightForeArm"
  | "leftHand"
  | "rightHand";

type IdleRotationTarget = {
  object: Object3D;
  offset: { x: number; y: number; z: number };
};

type IdleRigTargets = Partial<Record<IdleRotationTargetKey, IdleRotationTarget>>;

const EMOTIONAL_DAMPING = 12;
const SPEECH_DAMPING = 35;
const AMPLITUDE_SMOOTHING = 0.6;
const JAW_OPEN_SCALE = 0.4;
const JAW_OPEN_MIN = 0.02;
const IDLE_BREATH_SPEED = 0.15;
const IDLE_HEAD_PITCH = 0.025;
const IDLE_HEAD_YAW = 0.035;
const IDLE_HEAD_ROLL = 0.012;
const IDLE_NECK_PITCH = 0.015;
const IDLE_CHEST_PITCH = 0.008;
const IDLE_SMILE = 0.12;
const IDLE_ARM_INWARD_YAW = 0.16;
const IDLE_ARM_DROP = 0.32;
const IDLE_ARM_ROLL = 0.06;
const IDLE_FOREARM_SWING = 0.005;
const IDLE_FOREARM_BEND = 0.22;
const IDLE_HAND_RELAX = 0.1;
const IDLE_EYE_YAW = 0.1;
const IDLE_EYE_PITCH = 0.05;
const IDLE_EYE_DAMPING = 2.5;
const IDLE_BLINK_CLOSE_DURATION = 0.09;
const IDLE_BLINK_OPEN_DURATION = 0.13;
const IDLE_DOUBLE_BLINK_CHANCE = 0.15;
const IDLE_EYE_RETARGET_MIN = 3.0;
const IDLE_EYE_RETARGET_MAX = 6.0;
const WEIGHT_SHIFT_SPEED = 0.18;
const WEIGHT_SHIFT_YAW = 0.025;
const WEIGHT_SHIFT_ROLL = 0.012;
const SHOULDER_COUNTER_ROLL = 0.01;
const CURIOUS_LOOK_MIN_INTERVAL = 8;
const CURIOUS_LOOK_MAX_INTERVAL = 15;
const CURIOUS_LOOK_DURATION = 4.0;

const JAW_CAP_BY_PROFILE: Record<SpeechVisemeProfile, number> = {
  closed: 0.08,
  open: 0.32,
  round: 0.22,
  wide: 0.18,
  soft: 0.2,
  rest: 0.08,
};

function getDampingLambda(targetName: string) {
  return speechTargetKeys.includes(
    targetName as (typeof speechTargetKeys)[number],
  )
    ? SPEECH_DAMPING
    : EMOTIONAL_DAMPING;
}

function getActiveMouthCue(mouthCues: MouthCue[], speechCurrentTime: number) {
  return (
    mouthCues.find(
      (cue) => speechCurrentTime >= cue.start && speechCurrentTime < cue.end,
    ) ?? null
  );
}

function getCuePose(cue: MouthCueValue): FacialTargetOverrides {
  switch (cue) {
    case "A":
      return { jawOpen: 0.03, mouthClose: 0.82 };
    case "B":
      return { jawOpen: 0.11, mouthStretchLeft: 0.18, mouthStretchRight: 0.18 };
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
      return { jawOpen: 0.15, mouthFunnel: 0.34 };
    case "F":
      return { jawOpen: 0.1, mouthFunnel: 0.44, mouthPucker: 0.42 };
    case "G":
      return {
        jawOpen: 0.05,
        mouthClose: 0.12,
        mouthUpperUpLeft: 0.1,
        mouthUpperUpRight: 0.1,
      };
    case "H":
      return { jawOpen: 0.18, mouthStretchLeft: 0.1, mouthStretchRight: 0.1 };
    default:
      return { jawOpen: 0.02, mouthClose: 0.12 };
  }
}

function computeAmplitude(analyser: AnalyserNode): number {
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);

  let sum = 0;
  for (let index = 0; index < bufferLength; index += 1) {
    sum += dataArray[index];
  }

  return sum / (bufferLength * 255);
}

function getSpeechProfile(
  targets: FacialTargetOverrides | undefined,
): SpeechVisemeProfile {
  if (!targets) {
    return "rest";
  }

  if ((targets.mouthPucker ?? 0) > 0.04 && (targets.jawOpen ?? 0) < 0.06) {
    return "closed";
  }

  if ((targets.mouthFunnel ?? 0) > 0.12 || (targets.mouthPucker ?? 0) > 0.08) {
    return "round";
  }

  if (
    (targets.mouthStretchLeft ?? 0) > 0.14 ||
    (targets.mouthStretchRight ?? 0) > 0.14
  ) {
    return "wide";
  }

  if (
    (targets.mouthLowerDownLeft ?? 0) > 0.06 ||
    (targets.mouthLowerDownRight ?? 0) > 0.06
  ) {
    return "open";
  }

  if (
    (targets.jawOpen ?? 0) > 0.07 ||
    (targets.mouthUpperUpLeft ?? 0) > 0.04 ||
    (targets.mouthUpperUpRight ?? 0) > 0.04
  ) {
    return "soft";
  }

  return "rest";
}

function createSafeSpeechOverrides(
  profile: SpeechVisemeProfile,
  baseTargets: FacialTargetOverrides | undefined,
  amplitudeJawOpen: number,
) {
  const nextTargets = { ...(baseTargets ?? {}) };
  const baseJawOpen = nextTargets.jawOpen ?? 0;
  const jawCap = JAW_CAP_BY_PROFILE[profile];

  nextTargets.jawOpen = Math.min(
    jawCap,
    Math.max(baseJawOpen, amplitudeJawOpen),
  );

  if (profile === "round") {
    nextTargets.mouthStretchLeft = 0;
    nextTargets.mouthStretchRight = 0;
    nextTargets.mouthLowerDownLeft = Math.min(
      nextTargets.mouthLowerDownLeft ?? 0,
      0.06,
    );
    nextTargets.mouthLowerDownRight = Math.min(
      nextTargets.mouthLowerDownRight ?? 0,
      0.06,
    );
  }

  if (profile === "wide") {
    nextTargets.mouthFunnel = 0;
    nextTargets.mouthPucker = 0;
    nextTargets.mouthUpperUpLeft = Math.min(
      nextTargets.mouthUpperUpLeft ?? 0,
      0.06,
    );
    nextTargets.mouthUpperUpRight = Math.min(
      nextTargets.mouthUpperUpRight ?? 0,
      0.06,
    );
  }

  if (profile === "open") {
    nextTargets.mouthPucker = 0;
    nextTargets.mouthFunnel = Math.min(nextTargets.mouthFunnel ?? 0, 0.08);
    nextTargets.mouthLowerDownLeft = Math.min(
      nextTargets.mouthLowerDownLeft ?? 0,
      0.12,
    );
    nextTargets.mouthLowerDownRight = Math.min(
      nextTargets.mouthLowerDownRight ?? 0,
      0.12,
    );
  }

  if (profile === "closed") {
    nextTargets.mouthLowerDownLeft = 0;
    nextTargets.mouthLowerDownRight = 0;
    nextTargets.mouthFunnel = 0;
    nextTargets.mouthPucker = Math.min(nextTargets.mouthPucker ?? 0, 0.08);
  }

  return nextTargets;
}

function getTrackTargetName(trackName: string) {
  return trackName.split(".")[0]?.trim() ?? "";
}

function clipTargetsExist(root: Object3D, clip: AnimationClip) {
  return clip.tracks.every((track) => {
    const targetName = getTrackTargetName(track.name);

    if (!targetName || targetName === root.name) {
      return true;
    }

    return root.getObjectByName(targetName) !== undefined;
  });
}

function clampControlValue(value: number | undefined) {
  return MathUtils.clamp(value ?? 0, 0, 1);
}

function randomBlinkInterval() {
  return MathUtils.randFloat(2.8, 5.6);
}

function randomEyeRetargetInterval() {
  return MathUtils.randFloat(IDLE_EYE_RETARGET_MIN, IDLE_EYE_RETARGET_MAX);
}

function randomEyeTarget() {
  return {
    pitch: MathUtils.randFloatSpread(IDLE_EYE_PITCH * 2),
    yaw: MathUtils.randFloatSpread(IDLE_EYE_YAW * 2),
  };
}

interface CuriousLook {
  startedAt: number;
  duration: number;
  yawTarget: number;
  pitchTarget: number;
  rollTarget: number;
}

interface CuriousPose {
  head: { x: number; y: number; z: number };
  neck: { x: number; y: number; z: number };
  chest: { x: number; y: number; z: number };
  spine: { x: number; y: number; z: number };
}

function easeInOutQuint(t: number) {
  return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
}

function easeOutQuint(t: number) {
  return 1 - Math.pow(1 - t, 5);
}

function randomCuriousInterval() {
  return MathUtils.randFloat(CURIOUS_LOOK_MIN_INTERVAL, CURIOUS_LOOK_MAX_INTERVAL);
}

function scheduleCuriousLook(elapsed: number): CuriousLook {
  const direction = Math.random() > 0.5 ? 1 : -1;
  const yawTarget = direction * MathUtils.randFloat(0.08, 0.15);
  const pitchTarget = MathUtils.randFloat(0.02, 0.06);
  const rollTarget = direction * MathUtils.randFloat(0.015, 0.035);

  return { startedAt: elapsed, duration: CURIOUS_LOOK_DURATION, yawTarget, pitchTarget, rollTarget };
}

function computeCuriousOffset(currentTime: number, look: CuriousLook | null): CuriousPose {
  const neutral: CuriousPose = {
    head: { x: 0, y: 0, z: 0 },
    neck: { x: 0, y: 0, z: 0 },
    chest: { x: 0, y: 0, z: 0 },
    spine: { x: 0, y: 0, z: 0 },
  };

  if (!look) return neutral;

  const elapsed = currentTime - look.startedAt;
  const t = MathUtils.clamp(elapsed / look.duration, 0, 1);

  let influence: number;
  if (t < 0.2) {
    influence = easeOutQuint(t / 0.2);
  } else if (t < 0.75) {
    influence = 1;
  } else {
    influence = 1 - easeInOutQuint((t - 0.75) / 0.25);
  }

  const headYaw = look.yawTarget * influence;
  const headPitch = look.pitchTarget * influence;
  const headRoll = look.rollTarget * influence;

  const neckYaw = look.yawTarget * 0.4 * influence;
  const neckPitch = look.pitchTarget * 0.3 * influence;
  const neckRoll = look.rollTarget * 0.35 * influence;

  const chestYaw = look.yawTarget * 0.15 * influence;
  const spineYaw = look.yawTarget * 0.08 * influence;

  return {
    head: { x: headPitch, y: headYaw, z: headRoll },
    neck: { x: neckPitch, y: neckYaw, z: neckRoll },
    chest: { x: 0, y: chestYaw, z: 0 },
    spine: { x: 0, y: spineYaw, z: 0 },
  };
}

function getBlinkInfluence(blinkElapsed: number | null) {
  if (blinkElapsed === null) {
    return 0;
  }

  if (blinkElapsed <= IDLE_BLINK_CLOSE_DURATION) {
    return MathUtils.smoothstep(blinkElapsed / IDLE_BLINK_CLOSE_DURATION, 0, 1);
  }

  const openElapsed = blinkElapsed - IDLE_BLINK_CLOSE_DURATION;

  if (openElapsed >= IDLE_BLINK_OPEN_DURATION) {
    return 0;
  }

  return 1 - MathUtils.smoothstep(openElapsed / IDLE_BLINK_OPEN_DURATION, 0, 1);
}

function findObjectByNameParts(root: Object3D, nameParts: string[]) {
  const lowerNameParts = nameParts.map((part) => part.toLowerCase());
  let match: Object3D | null = null;

  root.traverse((object) => {
    if (match) {
      return;
    }

    const normalizedName = object.name.toLowerCase();

    if (!normalizedName) {
      return;
    }

    if (lowerNameParts.some((part) => normalizedName.includes(part))) {
      match = object;
    }
  });

  return match;
}

function resolveIdleRigTargets(root: Object3D): IdleRigTargets {
  const head = root.getObjectByName("Head") ?? findObjectByNameParts(root, ["head", "streamoji_head"]);
  const neck = root.getObjectByName("Neck") ?? findObjectByNameParts(root, ["neck"]);
  const chest = root.getObjectByName("Spine2") ?? findObjectByNameParts(root, ["chest", "upperchest", "spine2", "spine_02"]);
  const spine = root.getObjectByName("Spine1") ?? root.getObjectByName("Spine") ?? findObjectByNameParts(root, ["spine1", "spine", "spine_01"]);
  const leftEye = root.getObjectByName("LeftEye") ?? findObjectByNameParts(root, ["lefteye", "eyeleft"]);
  const rightEye = root.getObjectByName("RightEye") ?? findObjectByNameParts(root, ["righteye", "eyeright"]);
  const leftArm = findObjectByNameParts(root, [
    "leftarm",
    "LeftArm",
    "leftarm",
    "upperarm_l",
    "larm",
    "leftupperarm",
    "mixamorigleftarm",
    "mixamorigleftupperarm",
  ]);
  const rightArm = findObjectByNameParts(root, [
    "rightarm",
    "RightArm",
    "rightarm",
    "upperarm_r",
    "rarm",
    "rightupperarm",
    "mixamorigrightarm",
    "mixamorigrightupperarm",
  ]);
  const leftShoulder = root.getObjectByName("LeftShoulder") ?? findObjectByNameParts(root, [
    "leftshoulder",
    "shoulder_l",
    "lshoulder",
    "mixamorigleftshoulder",
  ]);
  const rightShoulder = root.getObjectByName("RightShoulder") ?? findObjectByNameParts(root, [
    "rightshoulder",
    "shoulder_r",
    "rshoulder",
    "mixamorigrightshoulder",
  ]);
  const leftForeArm = root.getObjectByName("LeftForeArm") ?? findObjectByNameParts(root, [
    "leftforearm",
    "forearm_l",
    "lforearm",
    "leftlowerarm",
    "mixamorigleftforearm",
  ]);
  const rightForeArm = root.getObjectByName("RightForeArm") ?? findObjectByNameParts(root, [
    "rightforearm",
    "forearm_r",
    "rforearm",
    "rightlowerarm",
    "mixamorigrightforearm",
  ]);
  const leftHand = root.getObjectByName("LeftHand") ?? findObjectByNameParts(root, ["lefthand", "hand_l", "mixamoriglefthand"]);
  const rightHand = root.getObjectByName("RightHand") ?? findObjectByNameParts(root, ["righthand", "hand_r", "mixamorigrighthand"]);

  return Object.fromEntries(
    Object.entries({
      head,
      neck,
      chest,
      spine,
      leftEye,
      rightEye,
      leftArm,
      rightArm,
      leftShoulder,
      rightShoulder,
      leftForeArm,
      rightForeArm,
      leftHand,
      rightHand,
    })
      .filter(([, object]) => object)
      .map(([key, object]) => [key, { object, offset: { x: 0, y: 0, z: 0 } }]),
  ) as IdleRigTargets;
}

function applyRotationOffset(
  target: IdleRotationTarget | undefined,
  nextOffset: { x: number; y: number; z: number },
) {
  if (!target) {
    return;
  }

  target.object.rotation.x += nextOffset.x - target.offset.x;
  target.object.rotation.y += nextOffset.y - target.offset.y;
  target.object.rotation.z += nextOffset.z - target.offset.z;
  target.offset = nextOffset;
}

function collectMorphMeshes(root: Object3D) {
  const morphMeshes: MorphMesh[] = [];

  root.traverse((object) => {
    const mesh = object as Partial<MorphMesh>;

    if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) {
      return;
    }

    morphMeshes.push(mesh as MorphMesh);
  });

  return morphMeshes;
}

function getTargetInfluences(facialControls: FacialControls) {
  const influences = Object.fromEntries(
    trackedFacialTargets.map((target) => [target, 0]),
  ) as Record<string, number>;

  for (const [control, targets] of Object.entries(facialTargetMap) as Array<
    [keyof FacialControls, string[]]
  >) {
    const value = clampControlValue(facialControls[control]);

    for (const target of targets) {
      influences[target] = Math.max(influences[target] ?? 0, value);
    }
  }

  return influences;
}

function mergeTargetInfluences(
  facialControls: FacialControls,
  facialTargetOverrides: FacialTargetOverrides | undefined,
) {
  const influences = getTargetInfluences(facialControls);

  if (!facialTargetOverrides) {
    return influences;
  }

  for (const [target, value] of Object.entries(facialTargetOverrides)) {
    influences[target] = clampControlValue(value);
  }

  return influences;
}

function AvatarModel({
  analyserRef,
  audioRef,
  facialControls = defaultFacialControls,
  facialTargetOverrides,
  mouthCues,
  onFocusTargetChange,
}: AvatarModelProps) {
  const group = useRef<Group>(null);
  const idleRigTargetsRef = useRef<IdleRigTargets>({});
  const morphMeshesRef = useRef<MorphMesh[]>([]);
  const smoothedAmplitudeRef = useRef(0);
  const idleElapsedRef = useRef(0);
  const nextBlinkAtRef = useRef(randomBlinkInterval());
  const blinkStartedAtRef = useRef<number | null>(null);
  const doubleBlinkPendingRef = useRef(false);
  const nextEyeRetargetAtRef = useRef(randomEyeRetargetInterval());
  const idleEyeTargetRef = useRef(randomEyeTarget());
  const idleEyeCurrentRef = useRef({ pitch: 0, yaw: 0 });
  const curiousLookRef = useRef<CuriousLook | null>(null);
  const nextCuriousAtRef = useRef(randomCuriousInterval());
  const { scene, animations } = useGLTF(siteConfig.modelPath);
  const { actions } = useAnimations(animations, group);
  const compatibleClipName = useMemo(() => {
    return animations.find((clip) => clipTargetsExist(scene, clip))?.name;
  }, [animations, scene]);
  const notifyFocusTargetChange = useEffectEvent(
    (target: [number, number, number]) => {
      onFocusTargetChange?.(target);
    },
  );

  useEffect(() => {
    morphMeshesRef.current = collectMorphMeshes(scene);
    idleRigTargetsRef.current = resolveIdleRigTargets(scene);

    const bounds = new Box3().setFromObject(scene);
    const headObject =
      scene.getObjectByName("Head") ?? scene.getObjectByName("Streamoji_Head");

    if (!headObject) {
      return;
    }

    const headPosition = headObject.getWorldPosition(new Vector3());
    const alignedHeadY = headPosition.y - bounds.min.y;
    const alignedHeadZ = headPosition.z;

    notifyFocusTargetChange([0, alignedHeadY, alignedHeadZ]);
  }, [scene]);

  useEffect(() => {
    if (!compatibleClipName) {
      return;
    }

    const action = actions[compatibleClipName];

    if (!action) {
      return;
    }

    action.reset().fadeIn(0.35).play();

    return () => {
      action.fadeOut(0.25);
    };
  }, [actions, compatibleClipName]);

  useFrame((_, delta) => {
    let speechOverrides: FacialTargetOverrides = {};
    let idleBlink = 0;

    idleElapsedRef.current += delta;

    if (
      blinkStartedAtRef.current === null &&
      idleElapsedRef.current >= nextBlinkAtRef.current
    ) {
      if (doubleBlinkPendingRef.current) {
        doubleBlinkPendingRef.current = false;
      }
      blinkStartedAtRef.current = idleElapsedRef.current;
    }

    const blinkElapsed = blinkStartedAtRef.current === null
      ? null
      : idleElapsedRef.current - blinkStartedAtRef.current;

    idleBlink = getBlinkInfluence(blinkElapsed);

    if (
      blinkElapsed !== null &&
      blinkElapsed >= IDLE_BLINK_CLOSE_DURATION + IDLE_BLINK_OPEN_DURATION
    ) {
      if (!doubleBlinkPendingRef.current && Math.random() < IDLE_DOUBLE_BLINK_CHANCE) {
        doubleBlinkPendingRef.current = true;
        blinkStartedAtRef.current = idleElapsedRef.current + 0.08;
      } else {
        doubleBlinkPendingRef.current = false;
        blinkStartedAtRef.current = null;
        nextBlinkAtRef.current = idleElapsedRef.current + randomBlinkInterval();
      }
    }

    if (
      curiousLookRef.current === null &&
      idleElapsedRef.current >= nextCuriousAtRef.current
    ) {
      curiousLookRef.current = scheduleCuriousLook(idleElapsedRef.current);
    }

    if (
      curiousLookRef.current !== null &&
      idleElapsedRef.current > curiousLookRef.current.startedAt + curiousLookRef.current.duration
    ) {
      curiousLookRef.current = null;
      nextCuriousAtRef.current = idleElapsedRef.current + randomCuriousInterval();
    }

    const curiousOffset = computeCuriousOffset(idleElapsedRef.current, curiousLookRef.current);

    if (audioRef?.current && mouthCues && mouthCues.length > 0) {
      const currentTime = audioRef.current.currentTime;
      const activeCue = getActiveMouthCue(mouthCues, currentTime);
      if (activeCue) {
        speechOverrides = getCuePose(activeCue.value);
      }
    } else if (
      analyserRef?.current &&
      audioRef?.current &&
      !audioRef.current.paused
    ) {
      const rawAmplitude = computeAmplitude(analyserRef.current);
      smoothedAmplitudeRef.current =
        smoothedAmplitudeRef.current * AMPLITUDE_SMOOTHING +
        rawAmplitude * (1 - AMPLITUDE_SMOOTHING);
      const amplitudeJawOpen = Math.min(
        1,
        smoothedAmplitudeRef.current * JAW_OPEN_SCALE + JAW_OPEN_MIN,
      );
      const profile = getSpeechProfile(facialTargetOverrides);
      speechOverrides = createSafeSpeechOverrides(
        profile,
        facialTargetOverrides,
        amplitudeJawOpen,
      );
    } else {
      smoothedAmplitudeRef.current = 0;
    }

    const merged = mergeTargetInfluences(facialControls, {
      ...facialTargetOverrides,
      ...speechOverrides,
    });

    if (idleBlink > 0) {
      merged.eyeBlinkLeft = Math.max(merged.eyeBlinkLeft ?? 0, idleBlink);
      merged.eyeBlinkRight = Math.max(merged.eyeBlinkRight ?? 0, idleBlink);
    }

    merged.mouthSmileLeft = Math.max(merged.mouthSmileLeft ?? 0, IDLE_SMILE);
    merged.mouthSmileRight = Math.max(merged.mouthSmileRight ?? 0, IDLE_SMILE);

    if (idleElapsedRef.current >= nextEyeRetargetAtRef.current) {
      idleEyeTargetRef.current = randomEyeTarget();
      nextEyeRetargetAtRef.current = idleElapsedRef.current + randomEyeRetargetInterval();
    }

    const nextEyePitch = MathUtils.damp(
      idleEyeCurrentRef.current.pitch,
      idleBlink > 0.15 ? 0 : idleEyeTargetRef.current.pitch,
      IDLE_EYE_DAMPING,
      delta,
    );
    const nextEyeYaw = MathUtils.damp(
      idleEyeCurrentRef.current.yaw,
      idleBlink > 0.15 ? 0 : idleEyeTargetRef.current.yaw,
      IDLE_EYE_DAMPING,
      delta,
    );

    idleEyeCurrentRef.current = { pitch: nextEyePitch, yaw: nextEyeYaw };

    const breathPhase = idleElapsedRef.current * Math.PI * 2 * IDLE_BREATH_SPEED;
    const headPhase = idleElapsedRef.current;
    const idleRigTargets = idleRigTargetsRef.current;
    const softBreath = Math.sin(breathPhase);

    const weightShift = Math.sin(headPhase * WEIGHT_SHIFT_SPEED + 0.3)
      + Math.sin(headPhase * WEIGHT_SHIFT_SPEED * 0.67 + 1.8) * 0.4;

    const headMicroPitch = Math.sin(headPhase * 0.25) * 0.6
      + Math.sin(headPhase * 0.17 + 2.1) * 0.4;

    const headMicroYaw = Math.sin(headPhase * 0.22 + 1.5) * 0.5
      + Math.sin(headPhase * 0.13 + 0.8) * 0.5;

    const headMicroRoll = Math.sin(headPhase * 0.19 + 0.5) * 0.55
      + Math.sin(headPhase * 0.11 + 3.2) * 0.45;

    applyRotationOffset(
      idleRigTargets.spine,
      {
        x: softBreath * IDLE_CHEST_PITCH * 0.3,
        y: weightShift * WEIGHT_SHIFT_YAW * 0.4 + curiousOffset.spine.y,
        z: weightShift * WEIGHT_SHIFT_ROLL * 0.3 + curiousOffset.spine.z,
      },
    );
    applyRotationOffset(
      idleRigTargets.chest,
      {
        x: 0.02 + softBreath * IDLE_CHEST_PITCH,
        y: weightShift * WEIGHT_SHIFT_YAW * 0.65 + curiousOffset.chest.y,
        z: weightShift * WEIGHT_SHIFT_ROLL * 0.5 + curiousOffset.chest.z,
      },
    );
    applyRotationOffset(
      idleRigTargets.neck,
      {
        x: 0.01 + headMicroPitch * IDLE_NECK_PITCH * 0.65,
        y: headMicroYaw * IDLE_HEAD_YAW * 0.45 + curiousOffset.neck.y,
        z: headMicroRoll * IDLE_HEAD_ROLL * 0.55 + curiousOffset.neck.z,
      },
    );
    applyRotationOffset(
      idleRigTargets.head,
      {
        x: 0.01 + headMicroPitch * IDLE_HEAD_PITCH + curiousOffset.head.x,
        y: headMicroYaw * IDLE_HEAD_YAW + curiousOffset.head.y,
        z: -0.015 + headMicroRoll * IDLE_HEAD_ROLL + curiousOffset.head.z,
      },
    );
    applyRotationOffset(
      idleRigTargets.leftEye,
      { x: nextEyePitch, y: nextEyeYaw, z: 0 },
    );
    applyRotationOffset(
      idleRigTargets.rightEye,
      { x: nextEyePitch, y: nextEyeYaw, z: 0 },
    );
    applyRotationOffset(
      idleRigTargets.leftShoulder,
      {
        x: -0.06 + softBreath * SHOULDER_COUNTER_ROLL * 0.5,
        y: 0.03 - weightShift * WEIGHT_SHIFT_YAW * 0.25,
        z: 0.025,
      },
    );
    applyRotationOffset(
      idleRigTargets.rightShoulder,
      {
        x: -0.06 + softBreath * SHOULDER_COUNTER_ROLL * 0.5,
        y: -0.03 - weightShift * WEIGHT_SHIFT_YAW * 0.25,
        z: -0.025,
      },
    );
    applyRotationOffset(
      idleRigTargets.leftArm,
      {
        x: IDLE_ARM_DROP + softBreath * 0.008,
        y: IDLE_ARM_INWARD_YAW,
        z: IDLE_ARM_ROLL,
      },
    );
    applyRotationOffset(
      idleRigTargets.rightArm,
      {
        x: IDLE_ARM_DROP + softBreath * 0.008,
        y: -IDLE_ARM_INWARD_YAW,
        z: -IDLE_ARM_ROLL,
      },
    );
    applyRotationOffset(
      idleRigTargets.leftForeArm,
      {
        x: IDLE_FOREARM_BEND + softBreath * IDLE_FOREARM_SWING * 0.3,
        y: 0.015,
        z: 0.028,
      },
    );
    applyRotationOffset(
      idleRigTargets.rightForeArm,
      {
        x: IDLE_FOREARM_BEND + softBreath * IDLE_FOREARM_SWING * 0.3,
        y: -0.015,
        z: -0.028,
      },
    );
    applyRotationOffset(
      idleRigTargets.leftHand,
      {
        x: 0.02,
        y: 0.03,
        z: IDLE_HAND_RELAX,
      },
    );
    applyRotationOffset(
      idleRigTargets.rightHand,
      {
        x: 0.02,
        y: -0.03,
        z: -IDLE_HAND_RELAX,
      },
    );

    for (const mesh of morphMeshesRef.current) {
      for (const targetName of trackedFacialTargets) {
        const targetIndex = mesh.morphTargetDictionary[targetName];

        if (targetIndex === undefined) {
          continue;
        }

        // eslint-disable-next-line react-hooks/immutability
        mesh.morphTargetInfluences[targetIndex] = MathUtils.damp(
          mesh.morphTargetInfluences[targetIndex] ?? 0,
          merged[targetName] ?? 0,
          getDampingLambda(targetName),
          delta,
        );
      }
    }
  });

  return (
    <Center top>
      <group ref={group}>
        <primitive object={scene} />
      </group>
    </Center>
  );
}

useGLTF.preload(siteConfig.modelPath);

function SceneLights() {
  return (
    <>
      <hemisphereLight intensity={0.65} groundColor="#111827" color="#dbeafe" />
      <spotLight
        angle={0.24}
        intensity={2.2}
        penumbra={0.9}
        position={[4.5, 5, 4]}
      />
      <directionalLight
        color="#818cf8"
        intensity={1.6}
        position={[-4, 3, -2]}
      />
      <directionalLight color="#f0abfc" intensity={1.1} position={[3, -2, 3]} />
    </>
  );
}

export default function AvatarScene({
  analyserRef,
  audioRef,
  facialControls,
  facialTargetOverrides,
  mouthCues,
}: AvatarSceneProps) {
  const [focusTarget, setFocusTarget] = useState<[number, number, number]>([
    0, 1.64, 0.01,
  ]);

  return (
    <div className="absolute inset-0 bg-transparent">
      <Canvas camera={{ fov: 26, position: [0, 1.64, 3.15] }} dpr={[1, 1.5]}>
        <SceneLights />
        <Suspense fallback={null}>
          <AvatarModel
            analyserRef={analyserRef}
            audioRef={audioRef}
            facialControls={facialControls}
            facialTargetOverrides={facialTargetOverrides}
            mouthCues={mouthCues}
            onFocusTargetChange={setFocusTarget}
          />
        </Suspense>
        <OrbitControls
          enableDamping
          enablePan={false}
          enableZoom
          maxDistance={2.6}
          minDistance={1.35}
          maxPolarAngle={Math.PI / 1.85}
          minPolarAngle={Math.PI / 2.3}
          target={focusTarget}
        />
      </Canvas>
    </div>
  );
}
