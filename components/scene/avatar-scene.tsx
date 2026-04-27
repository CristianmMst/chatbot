"use client";

import {
  Suspense,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  useAnimations,
  useGLTF,
} from "@react-three/drei";
import { Box3, LoopOnce, LoopRepeat, MathUtils, Vector3 } from "three";
import type { AnimationAction, Group, Mesh, Object3D } from "three";
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
import type { VoiceStatus } from "@/components/home/use-voice-conversation";

type AvatarSceneProps = {
  action?: string | null;
  analyserRef?: React.RefObject<AnalyserNode | null>;
  audioRef?: React.RefObject<HTMLAudioElement | null>;
  facialControls?: FacialControls;
  facialTargetOverrides?: FacialTargetOverrides;
  mouthCues?: MouthCue[];
  status?: VoiceStatus;
};

type AvatarModelProps = AvatarSceneProps & {
  onFocusTargetChange?: (target: [number, number, number]) => void;
};

type MorphMesh = Mesh & {
  morphTargetDictionary: Record<string, number>;
  morphTargetInfluences: number[];
};

type BaseAnimationState = {
  mode: "idle" | "playing" | "returning";
  currentSecondary: string | null;
  nextTriggerAt: number;
  cooldownEndAt: number;
};

type WeightedClipConfig = {
  name: string;
  weight: number;
};

const EMOTIONAL_DAMPING = 12;
const SPEECH_DAMPING = 35;
const AMPLITUDE_SMOOTHING = 0.6;
const JAW_OPEN_SCALE = 0.4;
const JAW_OPEN_MIN = 0.02;
const IDLE_BLINK_CLOSE_DURATION = 0.09;
const IDLE_BLINK_OPEN_DURATION = 0.13;
const IDLE_DOUBLE_BLINK_CHANCE = 0.15;

const IDLE_VARIANTS = [
  { name: "LookAway.001", weight: 5 },
  { name: "NeckStretching.001", weight: 3 },
  { name: "Petting.001", weight: 2 },
] satisfies WeightedClipConfig[];

const BASE_ANIMATION_CONFIG = {
  idle: "Idle.001",
  interval: { min: 8, max: 20 },
  fade: 0.5,
} as const;

const TRIGGERED_ACTION_MAP = {
  wave: "Waving",
  deny: "ShakingHeadNo",
} as const;

const TALKING_CLIP = "Talking";

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

function clampControlValue(value: number | undefined) {
  return MathUtils.clamp(value ?? 0, 0, 1);
}

function randomBlinkInterval() {
  return MathUtils.randFloat(2.8, 5.6);
}

function randomAnimationInterval() {
  return MathUtils.randFloat(
    BASE_ANIMATION_CONFIG.interval.min,
    BASE_ANIMATION_CONFIG.interval.max,
  );
}

function pickWeightedRandomClip(
  clips: readonly WeightedClipConfig[],
  exclude?: string,
): string {
  const available = exclude
    ? clips.filter((c) => c.name !== exclude)
    : [...clips];
  const totalWeight = available.reduce((sum, c) => sum + c.weight, 0);
  let random = Math.random() * totalWeight;

  for (const clip of available) {
    random -= clip.weight;
    if (random <= 0) return clip.name;
  }

  return available[available.length - 1]?.name ?? clips[0].name;
}

function createInitialBaseAnimationState(): BaseAnimationState {
  return {
    mode: "idle",
    currentSecondary: null,
    nextTriggerAt: randomAnimationInterval(),
    cooldownEndAt: 0,
  };
}

function scheduleNextBaseAnimation(state: BaseAnimationState, now: number) {
  state.nextTriggerAt = now + randomAnimationInterval();
}

function configureIdleAction(idleAction: AnimationAction) {
  idleAction.setLoop(LoopRepeat, Infinity);
  idleAction.clampWhenFinished = false;
  idleAction.enabled = true;
  idleAction.setEffectiveTimeScale(1);
  idleAction.setEffectiveWeight(1);
  idleAction.reset().play();
}

function prepareIdleReturn(idleAction: AnimationAction) {
  idleAction.enabled = true;
  idleAction.setEffectiveTimeScale(1);
  idleAction.setEffectiveWeight(1);
  idleAction.play();
}

function configureSecondaryAction(secondaryAction: AnimationAction) {
  secondaryAction.enabled = true;
  secondaryAction.setEffectiveTimeScale(1);
  secondaryAction.setEffectiveWeight(1);
  secondaryAction.setLoop(LoopOnce, 1);
  secondaryAction.clampWhenFinished = true;
  secondaryAction.reset().play();
}

