"use client";

import { Float, Text } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Group } from "three";
import { Vector3 } from "three";
import { TEAM_COLORS } from "@/lib/constants";
import type { HackVerseState, Team } from "@/lib/types";

const HOUSE_POSITIONS = [
  [-7.2, 0, -4.1],
  [-2.4, 0, -5.7],
  [3.2, 0, -5.2],
  [7.1, 0, -2.2],
  [-5.6, 0, 4.6],
  [2.4, 0, 4.8]
] as const;

function House({
  team,
  index,
  active
}: {
  team: Team;
  index: number;
  active: boolean;
}) {
  const ref = useRef<Group>(null);
  const [x, y, z] = HOUSE_POSITIONS[index % HOUSE_POSITIONS.length];
  const height = 0.65 + team.house_level * 0.34;
  const color = TEAM_COLORS[index % TEAM_COLORS.length];

  useFrame((state) => {
    if (!ref.current) return;
    ref.current.position.y =
      y + (active ? Math.sin(state.clock.elapsedTime * 5) * 0.08 : 0);
  });

  return (
    <group ref={ref} position={[x, y, z]}>
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[1.18, height, 1.18]} />
        <meshStandardMaterial
          color={active ? "#ffffff" : color}
          emissive={active ? color : "#111111"}
          emissiveIntensity={active ? 1.35 : 0.25}
          roughness={0.45}
        />
      </mesh>
      {team.house_level < 4 ? (
        <mesh position={[0, height + 0.36, 0]} rotation={[0, Math.PI / 4, 0]}>
          <coneGeometry args={[0.95, 0.72, 4]} />
          <meshStandardMaterial color="#ffd166" emissive="#5c3600" />
        </mesh>
      ) : (
        <mesh position={[0, height + 0.78, 0]}>
          <cylinderGeometry args={[0.36, 0.52, 1.56, 6]} />
          <meshStandardMaterial
            color="#ff4f8b"
            emissive="#ff4f8b"
            emissiveIntensity={0.55}
          />
        </mesh>
      )}
      <mesh position={[0, 0.08, 0.82]}>
        <boxGeometry args={[1.38, 0.16, 0.08]} />
        <meshStandardMaterial color="#080914" emissive={color} emissiveIntensity={0.35} />
      </mesh>
      <Text
        position={[0, 0.05, 0.88]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.24}
        color="#f8fafc"
        anchorX="center"
        anchorY="middle"
      >
        {team.name}
      </Text>
      <Text
        position={[0, 0.05, 1.2]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.18}
        color="#33f2d1"
        anchorX="center"
        anchorY="middle"
      >
        {`${team.score} pts / Lv ${team.house_level}`}
      </Text>
      <Text
        position={[0, 0.05, 1.48]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.15}
        color="#ffd166"
        anchorX="center"
        anchorY="middle"
      >
        {`${team.commit_count} commits`}
      </Text>
    </group>
  );
}

function Avatar({ active }: { active: boolean }) {
  return (
    <Float speed={1.4} rotationIntensity={0.22} floatIntensity={0.2}>
      <group position={[0, 0, 1]}>
        <mesh position={[0, 0.42, 0]}>
          <capsuleGeometry args={[0.18, 0.52, 4, 12]} />
          <meshStandardMaterial
            color={active ? "#ff4f8b" : "#33f2d1"}
            emissive={active ? "#ff4f8b" : "#33f2d1"}
            emissiveIntensity={0.45}
          />
        </mesh>
        <mesh position={[0, 0.9, 0]}>
          <sphereGeometry args={[0.22, 24, 24]} />
          <meshStandardMaterial color="#f8fafc" emissive="#33f2d1" emissiveIntensity={0.16} />
        </mesh>
      </group>
    </Float>
  );
}

