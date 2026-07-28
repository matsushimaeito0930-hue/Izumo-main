"use client";

import { Float, Text } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Group } from "three";
import { Vector3 } from "three";
import { TEAM_COLORS } from "@/lib/constants";
import type { HackVerseState, Team } from "@/lib/types";

const LAB_POSITIONS = [
  [-7.2, 0, -4.1],
  [-2.4, 0, -5.7],
  [3.2, 0, -5.2],
  [7.1, 0, -2.2],
  [-5.6, 0, 4.6],
  [2.4, 0, 4.8]
] as const;

function TeamLab({
  team,
  index,
  active
}: {
  team: Team;
  index: number;
  active: boolean;
}) {
  const ref = useRef<Group>(null);
  const [x, y, z] = LAB_POSITIONS[index % LAB_POSITIONS.length];
  const level = Math.min(4, Math.max(1, team.house_level));
  const width = [1.45, 2.05, 2.45, 2.8][level - 1];
  const depth = [1.2, 1.65, 1.9, 2.15][level - 1];
  const height = [0.72, 1.42, 2.1, 3.35][level - 1];
  const signY = level === 4 ? 2.35 : Math.max(0.96, height + 0.18);
  const color = TEAM_COLORS[index % TEAM_COLORS.length];

  useFrame((state) => {
    if (!ref.current) return;
    ref.current.position.y =
      y + (active ? Math.sin(state.clock.elapsedTime * 5) * 0.08 : 0);
  });

  return (
    <group ref={ref} position={[x, y, z]}>
      <mesh position={[0, 0.06, 0]}>
        <boxGeometry args={[width + 0.24, 0.12, depth + 0.24]} />
        <meshStandardMaterial color="#101827" emissive={color} emissiveIntensity={0.22} />
      </mesh>
      <mesh position={[0, 0.13, 0]}>
        <boxGeometry args={[width, 0.08, depth]} />
        <meshStandardMaterial color="#182335" roughness={0.35} />
      </mesh>

      {level === 1 && (
        <group>
          <mesh position={[0, 0.56, 0]}>
            <boxGeometry args={[0.88, 0.1, 0.46]} />
            <meshStandardMaterial color="#202d3f" emissive={color} emissiveIntensity={0.15} />
          </mesh>
          {[-0.32, 0.32].map((legX) => (
            <mesh key={legX} position={[legX, 0.33, 0]}>
              <boxGeometry args={[0.06, 0.44, 0.06]} />
              <meshStandardMaterial color="#617287" />
            </mesh>
          ))}
          <mesh position={[0, 0.86, -0.08]} rotation={[-0.22, 0, 0]}>
            <boxGeometry args={[0.6, 0.38, 0.045]} />
            <meshStandardMaterial color="#0b1220" emissive={color} emissiveIntensity={0.8} />
          </mesh>
          <mesh position={[0.1, 0.59, 0.04]}>
            <boxGeometry args={[0.16, 0.025, 0.2]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} />
          </mesh>
        </group>
      )}

      {level === 2 && (
        <group>
          {[
            [-0.82, 0, -0.62],
            [0.82, 0, -0.62],
            [-0.82, 0, 0.62],
            [0.82, 0, 0.62]
          ].map(([pillarX, pillarY, pillarZ]) => (
            <mesh key={`${pillarX}-${pillarZ}`} position={[pillarX, 0.78, pillarZ]}>
              <boxGeometry args={[0.11, 1.45, 0.11]} />
              <meshStandardMaterial color="#26384b" emissive={color} emissiveIntensity={0.35} />
            </mesh>
          ))}
          <mesh position={[0, 1.5, 0]}>
            <boxGeometry args={[2.12, 0.12, 1.7]} />
            <meshStandardMaterial color="#162334" emissive={color} emissiveIntensity={0.6} />
          </mesh>
          <mesh position={[0, 0.58, 0.12]}>
            <boxGeometry args={[1.15, 0.08, 0.5]} />
            <meshStandardMaterial color="#26384b" />
          </mesh>
          <mesh position={[0, 0.98, -0.54]}>
            <boxGeometry args={[1.14, 0.38, 0.05]} />
            <meshStandardMaterial color="#07101c" emissive={color} emissiveIntensity={0.8} />
          </mesh>
        </group>
      )}

      {level === 3 && (
        <group>
          <mesh position={[0, 0.98, 0]}>
            <boxGeometry args={[2.34, 1.75, 1.78]} />
            <meshStandardMaterial color="#162334" emissive={active ? color : "#101c2c"} emissiveIntensity={active ? 0.9 : 0.25} roughness={0.3} />
          </mesh>
          <mesh position={[0, 1.08, 0.91]}>
            <boxGeometry args={[1.8, 1.18, 0.045]} />
            <meshStandardMaterial color="#07101b" emissive={color} emissiveIntensity={0.75} transparent opacity={0.9} />
          </mesh>
          {[-0.92, 0.92].map((panelX) => (
            <mesh key={panelX} position={[panelX, 1.05, 0]}>
              <boxGeometry args={[0.07, 1.45, 1.52]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.9} />
            </mesh>
          ))}
          <mesh position={[0, 1.92, 0]}>
            <boxGeometry args={[2.5, 0.08, 1.92]} />
            <meshStandardMaterial color="#26384b" emissive={color} emissiveIntensity={0.7} />
          </mesh>
          <mesh position={[0, 0.72, 0.96]}>
            <boxGeometry args={[1.3, 0.05, 0.05]} />
            <meshStandardMaterial color="#ffd166" emissive="#ffd166" emissiveIntensity={1.2} />
          </mesh>
        </group>
      )}

      {level === 4 && (
        <group>
          {[0.64, 1.48, 2.36].map((moduleY, moduleIndex) => (
            <group key={moduleY}>
              <mesh position={[0, moduleY, 0]}>
                <boxGeometry args={[width - moduleIndex * 0.24, 0.66, depth - moduleIndex * 0.2]} />
                <meshStandardMaterial color={moduleIndex === 1 ? "#1c2d43" : "#172235"} emissive={active ? color : "#0b1727"} emissiveIntensity={active ? 0.75 : 0.22} roughness={0.28} />
              </mesh>
              <mesh position={[0, moduleY, depth / 2 + 0.02 - moduleIndex * 0.1]}>
                <boxGeometry args={[width - 0.38 - moduleIndex * 0.18, 0.08, 0.04]} />
                <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.1} />
              </mesh>
            </group>
          ))}
          <mesh position={[0, 3.26, 0]}>
            <cylinderGeometry args={[0.11, 0.2, 0.95, 10]} />
            <meshStandardMaterial color="#ff4f8b" emissive="#ff4f8b" emissiveIntensity={1.2} />
          </mesh>
          <mesh position={[0, 3.78, 0]}>
            <sphereGeometry args={[0.2, 16, 16]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.6} />
          </mesh>
        </group>
      )}

      <mesh position={[0, signY, depth / 2 + 0.08]}>
        <boxGeometry args={[Math.min(width + 0.25, 2.7), 0.48, 0.06]} />
        <meshStandardMaterial
          color="#09111e"
          emissive={active ? color : "#122133"}
          emissiveIntensity={active ? 1.15 : 0.45}
        />
      </mesh>
      <Text
        position={[0, signY + 0.08, depth / 2 + 0.12]}
        fontSize={0.18}
        color="#f8fafc"
        anchorX="center"
        anchorY="middle"
      >
        {team.name}
      </Text>
      <Text
        position={[0, signY - 0.1, depth / 2 + 0.12]}
        fontSize={0.12}
        color={color}
        anchorX="center"
        anchorY="middle"
      >
        {`L${level} / ${team.score} PTS / ${team.commit_count} COMMITS`}
      </Text>
      {active && <pointLight position={[0, Math.min(height + 1.1, 3.4), 0]} color={color} intensity={5} distance={4.2} />}
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

function RoadGrid() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, 0]}>
        <planeGeometry args={[21, 1.45]} />
        <meshStandardMaterial color="#0b111b" roughness={0.85} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.019, 0]}>
        <planeGeometry args={[1.45, 16.2]} />
        <meshStandardMaterial color="#0b111b" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.035, -0.7]}>
        <boxGeometry args={[20.8, 0.035, 0.045]} />
        <meshStandardMaterial color="#33f2d1" emissive="#33f2d1" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[0, 0.035, 0.7]}>
        <boxGeometry args={[20.8, 0.035, 0.045]} />
        <meshStandardMaterial color="#ff4f8b" emissive="#ff4f8b" emissiveIntensity={0.65} />
      </mesh>
      <mesh position={[-0.7, 0.035, 0]}>
        <boxGeometry args={[0.045, 0.035, 15.8]} />
        <meshStandardMaterial color="#ffd166" emissive="#ffd166" emissiveIntensity={0.7} />
      </mesh>
      <mesh position={[0.7, 0.035, 0]}>
        <boxGeometry args={[0.045, 0.035, 15.8]} />
        <meshStandardMaterial color="#7c5cff" emissive="#7c5cff" emissiveIntensity={0.7} />
      </mesh>
      {[-0.52, -0.26, 0, 0.26, 0.52].map((offset) => (
        <mesh key={`cross-x-${offset}`} position={[offset, 0.04, 0]}>
          <boxGeometry args={[0.12, 0.025, 1.2]} />
          <meshStandardMaterial color="#d9e6e8" emissive="#d9e6e8" emissiveIntensity={0.15} />
        </mesh>
      ))}
      {[-0.52, -0.26, 0, 0.26, 0.52].map((offset) => (
        <mesh key={`cross-z-${offset}`} position={[0, 0.04, offset]}>
          <boxGeometry args={[1.2, 0.025, 0.12]} />
          <meshStandardMaterial color="#d9e6e8" emissive="#d9e6e8" emissiveIntensity={0.15} />
        </mesh>
      ))}
    </group>
  );
}

