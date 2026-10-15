import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Sparkles } from '@react-three/drei';
import * as THREE from 'three';

function HeartMesh() {
  const heartRef = useRef(null);
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.78);
    shape.bezierCurveTo(-0.2, -0.45, -1.13, 0.22, -0.83, 0.78);
    shape.bezierCurveTo(-0.58, 1.28, -0.11, 1.12, 0, 0.67);
    shape.bezierCurveTo(0.11, 1.12, 0.58, 1.28, 0.83, 0.78);
    shape.bezierCurveTo(1.13, 0.22, 0.2, -0.45, 0, -0.78);

    const extruded = new THREE.ExtrudeGeometry(shape, {
      depth: 0.34,
      bevelEnabled: true,
      bevelSegments: 7,
      steps: 2,
      bevelSize: 0.075,
      bevelThickness: 0.075,
      curveSegments: 28,
    });
    extruded.center();
    return extruded;
  }, []);

  useFrame(({ clock, pointer }) => {
    if (!heartRef.current) return;
    const t = clock.getElapsedTime();
    heartRef.current.rotation.y = Math.sin(t * 0.34) * 0.19 + pointer.x * 0.19;
    heartRef.current.rotation.x = Math.cos(t * 0.26) * 0.06 - pointer.y * 0.10;
    heartRef.current.rotation.z = Math.sin(t * 0.22) * 0.025;
    heartRef.current.position.y = Math.sin(t * 0.75) * 0.055;
  });

  return (
    <group ref={heartRef} scale={1.32} rotation={[0, -0.18, 0]}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshPhysicalMaterial
          color="#e6b95f"
          metalness={0.82}
          roughness={0.23}
          clearcoat={1}
          clearcoatRoughness={0.16}
          emissive="#4e260b"
          emissiveIntensity={0.17}
        />
      </mesh>
      <mesh geometry={geometry} scale={1.008} position={[0, 0, -0.025]}>
        <meshStandardMaterial color="#8f571d" metalness={0.72} roughness={0.32} side={THREE.BackSide} />
      </mesh>
    </group>
  );
}

function OrbitingGold({ position, scale = 0.06 }) {
  const ref = useRef(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.position.y = position[1] + Math.sin(clock.getElapsedTime() * 0.8 + position[0] * 2) * 0.08;
    ref.current.rotation.x += 0.003;
    ref.current.rotation.y += 0.006;
  });
  return (
    <mesh ref={ref} position={position} scale={scale}>
      <icosahedronGeometry args={[1, 1]} />
      <meshStandardMaterial color="#f4d995" metalness={0.82} roughness={0.24} />
    </mesh>
  );
}

export default function HeartScene() {
  return (
    <div className="heart-scene" aria-label="A slowly floating golden 3D heart" role="img">
      <div className="heart-halo" />
      <Canvas
        camera={{ position: [0, 0, 4.9], fov: 37 }}
        dpr={[1, 1.6]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        fallback={<div className="heart-fallback" aria-hidden="true">♥</div>}
      >
        <ambientLight intensity={1.15} />
        <directionalLight position={[3.5, 4, 4]} intensity={3.1} color="#fff0c6" />
        <pointLight position={[-3.2, 0.8, 2.8]} intensity={34} color="#ffba65" distance={8} />
        <pointLight position={[2.2, -2.4, 1.6]} intensity={17} color="#d66a6b" distance={7} />
        <spotLight position={[0, 4, 1]} angle={0.42} penumbra={0.8} intensity={24} color="#fff5d9" />
        <Float speed={1.25} rotationIntensity={0.12} floatIntensity={0.25}>
          <HeartMesh />
        </Float>
        <OrbitingGold position={[-1.2, 0.85, 0.25]} scale={0.055} />
        <OrbitingGold position={[1.12, -0.7, 0.1]} scale={0.04} />
        <OrbitingGold position={[0.95, 1.18, -0.4]} scale={0.03} />
        <Sparkles count={46} scale={[3.8, 3.6, 2.1]} size={2.1} speed={0.24} opacity={0.66} color="#f9dfa0" />
      </Canvas>
      <span className="scene-caption scene-caption-top">A LITTLE THING, WITH A LOT OF LOVE</span>
      <span className="scene-caption scene-caption-bottom">✳ MADE TO TRAVEL THE DISTANCE ✳</span>
    </div>
  );
}