function StreetLight({
  position,
  color
}: {
  position: [number, number, number];
  color: string;
}) {
  return (
    <group position={position}>
      <mesh position={[0, 0.82, 0]}>
        <cylinderGeometry args={[0.045, 0.06, 1.65, 8]} />
        <meshStandardMaterial color="#2c3444" />
      </mesh>
      <mesh position={[0, 1.72, 0]}>
        <sphereGeometry args={[0.16, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} />
      </mesh>
      <pointLight position={[0, 1.72, 0]} color={color} intensity={4} distance={3.4} />
    </group>
  );
}

function SignBoards({ state }: { state: HackVerseState }) {
  const topTeam = state.teams[0];
  const helpPost = state.helpPosts.find((post) => post.status !== "solved");

  return (
    <>
      <group position={[-8.8, 0, 5.8]} rotation={[0, 0.45, 0]}>
        <mesh position={[0, 1.15, 0]}>
          <boxGeometry args={[2.2, 1.15, 0.12]} />
          <meshStandardMaterial color="#101322" emissive="#33f2d1" emissiveIntensity={0.18} />
        </mesh>
        <Text position={[0, 1.4, 0.08]} fontSize={0.18} color="#ffd166" anchorX="center">
          RANKING
        </Text>
        <Text position={[0, 1.08, 0.08]} fontSize={0.18} color="#ffffff" anchorX="center">
          {topTeam ? `#1 ${topTeam.name}` : "No teams"}
        </Text>
        <Text position={[0, 0.82, 0.08]} fontSize={0.16} color="#33f2d1" anchorX="center">
          {topTeam ? `${topTeam.score} pts` : ""}
        </Text>
      </group>

      <group position={[8.8, 0, 5.8]} rotation={[0, -0.45, 0]}>
        <mesh position={[0, 1.15, 0]}>
          <boxGeometry args={[2.25, 1.15, 0.12]} />
          <meshStandardMaterial color="#101322" emissive="#ff4f8b" emissiveIntensity={0.18} />
        </mesh>
        <Text position={[0, 1.4, 0.08]} fontSize={0.18} color="#ff4f8b" anchorX="center">
          HELP
        </Text>
        <Text position={[0, 1.06, 0.08]} fontSize={0.14} color="#ffffff" anchorX="center">
          {helpPost ? helpPost.title.slice(0, 24) : "All clear"}
        </Text>
        <Text position={[0, 0.82, 0.08]} fontSize={0.13} color="#ffd166" anchorX="center">
          {helpPost ? helpPost.team_name : ""}
        </Text>
      </group>
    </>
  );
}

function WalkControls({
  teams,
  onNearbyTeamChange,
  onLockChange
}: {
  teams: Team[];
  onNearbyTeamChange?: (team: Team | null) => void;
  onLockChange?: (locked: boolean) => void;
}) {
  const { camera, gl } = useThree();
  const keys = useRef(new Set<string>());
  const latestNearbyTeamId = useRef<string | null>(null);
  const forward = useMemo(() => new Vector3(), []);
  const right = useMemo(() => new Vector3(), []);
  const velocity = useMemo(() => new Vector3(), []);
  const yaw = useRef(0);
  const pitch = useRef(0);

  useEffect(() => {
    camera.position.set(0, 1.55, 7.6);
    camera.rotation.order = "YXZ";
    camera.rotation.set(0, 0, 0);
  }, [camera]);

  useEffect(() => {
    const requestPointerLock = () => {
      gl.domElement.requestPointerLock();
    };
    const handlePointerLockChange = () => {
      onLockChange?.(document.pointerLockElement === gl.domElement);
    };
    const handleMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== gl.domElement) return;

      yaw.current -= event.movementX * 0.0022;
      pitch.current -= event.movementY * 0.0022;
      pitch.current = Math.max(-1.15, Math.min(1.15, pitch.current));
      camera.rotation.set(pitch.current, yaw.current, 0);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (["KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) {
        keys.current.add(event.code);
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      keys.current.delete(event.code);
    };

    const enterButton = document.getElementById("plaza-enter");
    window.addEventListener("hackverse:request-pointer-lock", requestPointerLock);
    enterButton?.addEventListener("click", requestPointerLock);
    gl.domElement.addEventListener("click", requestPointerLock);
    document.addEventListener("pointerlockchange", handlePointerLockChange);
    document.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("hackverse:request-pointer-lock", requestPointerLock);
      enterButton?.removeEventListener("click", requestPointerLock);
      gl.domElement.removeEventListener("click", requestPointerLock);
      document.removeEventListener("pointerlockchange", handlePointerLockChange);
      document.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [camera, gl, onLockChange]);

  useFrame((_, delta) => {
    forward.set(-Math.sin(yaw.current), 0, -Math.cos(yaw.current)).normalize();
    right.set(Math.cos(yaw.current), 0, -Math.sin(yaw.current)).normalize();
    velocity.set(0, 0, 0);

    if (keys.current.has("KeyW")) velocity.add(forward);
    if (keys.current.has("KeyS")) velocity.sub(forward);
    if (keys.current.has("KeyD")) velocity.add(right);
    if (keys.current.has("KeyA")) velocity.sub(right);

    if (velocity.lengthSq() > 0) {
      velocity.normalize().multiplyScalar(delta * 4.2);
      camera.position.add(velocity);
      camera.position.x = Math.min(10.8, Math.max(-10.8, camera.position.x));
      camera.position.z = Math.min(8.2, Math.max(-8.2, camera.position.z));
      camera.position.y = 1.55;
    }

    let nearbyTeam: Team | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const [index, team] of teams.entries()) {
      const [x, , z] = HOUSE_POSITIONS[index % HOUSE_POSITIONS.length];
      const distance = Math.hypot(camera.position.x - x, camera.position.z - z);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearbyTeam = distance < 2.25 ? team : null;
      }
    }

    const nextId = nearbyTeam?.id ?? null;
    if (nextId !== latestNearbyTeamId.current) {
      latestNearbyTeamId.current = nextId;
      onNearbyTeamChange?.(nearbyTeam);
    }
  });

  return null;
}