function CityCore() {
  return (
    <group position={[0, 0, -0.75]}>
      <mesh position={[0, 0.08, 0]}>
        <cylinderGeometry args={[2.35, 2.55, 0.14, 64]} />
        <meshStandardMaterial color="#122032" emissive="#33f2d1" emissiveIntensity={0.2} roughness={0.42} />
      </mesh>
      <mesh position={[0, 0.16, 0]}>
        <torusGeometry args={[1.72, 0.035, 10, 64]} />
        <meshStandardMaterial color="#33f2d1" emissive="#33f2d1" emissiveIntensity={1.1} />
      </mesh>
      <mesh position={[0, 0.44, 0]}>
        <cylinderGeometry args={[0.42, 0.62, 0.62, 8]} />
        <meshStandardMaterial color="#1d3246" emissive="#ff4f8b" emissiveIntensity={0.65} />
      </mesh>
      <mesh position={[0, 0.92, 0]}>
        <sphereGeometry args={[0.18, 18, 18]} />
        <meshStandardMaterial color="#ffd166" emissive="#ffd166" emissiveIntensity={1.8} />
      </mesh>
      <Text position={[0, 1.23, 0]} fontSize={0.28} color="#f8fafc" anchorX="center" anchorY="middle">
        HACKVERSE CITY
      </Text>
      <Text position={[0, 0.98, 0]} fontSize={0.12} color="#33f2d1" anchorX="center" anchorY="middle">
        TEAM DEVELOPMENT DISTRICT
      </Text>
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
      const [x, , z] = LAB_POSITIONS[index % LAB_POSITIONS.length];
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
        <RoadGrid />
        <CityCore />
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
          <TeamLab
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
