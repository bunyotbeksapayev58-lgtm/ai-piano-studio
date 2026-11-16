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
  Sliders
} from "lucide-react";
import { NoteDto, PreviewDataResponse, api } from "@/services/api";

interface PianoPreviewProps {
  projectId: string;
  previewData: PreviewDataResponse;
  onGoToExport: () => void;
  onOpenMidiEditor?: () => void;
}

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

    const bluePoint = new THREE.PointLight(0x3b82f6, 2, 40);
    bluePoint.position.set(10, 8, 10);
    scene.add(bluePoint);

    const violetPoint = new THREE.PointLight(0x8b5cf6, 2, 40);
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
    const startX = -totalWidth / 2 + whiteKeyWidth / 2;

    const keyMeshes: Map<number, THREE.Mesh> = new Map();
    const keyOriginalY: Map<number, number> = new Map();
    const keyOriginalRotX: Map<number, number> = new Map();
    const keyIsBlack: Map<number, boolean> = new Map();
    const keyXCenter: Map<number, number> = new Map();

    const whiteMat = new THREE.MeshStandardMaterial({
      color: 0xeeeeee,
      roughness: 0.3,
      metalness: 0.1,
    });
    const blackMat = new THREE.MeshStandardMaterial({
      color: 0x18181c,
      roughness: 0.2,
      metalness: 0.2,
    });

    let whiteCount = 0;
    // Precompute positions
    for (let midi = 21; midi <= 108; midi++) {
      const isBlack = isBlackTable[midi % 12];
      if (!isBlack) {
        const x = startX + whiteCount * whiteKeyWidth;
        keyXCenter.set(midi, x);
        whiteCount++;
      }
    }

    for (let midi = 21; midi <= 108; midi++) {
      const isBlack = isBlackTable[midi % 12];
      if (isBlack) {
        const prevX = keyXCenter.get(midi - 1) || 0;
        const nextX = keyXCenter.get(midi + 1) || 0;
        keyXCenter.set(midi, (prevX + nextX) / 2);
      }
    }

    // Build 3D Key meshes
    for (let midi = 21; midi <= 108; midi++) {
      const isBlack = isBlackTable[midi % 12];
      const x = keyXCenter.get(midi) || 0;
      keyIsBlack.set(midi, isBlack);

      if (!isBlack) {
        const geom = new THREE.BoxGeometry(whiteKeyWidth - 0.04, whiteKeyHeight, whiteKeyDepth);
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
    const strikeMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.8 });
    const strikeLine = new THREE.Mesh(strikeGeom, strikeMat);
    strikeLine.rotation.x = -Math.PI / 2;
    strikeLine.position.set(0, 0.35, 5.9);
    scene.add(strikeLine);

    // Dynamic 3D Falling Notes instanced / dynamic meshes
    // Create note pool
    const noteMeshes: { mesh: THREE.Mesh; note: NoteDto }[] = [];
    const rightNoteMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      emissive: 0x1d4ed8,
      emissiveIntensity: 0.6,
      roughness: 0.3,
    });
    const leftNoteMat = new THREE.MeshStandardMaterial({
      color: 0xa855f7,
      emissive: 0x7e22ce,
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
      const fingerLengths = [1.1, 1.6, 1.8, 1.55, 1.25];

      for (let i = 0; i < 5; i++) {
        const fingerPivot = new THREE.Group();
        const fX = fingerSpacings[i];
        const fZ = i === 0 ? 0.3 : -0.95;
        fingerPivot.position.set(fX, 0, fZ);

        const fLen = fingerLengths[i];
        const fingerGeom = new THREE.BoxGeometry(0.3, 0.28, fLen);
        const fingerMesh = new THREE.Mesh(fingerGeom, skinMat);
        fingerMesh.position.set(0, -0.05, -fLen / 2);
        fingerPivot.add(fingerMesh);

        if (i === 0) {
          fingerPivot.rotation.y = isLeft ? 0.45 : -0.45;
        }

        group.add(fingerPivot);
        fingerPivots.push(fingerPivot);
      }

      // Soft drop shadow plane on keys
      const shadowGeom = new THREE.PlaneGeometry(3.6, 3.2);
      const shadowMesh = new THREE.Mesh(shadowGeom, shadowMat);
      shadowMesh.rotation.x = -Math.PI / 2;
      shadowMesh.position.set(0, -0.52, -0.8);
      group.add(shadowMesh);

      // Inward hand angle
      group.rotation.z = isLeft ? -0.15 : 0.15;
      group.rotation.y = isLeft ? 0.12 : -0.12;

      return { group, fingers: fingerPivots };
    };

    const leftHand = create3DHand(true);
    const rightHand = create3DHand(false);
    leftHand.group.position.set(-6.5, 0.95, 7.8);
    rightHand.group.position.set(6.5, 0.95, 7.8);
    scene.add(leftHand.group);
    scene.add(rightHand.group);

    // Animation Loop
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);

      const t = timeRef.current;
      let activeCount = 0;
      const activeMidiSet = new Set<number>();
      const activeNotesList: NoteDto[] = [];

      // Update falling notes positions
      noteMeshes.forEach(({ mesh, note }) => {
        const startT = note.start_time;
        const endT = note.end_time;

        // Is note currently on screen?
        if (endT >= t && startT <= t + lookahead) {
          mesh.visible = true;
          const x = keyXCenter.get(note.pitch) ?? 0;
          const length = (mesh.geometry as THREE.BoxGeometry).parameters.depth;

          // When t == startT, front edge is at strikeZ
          const distFromStrike = ((startT - t) / lookahead) * travelDistance;
          const centerZ = strikeZ - distFromStrike - length / 2;

          mesh.position.set(x, 0.2, centerZ);

          if (t >= startT && t <= endT) {
            activeCount++;
            activeMidiSet.add(note.pitch);
            activeNotesList.push(note);
          }
        } else {
          mesh.visible = false;
        }
      });

      // Animate 88 Piano Keys
      for (let midi = 21; midi <= 108; midi++) {
        const mesh = keyMeshes.get(midi);
        if (!mesh) continue;
        const origY = keyOriginalY.get(midi) || 0;
        const mat = mesh.material as THREE.MeshStandardMaterial;

        if (activeMidiSet.has(midi)) {
          mesh.position.y = origY - 0.12;
          mesh.rotation.x = 0.04;
          const noteInfo = notesRef.current.find((n) => n.pitch === midi && t >= n.start_time && t <= n.end_time);
          if (noteInfo?.hand === "left") {
            mat.emissive.setHex(0xa855f7);
          } else {
            mat.emissive.setHex(0x38bdf8);
          }
          mat.emissiveIntensity = 0.9;
        } else {
          mesh.position.y = origY;
          mesh.rotation.x = 0;
          mat.emissive.setHex(0x000000);
          mat.emissiveIntensity = 0;
        }
      }

      // Animate 3D Hands
      const isHandsVisible = showHandsRef.current;
      leftHand.group.visible = isHandsVisible;
      rightHand.group.visible = isHandsVisible;

      if (isHandsVisible) {
        const lhNotes = activeNotesList.filter((n) => n.hand === "left");
        const rhNotes = activeNotesList.filter((n) => n.hand === "right");

        let targetLhX = -6.5;
        if (lhNotes.length > 0) {
          const avgX = lhNotes.reduce((acc, n) => acc + (keyXCenter.get(n.pitch) || 0), 0) / lhNotes.length;
          targetLhX = avgX;
        }
        let targetRhX = 6.5;
        if (rhNotes.length > 0) {
          const avgX = rhNotes.reduce((acc, n) => acc + (keyXCenter.get(n.pitch) || 0), 0) / rhNotes.length;
          targetRhX = avgX;
        }

        leftHand.group.position.x += (targetLhX - leftHand.group.position.x) * 0.14;
        rightHand.group.position.x += (targetRhX - rightHand.group.position.x) * 0.14;

        // Animate left hand fingers
        leftHand.fingers.forEach((finger, idx) => {
          const targetRot = lhNotes.length > 0 ? 0.22 : 0.04;
          finger.rotation.x += (targetRot - finger.rotation.x) * 0.2;
        });

        // Animate right hand fingers
        rightHand.fingers.forEach((finger, idx) => {
          const targetRot = rhNotes.length > 0 ? 0.22 : 0.04;
          finger.rotation.x += (targetRot - finger.rotation.x) * 0.2;
        });
      }

      setActiveNotesCount(activeCount);
      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!containerRef.current) return;
      const newW = containerRef.current.clientWidth;
      const newH = containerRef.current.clientHeight || 520;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      if (container) container.innerHTML = "";
    };
  }, [viewMode, previewData]);

  // Handle Play/Pause
  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch((e) => console.error(e));
    }
  };

  const handleRestart = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    setCurrentTime(0);
    timeRef.current = 0;
    if (!isPlaying) {
      audioRef.current.play().then(() => setIsPlaying(true));
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = parseFloat(e.target.value);
    setCurrentTime(target);
    timeRef.current = target;
    if (audioRef.current) {
      audioRef.current.currentTime = target;
    }
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = val;
    }
    if (val === 0) setIsMuted(true);
    else setIsMuted(false);
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    if (isMuted) {
      audioRef.current.volume = volume || 0.8;
      setIsMuted(false);
    } else {
      audioRef.current.volume = 0;
      setIsMuted(true);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="bg-dark-900 border border-dark-700/60 rounded-2xl overflow-hidden shadow-2xl">
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
          <div className="w-8 h-8 rounded-lg bg-electric-500/10 border border-electric-500/20 flex items-center justify-center text-electric-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">Interactive Piano Preview</h2>
            <p className="text-xs text-gray-400 font-mono">
              {previewData.note_count} Notes Detected • {previewData.tempo.toFixed(0)} BPM • 88-Key Standard Range
            </p>
          </div>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center space-x-2">
          <div className="bg-dark-800 p-1 rounded-xl border border-dark-700 flex text-xs font-medium">
            <button
              onClick={() => setViewMode("3d")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                viewMode === "3d" ? "bg-electric-600 text-white shadow-md shadow-electric-600/30" : "text-gray-400 hover:text-white"
              }`}
            >
              3D Falling Notes
            </button>
            <button
              onClick={() => setViewMode("video")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                viewMode === "video" ? "bg-electric-600 text-white shadow-md shadow-electric-600/30" : "text-gray-400 hover:text-white"
              }`}
            >
              Rendered 720p MP4
            </button>
          </div>

          {viewMode === "3d" && (
            <button
              onClick={() => {
                const nextVal = !showHands;
                setShowHands(nextVal);
                showHandsRef.current = nextVal;
              }}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                showHands
                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40 shadow-sm shadow-emerald-500/20"
                  : "bg-dark-800 text-gray-400 border-dark-700 hover:text-white"
              }`}
              title="Toggle Animated Playing Hands"
            >
              Hands: {showHands ? "ON" : "OFF"}
            </button>
          )}

          {onOpenMidiEditor && (
            <button
              onClick={onOpenMidiEditor}
              className="flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-dark-800 hover:bg-dark-700 text-electric-400 border border-electric-500/30 transition-all"
              title="Open Piano Roll MIDI Editor"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Edit MIDI</span>
            </button>
          )}

          <button
            onClick={onGoToExport}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-electric-500 to-violet-600 text-white shadow-md shadow-electric-600/20 hover:scale-105 transition-all"
          >
            <Film className="w-3.5 h-3.5" />
            <span>Go to Export</span>
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
                <span>Simultaneous Notes: {activeNotesCount}</span>
              </div>
              <div className="px-3 py-1 rounded-full text-[11px] font-mono bg-dark-900/80 backdrop-blur-md border border-dark-700/80 text-gray-400">
                <span className="text-electric-400">■ Blue: Right Hand (Melody)</span> &bull; <span className="text-violet-400">■ Violet: Left Hand (Bass)</span>
              </div>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center p-4">
            <video
              src={api.getVideoUrl(projectId)}
              controls
              className="w-full h-full max-h-[500px] object-contain rounded-xl border border-dark-700 shadow-2xl"
            />
          </div>
        )}
      </div>

      {/* Playback Controls Bar */}
      <div className="p-4 sm:p-6 bg-dark-850/80 border-t border-dark-700/60 space-y-4">
        {/* Scrubber slider */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-mono text-gray-400">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(totalDuration)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={totalDuration}
            step={0.05}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1.5 bg-dark-700 rounded-lg appearance-none cursor-pointer accent-electric-500 hover:accent-electric-400"
          />
        </div>

        {/* Buttons and volume */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <button
              onClick={handleRestart}
              className="p-2.5 rounded-xl bg-dark-800 text-gray-300 hover:text-white hover:bg-dark-700 transition-colors border border-dark-700/80"
              title="Restart"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={togglePlay}
              className="p-3.5 rounded-xl bg-gradient-to-r from-electric-600 to-violet-600 text-white shadow-lg shadow-electric-600/30 hover:scale-105 active:scale-95 transition-all"
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
            </button>

            {/* Speed pills */}
            <div className="flex items-center space-x-1 bg-dark-800/80 p-1 rounded-xl border border-dark-700/80">
              <Gauge className="w-3.5 h-3.5 text-gray-400 ml-1.5 mr-1" />
              {[0.5, 0.75, 1.0, 1.25, 1.5].map((s) => (
                <button
                  key={s}
                  onClick={() => handleSpeedChange(s)}
                  className={`px-2 py-1 text-xs rounded-lg font-mono transition-all ${
                    playbackSpeed === s
                      ? "bg-electric-500/20 text-electric-400 font-semibold"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>

          {/* Volume control */}
          <div className="flex items-center space-x-3">
            <button onClick={toggleMute} className="text-gray-400 hover:text-white">
              {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-24 h-1.5 bg-dark-700 rounded-lg appearance-none cursor-pointer accent-electric-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
