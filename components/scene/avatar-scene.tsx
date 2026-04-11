"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Center, OrbitControls, useAnimations, useGLTF } from "@react-three/drei";
import type { AnimationClip, Group, Object3D } from "three";
import { siteConfig } from "@/lib/site";

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

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const updatePreference = () => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    updatePreference();

    mediaQuery.addEventListener("change", updatePreference);

    return () => {
      mediaQuery.removeEventListener("change", updatePreference);
    };
  }, []);

  return prefersReducedMotion;
}

function AvatarModel() {
  const group = useRef<Group>(null);
  const { scene, animations } = useGLTF(siteConfig.modelPath);
  const { actions } = useAnimations(animations, group);
  const compatibleClipName = useMemo(() => {
    return animations.find((clip) => clipTargetsExist(scene, clip))?.name;
  }, [animations, scene]);

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

  return (
    <Center>
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

export default function AvatarScene() {
  const prefersReducedMotion = usePrefersReducedMotion();

  return (
    <div className="absolute inset-0 bg-transparent">
      <Canvas camera={{ fov: 32, position: [0, 1.15, 4.2] }} dpr={[1, 1.5]}>
        <SceneLights />
        <Suspense fallback={null}>
          <AvatarModel />
        </Suspense>
        <OrbitControls
          autoRotate={!prefersReducedMotion}
          autoRotateSpeed={0.6}
          enableDamping
          enablePan={false}
          enableZoom={false}
          maxPolarAngle={Math.PI / 1.8}
          minPolarAngle={Math.PI / 3.5}
        />
      </Canvas>
    </div>
  );
}
