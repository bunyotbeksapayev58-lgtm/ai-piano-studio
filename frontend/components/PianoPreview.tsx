"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Gauge,
  Film,
  Sparkles,
  Sliders,
  Layers,
  Music,
  RefreshCw,
  Check
} from "lucide-react";
import { NoteDto, PreviewDataResponse, api } from "@/services/api";

interface PianoPreviewProps {
  projectId: string;
  previewData: PreviewDataResponse;
  onGoToExport: () => void;
  onOpenMidiEditor?: () => void;
}

const THEME_3D_COLORS: Record<string, { right: number; rightEmissive: number; left: number; leftEmissive: number; strike: number }> = {
  falling_note_anime: { right: 0x38bdf8, rightEmissive: 0x0284c7, left: 0x10b981, leftEmissive: 0x059669, strike: 0x38bdf8 },
  cyberpunk_neon: { right: 0xf43f8e, rightEmissive: 0xbe123c, left: 0x06b6d4, leftEmissive: 0x0891b2, strike: 0xf43f8e },
  royal_gold: { right: 0xf59e0b, rightEmissive: 0xb45309, left: 0xfbbf24, leftEmissive: 0xd97706, strike: 0xf59e0b },
  emerald_nature: { right: 0x14b8a6, rightEmissive: 0x0f766e, left: 0x22c55e, leftEmissive: 0x15803d, strike: 0x14b8a6 },
  sunset_lofi: { right: 0xfb7185, rightEmissive: 0xe11d48, left: 0xc084fc, leftEmissive: 0x9333ea, strike: 0xfb7185 },
  synthesia_pro: { right: 0x2563eb, rightEmissive: 0x1d4ed8, left: 0x84cc16, leftEmissive: 0x4d7c0f, strike: 0xffffff },
};

