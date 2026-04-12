"use client";

import { Suspense, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Center, OrbitControls, useAnimations, useGLTF } from "@react-three/drei";
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

const EMOTIONAL_DAMPING = 12;
const SPEECH_DAMPING = 35;
const AMPLITUDE_SMOOTHING = 0.6;
const JAW_OPEN_SCALE = 0.55;
const JAW_OPEN_MIN = 0.03;

function getDampingLambda(targetName: string) {
  return speechTargetKeys.includes(targetName as (typeof speechTargetKeys)[number])
    ? SPEECH_DAMPING
    : EMOTIONAL_DAMPING;
}

function getActiveMouthCue(mouthCues: MouthCue[], speechCurrentTime: number) {
  return mouthCues.find((cue) => speechCurrentTime >= cue.start && speechCurrentTime < cue.end) ?? null;
}

function getCuePose(cue: MouthCueValue): FacialTargetOverrides {
  switch (cue) {
    case "A":
      return { jawOpen: 0.03, mouthClose: 0.82 };
    case "B":
      return { jawOpen: 0.11, mouthStretchLeft: 0.18, mouthStretchRight: 0.18 };
    case "C":
      return { jawOpen: 0.22, mouthLowerDownLeft: 0.05, mouthLowerDownRight: 0.05 };
    case "D":
      return { jawOpen: 0.4, mouthLowerDownLeft: 0.1, mouthLowerDownRight: 0.1 };
    case "E":
      return { jawOpen: 0.15, mouthFunnel: 0.34 };
    case "F":
      return { jawOpen: 0.1, mouthFunnel: 0.44, mouthPucker: 0.42 };
    case "G":
      return { jawOpen: 0.05, mouthClose: 0.12, mouthUpperUpLeft: 0.1, mouthUpperUpRight: 0.1 };
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
  const morphMeshesRef = useRef<MorphMesh[]>([]);
  const smoothedAmplitudeRef = useRef(0);
  const { scene, animations } = useGLTF(siteConfig.modelPath);
  const { actions } = useAnimations(animations, group);
  const compatibleClipName = useMemo(() => {
    return animations.find((clip) => clipTargetsExist(scene, clip))?.name;
  }, [animations, scene]);
  const notifyFocusTargetChange = useEffectEvent((target: [number, number, number]) => {
    onFocusTargetChange?.(target);
  });

  useEffect(() => {
    morphMeshesRef.current = collectMorphMeshes(scene);

    const bounds = new Box3().setFromObject(scene);
    const headObject = scene.getObjectByName("Head") ?? scene.getObjectByName("Streamoji_Head");

    if (!headObject) {
      return;
    }

    const headPosition = headObject.getWorldPosition(new Vector3());
    const alignedHeadY = headPosition.y - bounds.min.y;
    const alignedHeadZ = headPosition.z;

    notifyFocusTargetChange([0, alignedHeadY, alignedHeadZ]);
  }, [scene, notifyFocusTargetChange]);

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

    if (audioRef?.current && mouthCues && mouthCues.length > 0) {
      const currentTime = audioRef.current.currentTime;
      const activeCue = getActiveMouthCue(mouthCues, currentTime);
      if (activeCue) {
        speechOverrides = getCuePose(activeCue.value);
      }
    } else if (analyserRef?.current && audioRef?.current && !audioRef.current.paused) {
      const rawAmplitude = computeAmplitude(analyserRef.current);
      smoothedAmplitudeRef.current = smoothedAmplitudeRef.current * AMPLITUDE_SMOOTHING + rawAmplitude * (1 - AMPLITUDE_SMOOTHING);
      speechOverrides = {
        jawOpen: Math.min(1, smoothedAmplitudeRef.current * JAW_OPEN_SCALE + JAW_OPEN_MIN),
      };
    } else {
      smoothedAmplitudeRef.current = 0;
    }

    const merged = mergeTargetInfluences(facialControls, {
      ...facialTargetOverrides,
      ...speechOverrides,
    });

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
      <directionalLight color="#818cf8" intensity={1.6} position={[-4, 3, -2]} />
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
    0,
    1.64,
    0.01,
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