export function PlazaScene({
  state,
  onNearbyTeamChange
}: {
  state: HackVerseState;
  onNearbyTeamChange?: (team: Team | null) => void;
}) {
  const latestTeamId = state.activities[0]?.team_id;
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    const syncLockState = () => setIsLocked(Boolean(document.pointerLockElement));

    document.addEventListener("pointerlockchange", syncLockState);
    document.addEventListener("pointerlockerror", syncLockState);

    return () => {
      document.removeEventListener("pointerlockchange", syncLockState);
      document.removeEventListener("pointerlockerror", syncLockState);
    };
  }, []);

  return (
    <div className="relative h-[calc(100vh-5.5rem)] min-h-[34rem] overflow-hidden rounded-lg border border-white/10 bg-void shadow-neon">
      <Canvas
        id="plaza-canvas"
        camera={{ position: [0, 1.55, 7.6], fov: 70 }}
        className="plaza-canvas h-full w-full"
        style={{ height: "100%", width: "100%" }}
      >
        <color attach="background" args={["#080914"]} />
        <fog attach="fog" args={["#080914", 11, 32]} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[4, 7, 4]} intensity={1.1} />
        <pointLight position={[0, 3, 0]} color="#33f2d1" intensity={20} distance={12} />
        <pointLight position={[0, 2, 5.6]} color="#ff4f8b" intensity={9} distance={9} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
          <planeGeometry args={[24, 18]} />
          <meshStandardMaterial color="#162018" roughness={0.75} />
        </mesh>
        <gridHelper args={[24, 30, "#33f2d1", "#244c49"]} position={[0, 0.01, 0]} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0.15]}>
          <ringGeometry args={[3.2, 3.36, 64]} />
          <meshStandardMaterial color="#33f2d1" emissive="#33f2d1" emissiveIntensity={0.35} />
        </mesh>
        <StreetLight position={[-9.6, 0, -7.1]} color="#33f2d1" />
        <StreetLight position={[9.6, 0, -7.1]} color="#ff4f8b" />
        <StreetLight position={[-9.6, 0, 7.0]} color="#ffd166" />
        <StreetLight position={[9.6, 0, 7.0]} color="#7c5cff" />
        <StreetLight position={[0, 0, -8.0]} color="#33f2d1" />
        <StreetLight position={[0, 0, 8.0]} color="#ff4f8b" />
        {state.teams.map((team, index) => (
          <House
            key={team.id}
            team={team}
            index={index}
            active={team.id === latestTeamId}
          />
        ))}
        <Avatar active={isLocked} />
        <SignBoards state={state} />
        <WalkControls
          teams={state.teams}
          onNearbyTeamChange={onNearbyTeamChange}
          onLockChange={setIsLocked}
        />
      </Canvas>
      <div className="pointer-events-none absolute left-1/2 top-1/2 size-5 -translate-x-1/2 -translate-y-1/2">
        <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/60" />
        <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/60" />
      </div>
      <div className="absolute bottom-4 left-4 max-w-sm rounded-lg border border-white/10 bg-void/72 p-3 text-xs text-white/72 backdrop-blur">
        <p className="font-black uppercase tracking-[0.16em] text-pulse">
          {isLocked ? "Mouse Look Active" : "Click Plaza To Enter"}
        </p>
        <p className="mt-1">W/A/S/Dで移動、マウスで方向転換、Escで解除。</p>
        {!isLocked && (
          <button
            id="plaza-enter"
            type="button"
            onClick={() => {
              window.dispatchEvent(new Event("hackverse:request-pointer-lock"));
            }}
            className="mt-3 h-9 rounded-md border border-pulse/40 bg-pulse/15 px-3 text-xs font-black uppercase tracking-[0.12em] text-pulse transition hover:bg-pulse/25"
          >
            Enter First Person
          </button>
        )}
      </div>
    </div>
  );
}