export const PianoPreview: React.FC<PianoPreviewProps> = ({
  projectId,
  previewData,
  onGoToExport,
  onOpenMidiEditor,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [volume, setVolume] = useState<number>(0.9);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [activeNotesCount, setActiveNotesCount] = useState<number>(0);
  const [viewMode, setViewMode] = useState<"3d" | "video">("3d");
  const [showHands, setShowHands] = useState<boolean>(true);
  const showHandsRef = useRef<boolean>(true);

  // Studio customization state
  const initialTheme = previewData.visual_settings?.theme || "falling_note_anime";
  const initialSound = previewData.visual_settings?.sound_preset || "concert_grand";
  const [selectedTheme, setSelectedTheme] = useState<string>(initialTheme);
  const [selectedSound, setSelectedSound] = useState<string>(initialSound);
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [applySuccess, setApplySuccess] = useState<boolean>(false);

  // Keep track of active note indices for Three.js render loop
  const timeRef = useRef<number>(0);
  const notesRef = useRef<NoteDto[]>(previewData.notes || []);

  const totalDuration = Math.max(previewData.duration_seconds || 5.0, 1.0);

  // Setup Three.js Scene
  useEffect(() => {
    if (viewMode !== "3d" || !containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight || 520;

    const colors = THEME_3D_COLORS[selectedTheme] || THEME_3D_COLORS["falling_note_anime"];

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07090e);
    scene.fog = new THREE.FogExp2(0x07090e, 0.008);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    // Angled top-down perspective looking down at piano keys
    camera.position.set(0, 18, 28);
    camera.lookAt(0, 0, 4);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(0, 30, 20);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const bluePoint = new THREE.PointLight(colors.right, 2, 40);
    bluePoint.position.set(10, 8, 10);
    scene.add(bluePoint);

    const violetPoint = new THREE.PointLight(colors.left, 2, 40);
    violetPoint.position.set(-10, 8, 10);
    scene.add(violetPoint);

    // 88 Keys Geometry
    const isBlackTable = [false, true, false, true, false, false, true, false, true, false, true, false];
    const totalWhiteKeys = 52;
    const whiteKeyWidth = 0.68;
    const whiteKeyDepth = 4.0;
    const whiteKeyHeight = 0.5;

    const blackKeyWidth = 0.42;
    const blackKeyDepth = 2.5;
    const blackKeyHeight = 0.8;

    const totalWidth = totalWhiteKeys * whiteKeyWidth;
    const startX = -totalWidth / 2.0;

    const keyPositions = new Map<number, number>();
    const keyIsBlack = new Map<number, boolean>();
    const keyMeshes = new Map<number, THREE.Mesh>();
    const keyOriginalY = new Map<number, number>();
    const keyOriginalRotX = new Map<number, number>();

    // White keys
    let currentWhiteIndex = 0;
    for (let midi = 21; midi <= 108; midi++) {
      const isBlack = isBlackTable[midi % 12];
      keyIsBlack.set(midi, isBlack);
      if (!isBlack) {
        const x = startX + (currentWhiteIndex + 0.5) * whiteKeyWidth;
        keyPositions.set(midi, x);
        currentWhiteIndex++;
      }
    }

    // Black keys positioned between white keys
    for (let midi = 21; midi <= 108; midi++) {
      if (keyIsBlack.get(midi)) {
        const prevX = keyPositions.get(midi - 1);
        const nextX = keyPositions.get(midi + 1);
        let x = 0;
        if (prevX !== undefined && nextX !== undefined) {
          x = (prevX + nextX) / 2.0;
        } else if (prevX !== undefined) {
          x = prevX + whiteKeyWidth / 2.0;
        } else if (nextX !== undefined) {
          x = nextX - whiteKeyWidth / 2.0;
        }
        keyPositions.set(midi, x);
      }
    }

    // Materials
    const whiteMat = new THREE.MeshStandardMaterial({
      color: 0xf3f4f6,
      roughness: 0.2,
      metalness: 0.1,
    });
    const blackMat = new THREE.MeshStandardMaterial({
      color: 0x111317,
      roughness: 0.3,
      metalness: 0.3,
    });

    // Create 88 Key Meshes
    for (let midi = 21; midi <= 108; midi++) {
      const isBlack = keyIsBlack.get(midi)!;
      const x = keyPositions.get(midi)!;

      if (!isBlack) {
        const geom = new THREE.BoxGeometry(whiteKeyWidth * 0.94, whiteKeyHeight, whiteKeyDepth);
        const mesh = new THREE.Mesh(geom, whiteMat.clone());
        mesh.position.set(x, 0, 8);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        keyMeshes.set(midi, mesh);
        keyOriginalY.set(midi, 0);
        keyOriginalRotX.set(midi, 0);
      } else {
        const geom = new THREE.BoxGeometry(blackKeyWidth, blackKeyHeight, blackKeyDepth);
        const mesh = new THREE.Mesh(geom, blackMat.clone());
        mesh.position.set(x, 0.28, 7.2);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        keyMeshes.set(midi, mesh);
        keyOriginalY.set(midi, 0.28);
        keyOriginalRotX.set(midi, 0);
      }
    }

    // Piano base chassis
    const chassisGeom = new THREE.BoxGeometry(totalWidth + 1.2, 1.2, whiteKeyDepth + 1.0);
    const chassisMat = new THREE.MeshStandardMaterial({ color: 0x0c0e14, roughness: 0.8 });
    const chassis = new THREE.Mesh(chassisGeom, chassisMat);
    chassis.position.set(0, -0.65, 8.2);
    scene.add(chassis);

    // Strike line indicator
    const strikeGeom = new THREE.PlaneGeometry(totalWidth + 0.5, 0.08);
    const strikeMat = new THREE.MeshBasicMaterial({ color: colors.strike, transparent: true, opacity: 0.8 });
    const strikeLine = new THREE.Mesh(strikeGeom, strikeMat);
    strikeLine.rotation.x = -Math.PI / 2;
    strikeLine.position.set(0, 0.35, 5.9);
    scene.add(strikeLine);

    // Dynamic 3D Falling Notes instanced / dynamic meshes
    const noteMeshes: { mesh: THREE.Mesh; note: NoteDto }[] = [];
    const rightNoteMat = new THREE.MeshStandardMaterial({
      color: colors.right,
      emissive: colors.rightEmissive,
      emissiveIntensity: 0.6,
      roughness: 0.3,
    });
    const leftNoteMat = new THREE.MeshStandardMaterial({
      color: colors.left,
      emissive: colors.leftEmissive,
      emissiveIntensity: 0.6,
      roughness: 0.3,
    });

    const lookahead = 3.0; // seconds ahead
    const travelDistance = 32.0; // distance notes travel along Z
    const strikeZ = 5.9; // Z coordinate where notes strike piano keys

    // Create 3D note bars for each note
    previewData.notes.forEach((n) => {
      const isBlack = keyIsBlack.get(n.pitch) ?? false;
      const width = isBlack ? blackKeyWidth * 0.9 : whiteKeyWidth * 0.85;
      const length = Math.max(0.3, (n.duration / lookahead) * travelDistance);

      const geom = new THREE.BoxGeometry(width, 0.25, length);
      const mat = n.hand === "left" ? leftNoteMat : rightNoteMat;
      const mesh = new THREE.Mesh(geom, mat);
      mesh.visible = false;
      scene.add(mesh);
      noteMeshes.push({ mesh, note: n });
    });

    // Helper to create stylized 3D anime hand with articulated fingers & soft shadow
    const create3DHand = (isLeft: boolean) => {
      const group = new THREE.Group();
      
      const skinMat = new THREE.MeshStandardMaterial({
        color: 0xf7d6c4,
        roughness: 0.45,
        metalness: 0.05,
      });
      const shadowMat = new THREE.MeshBasicMaterial({
        color: 0x050508,
        transparent: true,
        opacity: 0.42,
      });

      // Palm body
      const palmGeom = new THREE.BoxGeometry(2.3, 0.38, 1.9);
      const palm = new THREE.Mesh(palmGeom, skinMat);
      palm.position.set(0, 0, 0);
      group.add(palm);

      // Wrist
      const wristGeom = new THREE.BoxGeometry(1.7, 0.32, 1.7);
      const wrist = new THREE.Mesh(wristGeom, skinMat);
      wrist.position.set(0, 0.04, 1.5);
      group.add(wrist);

      // 5 Fingers with pivot groups: [Thumb, Index, Middle, Ring, Pinky]
      const fingerPivots: THREE.Group[] = [];
      const fingerSpacings = isLeft
        ? [0.92, 0.44, 0.0, -0.44, -0.82] // Left: Thumb on right (+)
        : [-0.92, -0.44, 0.0, 0.44, 0.82]; // Right: Thumb on left (-)
      const fingerLengths = [1.3, 1.7, 1.9, 1.75, 1.4];

      for (let i = 0; i < 5; i++) {
        const pivot = new THREE.Group();
        pivot.position.set(fingerSpacings[i], 0, -0.9);

        const flen = fingerLengths[i];
        const fGeom = new THREE.BoxGeometry(0.32, 0.28, flen);
        const fMesh = new THREE.Mesh(fGeom, skinMat);
        fMesh.position.set(0, 0, -flen / 2.0);
        pivot.add(fMesh);

        fingerPivots.push(pivot);
        group.add(pivot);
      }

      // Soft drop shadow plane projected beneath the hand on the keys
      const shadowGeom = new THREE.PlaneGeometry(3.6, 3.2);
      const shadowMesh = new THREE.Mesh(shadowGeom, shadowMat);
      shadowMesh.rotation.x = -Math.PI / 2;
      shadowMesh.position.set(0, -0.48, 0.2);
      group.add(shadowMesh);

      // Tilt slightly inward towards the keyboard center
      group.rotation.y = isLeft ? 0.16 : -0.16;
      group.position.set(isLeft ? -6 : 6, 0.9, 9.2);

      return { group, fingerPivots };
    };

    const leftHand = create3DHand(true);
    const rightHand = create3DHand(false);
    scene.add(leftHand.group);
    scene.add(rightHand.group);

    // Animation Loop
    let animId: number;
    let targetLeftX = -6;
    let targetRightX = 6;

    const animate = () => {
      animId = requestAnimationFrame(animate);

      const t = timeRef.current;
      const tMax = t + lookahead;

      // Reset active keys
      keyMeshes.forEach((mesh, midi) => {
        const isBlack = keyIsBlack.get(midi)!;
        const origY = keyOriginalY.get(midi)!;
        mesh.position.y = origY;
        mesh.rotation.x = 0;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.color.setHex(isBlack ? 0x111317 : 0xf3f4f6);
        mat.emissive.setHex(0x000000);
      });

      let activeCount = 0;
      let leftHandXSum = 0;
      let leftHandXCount = 0;
      let rightHandXSum = 0;
      let rightHandXCount = 0;
      const leftFingerActive = [false, false, false, false, false];
      const rightFingerActive = [false, false, false, false, false];

      // Update falling notes and active piano keys
      noteMeshes.forEach(({ mesh, note }) => {
        const startT = note.start_time;
        const endT = note.end_time;

        if (endT < t || startT > tMax) {
          mesh.visible = false;
          return;
        }

        mesh.visible = true;

        // Calculate Z position: from far away (-travelDistance + strikeZ) toward strike line (strikeZ)
        const noteTravelProgress = (startT - t) / lookahead;
        const noteZ = strikeZ - noteTravelProgress * travelDistance;
        const noteLength = Math.max(0.3, (note.duration / lookahead) * travelDistance);
        const centerZ = noteZ - noteLength / 2.0;

        const posX = keyPositions.get(note.pitch) ?? 0;
        mesh.position.set(posX, 0.45, centerZ);

        // Active note striking the piano key right now
        if (startT <= t && t <= endT) {
          activeCount++;
          const keyMesh = keyMeshes.get(note.pitch);
          if (keyMesh) {
            const isRight = note.hand === "right";
            const pressColor = isRight ? colors.right : colors.left;
            const emissiveColor = isRight ? colors.rightEmissive : colors.leftEmissive;

            // Depress key downwards and tilt
            keyMesh.position.y = (keyOriginalY.get(note.pitch) || 0) - 0.12;
            keyMesh.rotation.x = 0.035;

            const mat = keyMesh.material as THREE.MeshStandardMaterial;
            mat.color.setHex(pressColor);
            mat.emissive.setHex(emissiveColor);
            mat.emissiveIntensity = 0.8;

            // Track hand target position and finger flex
            if (isRight) {
              rightHandXSum += posX;
              rightHandXCount++;
              const diff = posX - rightHand.group.position.x;
              if (diff < -0.6) rightFingerActive[0] = true;
              else if (diff < -0.2) rightFingerActive[1] = true;
              else if (diff < 0.2) rightFingerActive[2] = true;
              else if (diff < 0.6) rightFingerActive[3] = true;
              else rightFingerActive[4] = true;
            } else {
              leftHandXSum += posX;
              leftHandXCount++;
              const diff = posX - leftHand.group.position.x;
              if (diff > 0.6) leftFingerActive[0] = true;
              else if (diff > 0.2) leftFingerActive[1] = true;
              else if (diff > -0.2) leftFingerActive[2] = true;
              else if (diff > -0.6) leftFingerActive[3] = true;
              else leftFingerActive[4] = true;
            }
          }
        }
      });

      // Smooth hand tracking across piano keyboard
      if (leftHandXCount > 0) targetLeftX = leftHandXSum / leftHandXCount;
      if (rightHandXCount > 0) targetRightX = rightHandXSum / rightHandXCount;

      leftHand.group.position.x += (targetLeftX - leftHand.group.position.x) * 0.18;
      rightHand.group.position.x += (targetRightX - rightHand.group.position.x) * 0.18;

      // Animate articulated finger press rotations
      for (let i = 0; i < 5; i++) {
        const targetLeftRot = leftFingerActive[i] ? 0.32 : 0.0;
        const targetRightRot = rightFingerActive[i] ? 0.32 : 0.0;
        leftHand.fingerPivots[i].rotation.x += (targetLeftRot - leftHand.fingerPivots[i].rotation.x) * 0.35;
        rightHand.fingerPivots[i].rotation.x += (targetRightRot - rightHand.fingerPivots[i].rotation.x) * 0.35;
      }

      // Hands visibility toggle
      leftHand.group.visible = showHandsRef.current;
      rightHand.group.visible = showHandsRef.current;

      setActiveNotesCount(activeCount);
      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight || 520;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [viewMode, selectedTheme]);

  // Audio Play / Pause Handler
  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((e) => console.error("Playback failed:", e));
    }
  };

  const handleSeek = (newTime: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
    timeRef.current = newTime;
  };

  const handleApplyPreset = async () => {
    setIsApplying(true);
    setApplySuccess(false);
    try {
      await api.patchProject(projectId, {
        visual_settings: {
          sound_preset: selectedSound,
          theme: selectedTheme,
          hands_style: showHands ? "anime" : "off",
        },
      });
      // Trigger background re-render with new instrument and theme
      await api.triggerRender(projectId);
      setApplySuccess(true);
      setTimeout(() => setApplySuccess(false), 3000);
    } catch (err: any) {
      alert("Failed to apply settings: " + (err.message || err));
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="bg-dark-900 border border-dark-700/60 rounded-3xl overflow-hidden shadow-2xl">
      {/* Hidden audio element for precise audio/visual synchronization */}
      <audio
        ref={audioRef}
        src={api.getAudioUrl(projectId)}
        onTimeUpdate={() => {
          if (audioRef.current) {
            const t = audioRef.current.currentTime;
            setCurrentTime(t);
            timeRef.current = t;
          }
        }}
        onEnded={() => setIsPlaying(false)}
      />

      {/* Header bar */}
      <div className="px-6 py-4 border-b border-dark-700/60 flex flex-wrap items-center justify-between gap-4 bg-dark-850/60">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-electric-500/10 border border-electric-500/20 flex items-center justify-center text-electric-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Interactive Piano 3D Studio</h2>
            <p className="text-xs text-gray-400 font-mono">
              {previewData.note_count} Notalar • {previewData.tempo.toFixed(0)} BPM • 88-Klavish Standart Royal
            </p>
          </div>
        </div>

        {/* View mode & Studio Customization Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Theme Selector */}
          <div className="flex items-center space-x-1.5 bg-dark-800 border border-dark-700 rounded-xl px-2.5 py-1.5 text-xs text-gray-300">
            <Layers className="w-3.5 h-3.5 text-sky-400" />
            <select
              value={selectedTheme}
              onChange={(e) => setSelectedTheme(e.target.value)}
              className="bg-transparent text-white focus:outline-none text-xs font-semibold cursor-pointer"
            >
              <option value="falling_note_anime">Falling Note Anime</option>
              <option value="cyberpunk_neon">Cyberpunk Neon</option>
              <option value="royal_gold">Royal Gold</option>
              <option value="emerald_nature">Emerald Nature</option>
              <option value="sunset_lofi">Sunset Lo-Fi</option>
              <option value="synthesia_pro">Synthesia Pro</option>
            </select>
          </div>

          {/* Sound Preset Selector */}
          <div className="flex items-center space-x-1.5 bg-dark-800 border border-dark-700 rounded-xl px-2.5 py-1.5 text-xs text-gray-300">
            <Music className="w-3.5 h-3.5 text-violet-400" />
            <select
              value={selectedSound}
              onChange={(e) => setSelectedSound(e.target.value)}
              className="bg-transparent text-white focus:outline-none text-xs font-semibold cursor-pointer"
            >
              <option value="concert_grand">Concert Grand (Salamander)</option>
              <option value="bright_pop">Bright Pop Grand (Yamaha C7)</option>
              <option value="vintage_upright">Vintage Upright (Saloon)</option>
              <option value="rhodes_ep">Neo-Soul Rhodes (Tine EP)</option>
              <option value="dx7_fm">80s FM Piano (DX7)</option>
              <option value="piano_strings">Piano & Strings Ensemble</option>
              <option value="music_box">Dreamy Music Box</option>
            </select>
          </div>

          {/* Apply button */}
          <button
            onClick={handleApplyPreset}
            disabled={isApplying}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              applySuccess
                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                : "bg-dark-800 text-gray-300 border-dark-700 hover:text-white hover:border-electric-400"
            }`}
            title="Pianino va mavzuni saqlash hamda videoni qayta render qilish"
          >
            {isApplying ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-electric-400" />
            ) : applySuccess ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 text-gray-400" />
            )}
            <span>{isApplying ? "Saqlanmoqda..." : applySuccess ? "Tayyor!" : "Qayta Render"}</span>
          </button>

          {/* Hands Toggle */}
          {viewMode === "3d" && (
            <button
              onClick={() => {
                const nextVal = !showHands;
                setShowHands(nextVal);
                showHandsRef.current = nextVal;
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                showHands
                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40 shadow-sm shadow-emerald-500/20"
                  : "bg-dark-800 text-gray-400 border-dark-700 hover:text-white"
              }`}
            >
              Qo‘llar: {showHands ? "ON" : "OFF"}
            </button>
          )}

          {/* 3D / Video Mode */}
          <div className="bg-dark-800 p-1 rounded-xl border border-dark-700 flex text-xs font-medium">
            <button
              onClick={() => setViewMode("3d")}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                viewMode === "3d" ? "bg-electric-600 text-white shadow-md shadow-electric-600/30" : "text-gray-400 hover:text-white"
              }`}
            >
              3D Sahna
            </button>
            <button
              onClick={() => setViewMode("video")}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                viewMode === "video" ? "bg-electric-600 text-white shadow-md shadow-electric-600/30" : "text-gray-400 hover:text-white"
              }`}
            >
              720p Video
            </button>
          </div>

          <button
            onClick={onGoToExport}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-electric-500 to-violet-600 text-white shadow-md shadow-electric-600/20 hover:scale-105 transition-all"
          >
            <Film className="w-3.5 h-3.5" />
            <span>Export MP4</span>
          </button>
        </div>
      </div>

      {/* Main Canvas / Video Area */}
      <div className="relative w-full h-[540px] bg-dark-950 overflow-hidden select-none">
        {viewMode === "3d" ? (
          <>
            <div ref={containerRef} className="w-full h-full" />
            
            {/* Visual Overlays */}
            <div className="absolute top-4 left-4 pointer-events-none flex flex-col space-y-1.5">
              <div className="px-3 py-1 rounded-full text-[11px] font-mono bg-dark-900/80 backdrop-blur-md border border-dark-700/80 text-gray-300 flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-electric-cyan animate-pulse" />
                <span>Bir vaqtdagi notalar: {activeNotesCount}</span>
              </div>
              <div className="px-3 py-1 rounded-full text-[11px] font-mono bg-dark-900/80 backdrop-blur-md border border-dark-700/80 text-gray-400">
                <span>O‘ng Qo‘l (Melodiya) &bull; Chap Qo‘l (Bas va Akkordlar)</span>
              </div>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center p-4">
            <video
              src={api.getVideoUrl(projectId)}
              controls
              className="w-full h-full max-h-[500px] object-contain rounded-2xl border border-dark-700 shadow-2xl"
            />
          </div>
        )}
      </div>

      {/* Playback Controls Bar */}
      <div className="px-6 py-4 border-t border-dark-700/60 bg-dark-850/80 flex flex-wrap items-center justify-between gap-4">
        {/* Play / Pause & Rewind */}
        <div className="flex items-center space-x-3">
          <button
            onClick={togglePlay}
            className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-electric-500 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-electric-500/25 hover:scale-105 active:scale-95 transition-all"
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
          </button>

          <button
            onClick={() => handleSeek(0)}
            className="w-9 h-9 rounded-xl bg-dark-800 hover:bg-dark-750 border border-dark-700 flex items-center justify-center text-gray-300 hover:text-white transition-colors"
            title="Boshiga qaytarish"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <div className="text-xs font-mono text-gray-300">
            <span>{Math.floor(currentTime / 60)}:{Math.floor(currentTime % 60).toString().padStart(2, "0")}</span>
            <span className="text-gray-500 mx-1">/</span>
            <span className="text-gray-500">{Math.floor(totalDuration / 60)}:{Math.floor(totalDuration % 60).toString().padStart(2, "0")}</span>
          </div>
        </div>

        {/* Timeline Slider */}
        <div className="flex-1 min-w-[200px] max-w-xl mx-2">
          <input
            type="range"
            min={0}
            max={totalDuration}
            step={0.05}
            value={currentTime}
            onChange={(e) => handleSeek(parseFloat(e.target.value))}
            className="w-full h-2 bg-dark-750 rounded-lg appearance-none cursor-pointer accent-electric-400 focus:outline-none"
          />
        </div>

        {/* Speed & Volume */}
        <div className="flex items-center space-x-4">
          {/* Speed */}
          <div className="flex items-center space-x-1.5 text-xs font-mono bg-dark-800 px-2.5 py-1.5 rounded-xl border border-dark-700">
            <Gauge className="w-3.5 h-3.5 text-gray-400" />
            <select
              value={playbackSpeed}
              onChange={(e) => {
                const spd = parseFloat(e.target.value);
                setPlaybackSpeed(spd);
                if (audioRef.current) audioRef.current.playbackRate = spd;
              }}
              className="bg-transparent text-gray-200 focus:outline-none cursor-pointer"
            >
              <option value="0.5">0.5x</option>
              <option value="0.75">0.75x</option>
              <option value="1.0">1.0x</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
            </select>
          </div>

          {/* Volume */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                const nextMuted = !isMuted;
                setIsMuted(nextMuted);
                if (audioRef.current) audioRef.current.muted = nextMuted;
              }}
              className="text-gray-400 hover:text-white"
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={(e) => {
                const vol = parseFloat(e.target.value);
                setVolume(vol);
                setIsMuted(false);
                if (audioRef.current) {
                  audioRef.current.volume = vol;
                  audioRef.current.muted = false;
                }
              }}
              className="w-16 h-1.5 bg-dark-750 rounded-lg appearance-none cursor-pointer accent-electric-400"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
