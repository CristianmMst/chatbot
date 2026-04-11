"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Center, OrbitControls, useAnimations, useGLTF } from "@react-three/drei";
import { Box3, MathUtils, Vector3 } from "three";
import type { AnimationClip, Group, Mesh, Object3D } from "three";
import {
  defaultFacialControls,
  facialTargetMap,
  trackedFacialTargets,
  type FacialControls,
} from "@/lib/avatar-face";
import { siteConfig } from "@/lib/site";

type AvatarSceneProps = {
  facialControls?: FacialControls;
};

type AvatarModelProps = AvatarSceneProps & {
  onFocusTargetChange?: (target: [number, number, number]) => void;
};

type MorphMesh = Mesh & {
  morphTargetDictionary: Record<string, number>;
  morphTargetInfluences: number[];
};

const FACIAL_SMOOTHING = 12;

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

function AvatarModel({
  facialControls = defaultFacialControls,
  onFocusTargetChange,
}: AvatarModelProps) {
  const group = useRef<Group>(null);
  const morphMeshesRef = useRef<MorphMesh[]>([]);
  const { scene, animations } = useGLTF(siteConfig.modelPath);
  const { actions } = useAnimations(animations, group);
  const compatibleClipName = useMemo(() => {
    return animations.find((clip) => clipTargetsExist(scene, clip))?.name;
  }, [animations, scene]);
  const targetInfluences = useMemo(
    () => getTargetInfluences(facialControls),
    [facialControls],
  );

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

    onFocusTargetChange?.([0, alignedHeadY, alignedHeadZ]);
  }, [onFocusTargetChange, scene]);

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
    for (const mesh of morphMeshesRef.current) {
      for (const targetName of trackedFacialTargets) {
        const targetIndex = mesh.morphTargetDictionary[targetName];

        if (targetIndex === undefined) {
          continue;
        }

        // Three.js stores morph weights imperatively on the mesh instance.
        // eslint-disable-next-line react-hooks/immutability
        mesh.morphTargetInfluences[targetIndex] = MathUtils.damp(
          mesh.morphTargetInfluences[targetIndex] ?? 0,
          targetInfluences[targetName] ?? 0,
          FACIAL_SMOOTHING,
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

export default function AvatarScene({ facialControls }: AvatarSceneProps) {
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
          <AvatarModel facialControls={facialControls} onFocusTargetChange={setFocusTarget} />
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