function playSecondaryFromIdle(
  idleAction: AnimationAction,
  secondaryAction: AnimationAction,
) {
  configureSecondaryAction(secondaryAction);
  secondaryAction.crossFadeFrom(idleAction, BASE_ANIMATION_CONFIG.fade, false);
}

function returnSecondaryToIdle(
  idleAction: AnimationAction,
  secondaryAction: AnimationAction,
) {
  prepareIdleReturn(idleAction);
  secondaryAction.crossFadeTo(idleAction, BASE_ANIMATION_CONFIG.fade, false);
}

function beginBaseAnimationReturn(state: BaseAnimationState, now: number) {
  state.mode = "returning";
  state.cooldownEndAt = now + BASE_ANIMATION_CONFIG.fade;
}

function finishBaseAnimationReturn(state: BaseAnimationState, now: number) {
  state.mode = "idle";
  state.currentSecondary = null;
  scheduleNextBaseAnimation(state, now);
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
  action,
  analyserRef,
  audioRef,
  facialControls = defaultFacialControls,
  facialTargetOverrides,
  mouthCues,
  onFocusTargetChange,
  status,
}: AvatarModelProps) {
  const group = useRef<Group>(null);
  const morphMeshesRef = useRef<MorphMesh[]>([]);
  const smoothedAmplitudeRef = useRef(0);
  const idleElapsedRef = useRef(0);
  const nextBlinkAtRef = useRef(randomBlinkInterval());
  const blinkStartedAtRef = useRef<number | null>(null);
  const doubleBlinkPendingRef = useRef(false);
  const animStateRef = useRef<BaseAnimationState>(createInitialBaseAnimationState());
  const lastSecondaryClipRef = useRef<string | null>(null);
  const talkNextAtRef = useRef(0);
  const wasSpeakingRef = useRef(false);
  const lastActionRef = useRef<string | null>(null);
  const [modelOffset, setModelOffset] = useState<[number, number, number]>([
    0, 0, 0,
  ]);
  const { scene, animations } = useGLTF(siteConfig.modelPath);
  const { actions, mixer } = useAnimations(animations, group);
  const notifyFocusTargetChange = useEffectEvent(
    (target: [number, number, number]) => {
      onFocusTargetChange?.(target);
    },
  );

  useEffect(() => {
    morphMeshesRef.current = collectMorphMeshes(scene);

    // Ensure world matrices are computed before measuring bounds so that
    // skinned meshes and nested transforms contribute correctly.
    scene.updateMatrixWorld(true);

    const bounds = new Box3().setFromObject(scene);
    const center = bounds.getCenter(new Vector3());
    const size = bounds.getSize(new Vector3());

    // Center the model horizontally (X/Z) and place its feet on the floor (Y=0).
    setModelOffset([-center.x, -bounds.min.y, -center.z]);

    const headObject =
      scene.getObjectByName("Head") ??
      scene.getObjectByName("mixamorig:Head") ??
      scene.getObjectByName("Streamoji_Head");

    if (headObject) {
      const headPosition = headObject.getWorldPosition(new Vector3());
      const alignedHeadX = headPosition.x - center.x;
      const alignedHeadY = headPosition.y - bounds.min.y;
      const alignedHeadZ = headPosition.z - center.z;

      // Some skeletons export head bones at the root origin or chest height.
      // Only trust the bone when it sits in the upper half of the model.
      if (alignedHeadY > size.y * 0.5) {
        notifyFocusTargetChange([alignedHeadX, alignedHeadY, alignedHeadZ]);
        return;
      }
    }

    // Fallback: estimate eye-level from the bounding box so the camera
    // focuses on the face regardless of skeleton naming or rig differences.
    notifyFocusTargetChange([0, bounds.max.y * 0.88, 0]);
  }, [scene]);

  useEffect(() => {
    const idleAction = actions[BASE_ANIMATION_CONFIG.idle];
    if (!idleAction || !mixer) return;
    const activeIdleAction = idleAction;

    configureIdleAction(activeIdleAction);
    animStateRef.current = createInitialBaseAnimationState();

    function onFinished(event: { action: AnimationAction }) {
      const animState = animStateRef.current;
      if (
        animState.mode !== "playing" ||
        !animState.currentSecondary ||
        event.action.getClip().name !== animState.currentSecondary
      ) {
        return;
      }

      const secondaryAction = actions[animState.currentSecondary];
      if (secondaryAction) {
        returnSecondaryToIdle(activeIdleAction, secondaryAction);
      }

      beginBaseAnimationReturn(animState, idleElapsedRef.current);
    }

    mixer.addEventListener("finished", onFinished);

    return () => {
      mixer.removeEventListener("finished", onFinished);
      activeIdleAction.stop();
      if (animStateRef.current.currentSecondary) {
        const secondaryAction = actions[animStateRef.current.currentSecondary];
        secondaryAction?.stop();
      }
    };
  }, [actions, mixer]);

  useEffect(() => {
    if (!action || !mixer) return;
    if (action === lastActionRef.current) return;
    lastActionRef.current = action;

    const clipName = TRIGGERED_ACTION_MAP[action as keyof typeof TRIGGERED_ACTION_MAP];
    if (!clipName) return;

    const idleAction = actions[BASE_ANIMATION_CONFIG.idle];
    const secondaryAction = actions[clipName];
    if (!idleAction || !secondaryAction) return;

    // Interrupt any currently playing secondary animation
    if (animStateRef.current.currentSecondary) {
      const currentSecondary = actions[animStateRef.current.currentSecondary];
      if (currentSecondary && animStateRef.current.mode === "playing") {
        returnSecondaryToIdle(idleAction, currentSecondary);
      }
    }

    playSecondaryFromIdle(idleAction, secondaryAction);
    animStateRef.current.mode = "playing";
    animStateRef.current.currentSecondary = clipName;
  }, [action, actions, mixer]);

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

    // ── Base Random Animation System ─────────────────────────────
    const idleAction = actions[BASE_ANIMATION_CONFIG.idle];
    if (idleAction) {
      const animState = animStateRef.current;

      // Interrupt idle variants when avatar is listening, processing, or speaking
      if (status !== "idle" && animState.mode === "playing" && animState.currentSecondary) {
        const isIdleVariant = IDLE_VARIANTS.some((v) => v.name === animState.currentSecondary);
        if (isIdleVariant) {
          const secondaryAction = actions[animState.currentSecondary];
          if (secondaryAction) {
            returnSecondaryToIdle(idleAction, secondaryAction);
            beginBaseAnimationReturn(animState, idleElapsedRef.current);
          }
        }
      }

      // Random talking gesture during speaking
      const isSpeaking = status === "speaking";
      if (isSpeaking && !wasSpeakingRef.current) {
        talkNextAtRef.current = idleElapsedRef.current + MathUtils.randFloat(3, 7);
      }
      wasSpeakingRef.current = isSpeaking;

      if (isSpeaking) {
        if (idleElapsedRef.current >= talkNextAtRef.current) {
          if (animState.mode === "idle") {
            const talkAction = actions[TALKING_CLIP];
            if (talkAction) {
              playSecondaryFromIdle(idleAction, talkAction);
              animState.mode = "playing";
              animState.currentSecondary = TALKING_CLIP;
            }
          }
          talkNextAtRef.current = idleElapsedRef.current + MathUtils.randFloat(4, 10);
        }
      }

      // Idle variants only when status is idle
      if (status === "idle") {
        if (animState.mode === "idle") {
          if (idleElapsedRef.current >= animState.nextTriggerAt) {
            const clipName = pickWeightedRandomClip(
              IDLE_VARIANTS,
              lastSecondaryClipRef.current ?? undefined,
            );
            const secondaryAction = actions[clipName];

            if (secondaryAction) {
              playSecondaryFromIdle(idleAction, secondaryAction);

              animState.mode = "playing";
              animState.currentSecondary = clipName;
              lastSecondaryClipRef.current = clipName;
            } else {
              scheduleNextBaseAnimation(animState, idleElapsedRef.current);
            }
          }
        } else if (animState.mode === "returning") {
          if (idleElapsedRef.current >= animState.cooldownEndAt) {
            if (animState.currentSecondary) {
              const secondaryAction = actions[animState.currentSecondary];
              secondaryAction?.stop();
            }

            finishBaseAnimationReturn(animState, idleElapsedRef.current);
          }
        }
      }
    }
  });

  return (
    <group position={modelOffset}>
      <group ref={group}>
        <primitive object={scene} />
      </group>
    </group>
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
  action,
  analyserRef,
  audioRef,
  facialControls,
  facialTargetOverrides,
  mouthCues,
  status,
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
            action={action}
            analyserRef={analyserRef}
            audioRef={audioRef}
            facialControls={facialControls}
            facialTargetOverrides={facialTargetOverrides}
            mouthCues={mouthCues}
            onFocusTargetChange={setFocusTarget}
            status={status}
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
