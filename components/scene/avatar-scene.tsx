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
  isIdle?: boolean;
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
const IDLE_BREATH_SPEED = 0.22;
const IDLE_HEAD_PITCH = 0.05;
const IDLE_HEAD_YAW = 0.06;
const IDLE_HEAD_ROLL = 0.014;
const IDLE_NECK_PITCH = 0.018;
const IDLE_CHEST_PITCH = 0.012;
const IDLE_SPINE_SWAY = 0.01;
const IDLE_ARM_INWARD_YAW = 0.16;
const IDLE_ARM_DROP = 0.32;
const IDLE_ARM_ROLL = 0.06;
const IDLE_SHOULDER_SWING = 0.012;
const IDLE_FOREARM_SWING = 0.009;
const IDLE_FOREARM_BEND = 0.22;
const IDLE_HAND_RELAX = 0.1;
const IDLE_BLINK_CLOSE_DURATION = 0.085;
const IDLE_BLINK_OPEN_DURATION = 0.14;

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

function resetRotationOffsets(targets: IdleRigTargets) {
  for (const target of Object.values(targets)) {
    applyRotationOffset(target, { x: 0, y: 0, z: 0 });
  }
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
  isIdle = false,
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

  useEffect(() => {
    if (isIdle) {
      return;
    }

    resetRotationOffsets(idleRigTargetsRef.current);
  }, [isIdle]);

  useFrame((_, delta) => {
    let speechOverrides: FacialTargetOverrides = {};
    let idleBlink = 0;

    if (isIdle) {
      idleElapsedRef.current += delta;

      if (
        blinkStartedAtRef.current === null &&
        idleElapsedRef.current >= nextBlinkAtRef.current
      ) {
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
        blinkStartedAtRef.current = null;
        nextBlinkAtRef.current = idleElapsedRef.current + randomBlinkInterval();
      }
    } else {
      idleElapsedRef.current = 0;
      nextBlinkAtRef.current = randomBlinkInterval();
      blinkStartedAtRef.current = null;
    }

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

    const breathPhase = idleElapsedRef.current * Math.PI * 2 * IDLE_BREATH_SPEED;
    const headPhase = idleElapsedRef.current;
    const idleRigTargets = idleRigTargetsRef.current;
    const softBreath = Math.sin(breathPhase);
    const softShift = Math.sin(headPhase * 0.35 + 0.9);
    const warmHeadTilt = Math.sin(headPhase * 0.42 + 1.1);

    applyRotationOffset(
      idleRigTargets.spine,
      isIdle
        ? {
            x: softBreath * IDLE_CHEST_PITCH * 0.32,
            y: softShift * IDLE_SPINE_SWAY * 0.45,
            z: warmHeadTilt * IDLE_SPINE_SWAY * 0.18,
          }
        : { x: 0, y: 0, z: 0 },
    );
    applyRotationOffset(
      idleRigTargets.chest,
      isIdle
        ? {
            x: 0.03 + softBreath * IDLE_CHEST_PITCH,
            y: softShift * IDLE_SPINE_SWAY * 0.55,
            z: warmHeadTilt * IDLE_SPINE_SWAY * 0.26,
          }
        : { x: 0, y: 0, z: 0 },
    );
    applyRotationOffset(
      idleRigTargets.neck,
      isIdle
        ? {
            x: 0.012 + Math.sin(headPhase * 0.62 + 0.5) * IDLE_NECK_PITCH,
            y: Math.sin(headPhase * 0.45 + 1.4) * IDLE_HEAD_YAW * 0.28,
            z: warmHeadTilt * IDLE_HEAD_ROLL * 0.55,
          }
        : { x: 0, y: 0, z: 0 },
    );
    applyRotationOffset(
      idleRigTargets.head,
      isIdle
        ? {
            x: 0.016 + Math.sin(headPhase * 0.68) * IDLE_HEAD_PITCH * 0.55,
            y: Math.sin(headPhase * 0.4 + 1.2) * IDLE_HEAD_YAW * 0.48,
            z: -0.018 + Math.sin(headPhase * 0.5 + 2.1) * IDLE_HEAD_ROLL,
          }
        : { x: 0, y: 0, z: 0 },
    );
    applyRotationOffset(
      idleRigTargets.leftShoulder,
      isIdle
        ? {
            x: -0.08 + softBreath * IDLE_SHOULDER_SWING * 0.45,
            y: 0.035 + softShift * IDLE_SHOULDER_SWING * 0.12,
            z: 0.028,
          }
        : { x: 0, y: 0, z: 0 },
    );
    applyRotationOffset(
      idleRigTargets.rightShoulder,
      isIdle
        ? {
            x: -0.08 + softBreath * IDLE_SHOULDER_SWING * 0.45,
            y: -0.035 + softShift * IDLE_SHOULDER_SWING * 0.12,
            z: -0.028,
          }
        : { x: 0, y: 0, z: 0 },
    );
    applyRotationOffset(
      idleRigTargets.leftArm,
      isIdle
        ? {
            x: IDLE_ARM_DROP + softBreath * IDLE_SHOULDER_SWING * 0.25,
            y: IDLE_ARM_INWARD_YAW + softShift * IDLE_SHOULDER_SWING * 0.08,
            z: IDLE_ARM_ROLL,
          }
        : { x: 0, y: 0, z: 0 },
    );
    applyRotationOffset(
      idleRigTargets.rightArm,
      isIdle
        ? {
            x: IDLE_ARM_DROP + softBreath * IDLE_SHOULDER_SWING * 0.25,
            y: -IDLE_ARM_INWARD_YAW + softShift * IDLE_SHOULDER_SWING * 0.08,
            z: -IDLE_ARM_ROLL,
          }
        : { x: 0, y: 0, z: 0 },
    );
    applyRotationOffset(
      idleRigTargets.leftForeArm,
      isIdle
        ? {
            x: IDLE_FOREARM_BEND + IDLE_FOREARM_SWING * 0.6 + softBreath * IDLE_FOREARM_SWING * 0.35,
            y: 0.018,
            z: 0.032,
          }
        : { x: 0, y: 0, z: 0 },
    );
    applyRotationOffset(
      idleRigTargets.rightForeArm,
      isIdle
        ? {
            x: IDLE_FOREARM_BEND + softBreath * IDLE_FOREARM_SWING * 0.35,
            y: -0.018,
            z: -0.032,
          }
        : { x: 0, y: 0, z: 0 },
    );
    applyRotationOffset(
      idleRigTargets.leftHand,
      isIdle
        ? {
            x: 0.02,
            y: 0.03,
            z: IDLE_HAND_RELAX,
          }
        : { x: 0, y: 0, z: 0 },
    );
    applyRotationOffset(
      idleRigTargets.rightHand,
      isIdle
        ? {
            x: 0.02,
            y: -0.03,
            z: -IDLE_HAND_RELAX,
          }
        : { x: 0, y: 0, z: 0 },
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
  isIdle,
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
            isIdle={isIdle}
            mouthCues={mouthCues}
            onFocusTargetChange={setFocusTarget}
          />
        </Suspense>
        <OrbitControls
          enableDamping
          enablePan={false}
          enableZoom
          maxDistance={4.2}
          minDistance={1.35}
          maxPolarAngle={Math.PI / 1.85}
          minPolarAngle={Math.PI / 2.3}
          target={focusTarget}
        />
      </Canvas>
    </div>
  );
}
