"use client";

import { Suspense, useEffect, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { Center, OrbitControls, useAnimations, useGLTF } from "@react-three/drei";
import type { Group, Object3DEventMap } from "three";

const MODEL_PATH = "/models/avatar.glb";

function AvatarModel() {
  const group = useRef<Group<Object3DEventMap>>(null);
  const { scene, animations } = useGLTF(MODEL_PATH);
  const { actions, names } = useAnimations(animations, group);

  useEffect(() => {
    const firstAnimation = names[0];

    if (!firstAnimation) {
      return;
    }

    const action = actions[firstAnimation];

    if (!action) {
      return;
    }

    action.reset().fadeIn(0.2).play();

    return () => {
      action.fadeOut(0.2);
    };
  }, [actions, names]);

  return (
    <Center>
      <group ref={group}>
        <primitive object={scene} />
      </group>
    </Center>
  );
}

useGLTF.preload(MODEL_PATH);

export default function AvatarViewer() {
  return (
    <div className="h-[440px] w-full overflow-hidden rounded-3xl border border-black/10 bg-gradient-to-b from-zinc-100 to-white shadow-sm">
      <Canvas
        camera={{ fov: 30, position: [0, 1.4, 3.8] }}
        dpr={[1, 1.5]}
      >
        <color attach="background" args={["#f5f5f4"]} />
        <ambientLight intensity={1.4} />
        <directionalLight intensity={2} position={[3, 4, 5]} />
        <directionalLight intensity={1} position={[-2, 2, -3]} />
        <Suspense fallback={null}>
          <AvatarModel />
        </Suspense>
        <OrbitControls
          enableDamping
          enablePan={false}
          minDistance={2}
          maxDistance={6}
          minPolarAngle={Math.PI / 3.5}
          maxPolarAngle={Math.PI / 1.8}
        />
      </Canvas>
    </div>
  );
}
