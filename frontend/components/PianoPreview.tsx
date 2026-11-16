"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
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
  Check,
  Maximize2
} from "lucide-react";
import { NoteDto, PreviewDataResponse, api } from "@/services/api";

interface PianoPreviewProps {
  projectId: string;
  previewData: PreviewDataResponse;
  onGoToExport: () => void;
  onOpenMidiEditor?: () => void;
}

const THEME_2D_COLORS: Record<string, {
  right: string;
  rightGradient: [string, string];
  rightStroke: string;
  left: string;
  leftGradient: [string, string];
  leftStroke: string;
  strike: string;
  pedal: string;
}> = {
  falling_note_anime: {
    right: "#38bdf8",
    rightGradient: ["#38bdf8", "#0284c7"],
    rightStroke: "#7dd3fc",
    left: "#10b981",
    leftGradient: ["#10b981", "#059669"],
    leftStroke: "#34d399",
    strike: "#38bdf8",
    pedal: "#38bdf8"
  },
  cyberpunk_neon: {
    right: "#f43f8e",
    rightGradient: ["#f43f8e", "#be123c"],
    rightStroke: "#fb7185",
    left: "#06b6d4",
    leftGradient: ["#06b6d4", "#0891b2"],
    leftStroke: "#22d3ee",
    strike: "#f43f8e",
    pedal: "#f43f8e"
  },
  royal_gold: {
    right: "#f59e0b",
    rightGradient: ["#f59e0b", "#b45309"],
    rightStroke: "#fde68a",
    left: "#fbbf24",
    leftGradient: ["#fbbf24", "#d97706"],
    leftStroke: "#fef08a",
    strike: "#f59e0b",
    pedal: "#f59e0b"
  },
  emerald_nature: {
    right: "#14b8a6",
    rightGradient: ["#14b8a6", "#0f766e"],
    rightStroke: "#5eead4",
    left: "#22c55e",
    leftGradient: ["#22c55e", "#15803d"],
    leftStroke: "#86efac",
    strike: "#14b8a6",
    pedal: "#14b8a6"
  },
  sunset_lofi: {
    right: "#fb7185",
    rightGradient: ["#fb7185", "#e11d48"],
    rightStroke: "#fecdd3",
    left: "#c084fc",
    leftGradient: ["#c084fc", "#9333ea"],
    leftStroke: "#e9d5ff",
    strike: "#fb7185",
    pedal: "#fb7185"
  },
  synthesia_pro: {
    right: "#2563eb",
    rightGradient: ["#3b82f6", "#1d4ed8"],
    rightStroke: "#93c5fd",
    left: "#84cc16",
    leftGradient: ["#a3e635", "#4d7c0f"],
    leftStroke: "#bef264",
    strike: "#ffffff",
    pedal: "#38bdf8"
  }
};

const THEME_3D_COLORS: Record<string, { right: number; rightEmissive: number; left: number; leftEmissive: number; strike: number }> = {
  falling_note_anime: { right: 0x38bdf8, rightEmissive: 0x0284c7, left: 0x10b981, leftEmissive: 0x059669, strike: 0x38bdf8 },
  cyberpunk_neon: { right: 0xf43f8e, rightEmissive: 0xbe123c, left: 0x06b6d4, leftEmissive: 0x0891b2, strike: 0xf43f8e },
  royal_gold: { right: 0xf59e0b, rightEmissive: 0xb45309, left: 0xfbbf24, leftEmissive: 0xd97706, strike: 0xf59e0b },
  emerald_nature: { right: 0x14b8a6, rightEmissive: 0x0f766e, left: 0x22c55e, leftEmissive: 0x15803d, strike: 0x14b8a6 },
  sunset_lofi: { right: 0xfb7185, rightEmissive: 0xe11d48, left: 0xc084fc, leftEmissive: 0x9333ea, strike: 0xfb7185 },
  synthesia_pro: { right: 0x2563eb, rightEmissive: 0x1d4ed8, left: 0x84cc16, leftEmissive: 0x4d7c0f, strike: 0xffffff },
};

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const isBlackKeyTable = [false, true, false, true, false, false, true, false, true, false, true, false];

export const PianoPreview: React.FC<PianoPreviewProps> = ({
  projectId,
  previewData,
  onGoToExport,
  onOpenMidiEditor,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [volume, setVolume] = useState<number>(0.9);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [activeNotesCount, setActiveNotesCount] = useState<number>(0);
  const [viewMode, setViewMode] = useState<"anime" | "3d" | "video">("anime");
  const [showHands, setShowHands] = useState<boolean>(true);
  const showHandsRef = useRef<boolean>(true);

  // Studio customization state
  const initialTheme = previewData.visual_settings?.theme || "falling_note_anime";
  const initialSound = previewData.visual_settings?.sound_preset || "concert_grand";
  const [selectedTheme, setSelectedTheme] = useState<string>(initialTheme);
  const [selectedSound, setSelectedSound] = useState<string>(initialSound);
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [applySuccess, setApplySuccess] = useState<boolean>(false);

  const timeRef = useRef<number>(0);
  const totalDuration = Math.max(previewData.duration_seconds || 5.0, 1.0);

  // Sync showHandsRef
  useEffect(() => {
    showHandsRef.current = showHands;
  }, [showHands]);

  // ---------------------------------------------------------------------------
  // 1. ANIME 2D FALLING NOTE CANVAS RENDERER (60 FPS, Matches Reference Image 2)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (viewMode !== "anime" || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const palette = THEME_2D_COLORS[selectedTheme] || THEME_2D_COLORS["falling_note_anime"];

    // Hand tracking positions (interpolated smoothly)
    let lhX = 400.0;
    let rhX = 800.0;
    let lhPress = [0.0, 0.0, 0.0, 0.0, 0.0];
    let rhPress = [0.0, 0.0, 0.0, 0.0, 0.0];

    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = (rect.height || 540) * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    const lookahead = 3.0; // seconds

    const render = () => {
      animId = requestAnimationFrame(render);

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = canvas.width / dpr;
      const H = canvas.height / dpr;
      const t = timeRef.current;

      // 88 Keys Geometry Calculation
      const totalWhiteKeys = 52;
      const whiteKeyW = W / totalWhiteKeys;
      const blackKeyW = whiteKeyW * 0.65;
      const kbHeight = Math.min(180, Math.max(140, H * 0.28));
      const kbTop = H - kbHeight;
      const strikeY = kbTop;
      const blackKeyH = kbHeight * 0.62;

      // Map key positions
      const keyGeometry = new Map<number, { isBlack: boolean; xCenter: number; xLeft: number; width: number }>();
      let whiteIdx = 0;
      for (let midi = 21; midi <= 108; midi++) {
        const isBlack = isBlackKeyTable[midi % 12];
        if (!isBlack) {
          const xLeft = whiteIdx * whiteKeyW;
          keyGeometry.set(midi, {
            isBlack: false,
            xCenter: xLeft + whiteKeyW / 2,
            xLeft,
            width: whiteKeyW
          });
          whiteIdx++;
        }
      }

      // Black keys positioned between white keys
      for (let midi = 21; midi <= 108; midi++) {
        if (isBlackKeyTable[midi % 12]) {
          const prev = keyGeometry.get(midi - 1);
          const next = keyGeometry.get(midi + 1);
          let cx = 0;
          if (prev && next) cx = (prev.xCenter + next.xCenter) / 2;
          else if (prev) cx = prev.xCenter + whiteKeyW / 2;
          else if (next) cx = next.xCenter - whiteKeyW / 2;

          keyGeometry.set(midi, {
            isBlack: true,
            xCenter: cx,
            xLeft: cx - blackKeyW / 2,
            width: blackKeyW
          });
        }
      }

      // Background: Dark Sleek Gradient
      const bgGrad = ctx.createLinearGradient(0, 0, 0, strikeY);
      bgGrad.addColorStop(0, "#07080c");
      bgGrad.addColorStop(1, "#10121a");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // Faint vertical lane lines separating key boundaries
      ctx.lineWidth = 1;
      for (let i = 0; i <= totalWhiteKeys; i++) {
        const x = Math.round(i * whiteKeyW);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.035)";
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, strikeY);
        ctx.stroke();
      }

      // Find Active Notes striking now
      const activeNotes: NoteDto[] = [];
      const visibleNotes: NoteDto[] = [];

      previewData.notes.forEach((n) => {
        if (n.start_time <= t && t <= n.end_time) {
          activeNotes.push(n);
        }
        if (t <= n.end_time && n.start_time <= t + lookahead) {
          visibleNotes.push(n);
        }
      });

      setActiveNotesCount(activeNotes.length);

      // -----------------------------------------------------------------------
      // Render Falling Notes (LOCKED AT STRIKE LINE, NEVER OVERLAPPING PAST KEYS)
      // -----------------------------------------------------------------------
      visibleNotes.forEach((note) => {
        const geom = keyGeometry.get(note.pitch);
        if (!geom) return;

        const isRight = note.hand === "right";
        const noteGradColors = isRight ? palette.rightGradient : palette.leftGradient;
        const noteStroke = isRight ? palette.rightStroke : palette.leftStroke;

        const startT = note.start_time;
        const endT = note.end_time;

        const backY = strikeY - ((endT - t) / lookahead) * strikeY;
        let frontY: number;

        if (t < startT) {
          frontY = strikeY - ((startT - t) / lookahead) * strikeY;
        } else {
          // CURRENTLY PLAYING: FRONT IS LOCKED AT STRIKE LINE!
          frontY = strikeY;
        }

        const noteH = Math.max(14, frontY - backY);
        const w = geom.isBlack ? blackKeyW * 0.90 : whiteKeyW * 0.86;
        const x = geom.xCenter - w / 2;
        const radius = Math.min(6, w / 2);

        // Falling Note Pill Bar
        ctx.save();
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, backY, w, noteH, radius);
        } else {
          ctx.rect(x, backY, w, noteH);
        }

        const noteFill = ctx.createLinearGradient(x, backY, x, frontY);
        noteFill.addColorStop(0, noteGradColors[0]);
        noteFill.addColorStop(1, noteGradColors[1]);
        ctx.fillStyle = noteFill;
        ctx.fill();

        ctx.strokeStyle = noteStroke;
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Front Circular Note Badge with Note Name (e.g. C#, G#, E) - Exactly like Image 2!
        if (frontY >= 20) {
          const badgeY = frontY - 11;
          const badgeR = Math.min(10, w / 2 - 1);

          ctx.beginPath();
          ctx.arc(geom.xCenter, badgeY, badgeR, 0, Math.PI * 2);
          ctx.fillStyle = noteGradColors[1];
          ctx.fill();
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1.4;
          ctx.stroke();

          // Text label inside circle
          const noteName = NOTE_NAMES[note.pitch % 12];
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 9px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(noteName, geom.xCenter, badgeY);
        }
        ctx.restore();
      });

      // -----------------------------------------------------------------------
      // Glowing Neon Strike Line
      // -----------------------------------------------------------------------
      ctx.save();
      ctx.strokeStyle = palette.strike;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = palette.strike;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(0, strikeY);
      ctx.lineTo(W, strikeY);
      ctx.stroke();
      ctx.restore();

      // Active note strike sparks / glow flash
      if (activeNotes.length > 0) {
        ctx.save();
        activeNotes.forEach((n) => {
          const geom = keyGeometry.get(n.pitch);
          if (!geom) return;
          const isRight = n.hand === "right";
          const sparkColor = isRight ? palette.right : palette.left;

          ctx.beginPath();
          ctx.arc(geom.xCenter, strikeY, 8, 0, Math.PI * 2);
          ctx.fillStyle = sparkColor;
          ctx.shadowColor = sparkColor;
          ctx.shadowBlur = 16;
          ctx.fill();
        });
        ctx.restore();
      }

      // -----------------------------------------------------------------------
      // 88-Key Piano Keyboard Rendering
      // -----------------------------------------------------------------------
      const activePitchMap = new Map<number, NoteDto>();
      activeNotes.forEach((n) => activePitchMap.set(n.pitch, n));

      // 1. Draw White Keys
      for (let midi = 21; midi <= 108; midi++) {
        const geom = keyGeometry.get(midi);
        if (!geom || geom.isBlack) continue;

        const isPressed = activePitchMap.has(midi);
        const activeNote = activePitchMap.get(midi);

        ctx.save();
        if (isPressed && activeNote) {
          const isRight = activeNote.hand === "right";
          const pressGrad = ctx.createLinearGradient(geom.xLeft, kbTop, geom.xLeft, H);
          pressGrad.addColorStop(0, isRight ? palette.right : palette.left);
          pressGrad.addColorStop(1, isRight ? palette.rightGradient[1] : palette.leftGradient[1]);
          ctx.fillStyle = pressGrad;
        } else {
          const whiteGrad = ctx.createLinearGradient(geom.xLeft, kbTop, geom.xLeft, H);
          whiteGrad.addColorStop(0, "#fefefe");
          whiteGrad.addColorStop(0.85, "#f1f2f5");
          whiteGrad.addColorStop(1, "#dcdfe6");
          ctx.fillStyle = whiteGrad;
        }

        ctx.fillRect(geom.xLeft + 0.5, kbTop, geom.width - 1, kbHeight);

        // White key border
        ctx.strokeStyle = "#8b929d";
        ctx.lineWidth = 1;
        ctx.strokeRect(geom.xLeft + 0.5, kbTop, geom.width - 1, kbHeight);

        // Octave C label (C1, C2, C3, C4, C5, C6, C7, C8)
        if (midi % 12 === 0) {
          const octave = Math.floor(midi / 12) - 1;
          ctx.fillStyle = isPressed ? "#ffffff" : "#6c7280";
          ctx.font = "600 11px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillText(`C${octave}`, geom.xCenter, H - 8);
        }
        ctx.restore();
      }

      // 2. Draw Black Keys (Over White Keys, with realistic 3D bevel)
      for (let midi = 21; midi <= 108; midi++) {
        const geom = keyGeometry.get(midi);
        if (!geom || !geom.isBlack) continue;

        const isPressed = activePitchMap.has(midi);
        const activeNote = activePitchMap.get(midi);

        ctx.save();
        // Subtle drop shadow onto white keys
        ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
        ctx.fillRect(geom.xLeft - 1, kbTop, geom.width + 2, blackKeyH + 3);

        if (isPressed && activeNote) {
          const isRight = activeNote.hand === "right";
          const pressGrad = ctx.createLinearGradient(geom.xLeft, kbTop, geom.xLeft, kbTop + blackKeyH);
          pressGrad.addColorStop(0, isRight ? palette.right : palette.left);
          pressGrad.addColorStop(1, isRight ? palette.rightGradient[1] : palette.leftGradient[1]);
          ctx.fillStyle = pressGrad;
        } else {
          const blackGrad = ctx.createLinearGradient(geom.xLeft, kbTop, geom.xLeft, kbTop + blackKeyH);
          blackGrad.addColorStop(0, "#2c2e36");
          blackGrad.addColorStop(0.7, "#14151a");
          blackGrad.addColorStop(1, "#09090c");
          ctx.fillStyle = blackGrad;
        }

        // Rounded bottom corners for realistic black key caps
        const r = 3;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(geom.xLeft, kbTop, geom.width, blackKeyH, [0, 0, r, r]);
        } else {
          ctx.rect(geom.xLeft, kbTop, geom.width, blackKeyH);
        }
        ctx.fill();

        // Top glossy bevel line
        ctx.strokeStyle = isPressed ? "#ffffff" : "rgba(255, 255, 255, 0.20)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }

      // -----------------------------------------------------------------------
      // ARTICULATED ANIME HANDS RENDERING (Natural Peach Skin & Soft Drop Shadows)
      // -----------------------------------------------------------------------
      if (showHandsRef.current) {
        // Calculate target hand positions from active notes
        const lhNotes = activeNotes.filter((n) => n.hand === "left");
        const rhNotes = activeNotes.filter((n) => n.hand === "right");

        if (lhNotes.length > 0) {
          const xs = lhNotes.map((n) => keyGeometry.get(n.pitch)?.xCenter ?? lhX);
          const avgX = xs.reduce((a, b) => a + b, 0) / xs.length;
          lhX += (avgX - lhX) * 0.18;

          lhPress = [0.0, 0.0, 0.0, 0.0, 0.0];
          lhNotes.forEach((n) => {
            const geom = keyGeometry.get(n.pitch);
            if (!geom) return;
            const diff = geom.xCenter - lhX;
            if (diff > 22) lhPress[0] = 1.0;
            else if (diff > 8) lhPress[1] = 1.0;
            else if (diff > -8) lhPress[2] = 1.0;
            else if (diff > -22) lhPress[3] = 1.0;
            else lhPress[4] = 1.0;
          });
        } else {
          lhX += (W * 0.30 - lhX) * 0.04;
          lhPress = lhPress.map((p) => Math.max(0, p - 0.1));
        }

        if (rhNotes.length > 0) {
          const xs = rhNotes.map((n) => keyGeometry.get(n.pitch)?.xCenter ?? rhX);
          const avgX = xs.reduce((a, b) => a + b, 0) / xs.length;
          rhX += (avgX - rhX) * 0.18;

          rhPress = [0.0, 0.0, 0.0, 0.0, 0.0];
          rhNotes.forEach((n) => {
            const geom = keyGeometry.get(n.pitch);
            if (!geom) return;
            const diff = geom.xCenter - rhX;
            if (diff < -22) rhPress[0] = 1.0;
            else if (diff < -8) rhPress[1] = 1.0;
            else if (diff < 8) rhPress[2] = 1.0;
            else if (diff < 22) rhPress[3] = 1.0;
            else rhPress[4] = 1.0;
          });
        } else {
          rhX += (W * 0.70 - rhX) * 0.04;
          rhPress = rhPress.map((p) => Math.max(0, p - 0.1));
        }

        const renderSingleHand = (
          cx: number,
          isLeft: boolean,
          press: number[],
          isShadow: boolean
        ) => {
          ctx.save();
          const tiltDeg = isLeft ? 10.0 : -10.0;
          const tiltRad = (tiltDeg * Math.PI) / 180.0;
          const cosT = Math.cos(tiltRad);
          const sinT = Math.sin(tiltRad);

          const wristY = H + 40;
          const palmCenterY = H - 8;

          const xShift = isShadow ? (isLeft ? -8 : 8) : 0;
          const yShift = isShadow ? -28 : 0;

          if (isShadow) {
            ctx.fillStyle = "rgba(10, 12, 18, 0.42)";
            ctx.filter = "blur(10px)";
          } else {
            ctx.fillStyle = "#F7D6C4"; // Warm natural anime peach skin
            ctx.strokeStyle = "#6E423E"; // Natural outline contour
            ctx.lineWidth = 1.4;
          }

          const fingerSpecs = [
            { baseDx: isLeft ? 38 : -38, baseDy: 20, length: 50, w: 12, pip: 0.50 }, // Thumb
            { baseDx: isLeft ? 18 : -18, baseDy: -10, length: 66, w: 11, pip: 0.58 }, // Index
            { baseDx: 0,                 baseDy: -14, length: 74, w: 11.5, pip: 0.60 }, // Middle
            { baseDx: isLeft ? -18 : 18, baseDy: -10, length: 68, w: 10.5, pip: 0.58 }, // Ring
            { baseDx: isLeft ? -36 : 36, baseDy: 6,   length: 54, w: 9.5, pip: 0.54 }, // Pinky
          ];

          // Draw 5 Articulated Fingers
          fingerSpecs.forEach((spec, fIdx) => {
            const pVal = press[fIdx];
            const kx = cx + spec.baseDx * cosT - spec.baseDy * sinT + xShift;
            const ky = palmCenterY + spec.baseDx * sinT + spec.baseDy * cosT + yShift;

            const fLen = spec.length + pVal * 7.0;
            const pipLen = fLen * spec.pip;

            const tipY = ky - fLen + pVal * 4.0;
            const pipY = ky - pipLen + pVal * 2.0;

            const fxOffset = spec.baseDx * 0.45;
            const tipX = kx + fxOffset * 0.7;
            const pipX = kx + fxOffset * 0.4;
            const w = spec.w;

            ctx.beginPath();
            ctx.moveTo(kx - w * 0.55, ky);
            ctx.lineTo(pipX - w * 0.50, pipY);
            ctx.lineTo(tipX - w * 0.42, tipY);
            ctx.lineTo(tipX + w * 0.42, tipY);
            ctx.lineTo(pipX + w * 0.50, pipY);
            ctx.lineTo(kx + w * 0.55, ky);
            ctx.closePath();
            ctx.fill();

            if (!isShadow) {
              ctx.stroke();

              // Pearl fingernail on fingertip
              ctx.fillStyle = "#FDF2F8";
              ctx.beginPath();
              ctx.rect(tipX - w * 0.28, tipY + 2, w * 0.56, 7);
              ctx.fill();

              // Knuckle joint crease
              ctx.strokeStyle = "#D7A291";
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(pipX - w * 0.35, pipY);
              ctx.lineTo(pipX + w * 0.35, pipY);
              ctx.stroke();

              ctx.fillStyle = "#F7D6C4";
              ctx.strokeStyle = "#6E423E";
              ctx.lineWidth = 1.4;
            }
          });

          // Draw Palm Body
          const palmW = 46.0;
          ctx.beginPath();
          ctx.moveTo(cx - palmW * cosT + xShift, palmCenterY - 10 + yShift);
          ctx.lineTo(cx + palmW * cosT + xShift, palmCenterY - 10 + yShift);
          ctx.lineTo(cx + palmW * 0.75 * cosT + xShift, wristY + yShift);
          ctx.lineTo(cx - palmW * 0.75 * cosT + xShift, wristY + yShift);
          ctx.closePath();
          ctx.fill();

          if (!isShadow) {
            ctx.stroke();
            // Inner palm shadow contour
            ctx.strokeStyle = "#D7A291";
            ctx.beginPath();
            ctx.arc(cx + (isLeft ? 10 : -10), palmCenterY + 12, 18, 0, Math.PI);
            ctx.stroke();
          }

          ctx.restore();
        };

        // 1. Soft Shadow Pass
        renderSingleHand(lhX, true, lhPress, true);
        renderSingleHand(rhX, false, rhPress, true);

        // 2. Beautiful Hand Body Pass
        renderSingleHand(lhX, true, lhPress, false);
        renderSingleHand(rhX, false, rhPress, false);
      }

      // -----------------------------------------------------------------------
      // "Ped." Calligraphy Indicator on Bottom-Left
      // -----------------------------------------------------------------------
      ctx.save();
      ctx.fillStyle = palette.pedal;
      ctx.font = "italic 700 24px 'Playfair Display', Georgia, serif";
      ctx.fillText("Ped.", 26, H - 20);
      ctx.restore();
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [viewMode, selectedTheme]);

  // ---------------------------------------------------------------------------
  // 2. 3D SCENE RENDERER (Three.js with Rigged Hands & Locked Strike Line)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (viewMode !== "3d" || !containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight || 520;

    const colors = THEME_3D_COLORS[selectedTheme] || THEME_3D_COLORS["falling_note_anime"];

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x06080d);
    scene.fog = new THREE.FogExp2(0x06080d, 0.007);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 1000);
    // Clean, direct Synthesia-style top-down angle
    camera.position.set(0, 22, 16);
    camera.lookAt(0, 0, 5.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff6ed, 1.5);
    dirLight.position.set(0, 32, 22);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // 88 Keys Geometry Mapping
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

    // Position white keys
    let currentWhiteIndex = 0;
    for (let midi = 21; midi <= 108; midi++) {
      const isBlack = isBlackKeyTable[midi % 12];
      keyIsBlack.set(midi, isBlack);
      if (!isBlack) {
        const x = startX + (currentWhiteIndex + 0.5) * whiteKeyWidth;
        keyPositions.set(midi, x);
        currentWhiteIndex++;
      }
    }

    // Position black keys
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

    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf6f6f8, roughness: 0.18, metalness: 0.08 });
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.25, metalness: 0.25 });

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
      } else {
        const geom = new THREE.BoxGeometry(blackKeyWidth, blackKeyHeight, blackKeyDepth);
        const mesh = new THREE.Mesh(geom, blackMat.clone());
        mesh.position.set(x, 0.28, 7.2);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        keyMeshes.set(midi, mesh);
        keyOriginalY.set(midi, 0.28);
      }
    }

    // Neon strike line
    const strikeZ = 5.9;
    const strikeGeom = new THREE.PlaneGeometry(totalWidth + 0.5, 0.12);
    const strikeMat = new THREE.MeshBasicMaterial({ color: colors.strike, transparent: true, opacity: 0.9 });
    const strikeLine = new THREE.Mesh(strikeGeom, strikeMat);
    strikeLine.rotation.x = -Math.PI / 2;
    strikeLine.position.set(0, 0.36, strikeZ);
    scene.add(strikeLine);

    const lookahead = 3.0;
    const travelDistance = 32.0;

    const rightNoteMat = new THREE.MeshStandardMaterial({
      color: colors.right,
      emissive: colors.rightEmissive,
      emissiveIntensity: 0.65,
      roughness: 0.25,
    });
    const leftNoteMat = new THREE.MeshStandardMaterial({
      color: colors.left,
      emissive: colors.leftEmissive,
      emissiveIntensity: 0.65,
      roughness: 0.25,
    });

    interface NoteMeshItem {
      mesh: THREE.Mesh;
      note: NoteDto;
    }

    const noteMeshes: NoteMeshItem[] = [];

    previewData.notes.forEach((n) => {
      const isBlack = keyIsBlack.get(n.pitch) ?? false;
      const width = isBlack ? blackKeyWidth * 0.92 : whiteKeyWidth * 0.88;
      const geom = new THREE.BoxGeometry(width, 0.24, 1.0);
      const mat = n.hand === "left" ? leftNoteMat : rightNoteMat;
      const mesh = new THREE.Mesh(geom, mat);
      mesh.visible = false;
      scene.add(mesh);
      noteMeshes.push({ mesh, note: n });
    });

    // Realistic 3D Human Hands Loading
    const gltfLoader = new GLTFLoader();
    interface HandController {
      group: THREE.Group;
      bones: Map<string, THREE.Object3D>;
      isLeft: boolean;
    }
    const handControllers: HandController[] = [];

    const setupHand = (url: string, isLeft: boolean) => {
      const handGroup = new THREE.Group();
      handGroup.visible = false;
      scene.add(handGroup);

      const bones = new Map<string, THREE.Object3D>();

      gltfLoader.load(
        url,
        (gltf) => {
          const model = gltf.scene;
          model.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              child.castShadow = true;
              const mesh = child as THREE.Mesh;
              mesh.material = new THREE.MeshStandardMaterial({
                color: 0xf5cfbd,
                roughness: 0.52,
                metalness: 0.04,
              });
            }
            if (child.name) {
              bones.set(child.name, child);
            }
          });

          model.scale.set(22, 22, 22);
          model.rotation.set(-Math.PI / 2 + 0.25, isLeft ? 0.16 : -0.16, isLeft ? Math.PI : 0);
          model.position.set(0, 0, 0);
          handGroup.add(model);
          handGroup.visible = true;
        },
        undefined,
        () => {
          const skinMat = new THREE.MeshStandardMaterial({ color: 0xf5cfbd, roughness: 0.5 });
          const palm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.4, 2.0), skinMat);
          handGroup.add(palm);
          handGroup.visible = true;
        }
      );

      handGroup.position.set(isLeft ? -6 : 6, 1.0, 9.2);
      handControllers.push({ group: handGroup, bones, isLeft });
    };

    setupHand("/models/left_hand.glb", true);
    setupHand("/models/right_hand.glb", false);

    let animId: number;
    let targetLeftX = -6;
    let targetRightX = 6;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const t = timeRef.current;
      const tMax = t + lookahead;

      keyMeshes.forEach((mesh, midi) => {
        const isBlack = keyIsBlack.get(midi)!;
        mesh.position.y = keyOriginalY.get(midi)!;
        mesh.rotation.x = 0;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.color.setHex(isBlack ? 0x111317 : 0xf6f6f8);
        mat.emissive.setHex(0x000000);
      });

      let activeCount = 0;
      let leftHandXSum = 0;
      let leftHandXCount = 0;
      let rightHandXSum = 0;
      let rightHandXCount = 0;

      noteMeshes.forEach(({ mesh, note }) => {
        const startT = note.start_time;
        const endT = note.end_time;

        if (t > endT || startT > tMax) {
          mesh.visible = false;
          return;
        }

        mesh.visible = true;
        const backZ = strikeZ - ((endT - t) / lookahead) * travelDistance;
        let frontZ = t < startT ? strikeZ - ((startT - t) / lookahead) * travelDistance : strikeZ;

        const currentLength = Math.max(0.18, frontZ - backZ);
        const centerZ = (frontZ + backZ) / 2.0;
        const posX = keyPositions.get(note.pitch) ?? 0;

        mesh.scale.set(1, 1, currentLength);
        mesh.position.set(posX, 0.44, centerZ);

        if (startT <= t && t <= endT) {
          activeCount++;
          const keyMesh = keyMeshes.get(note.pitch);
          if (keyMesh) {
            const isRight = note.hand === "right";
            keyMesh.position.y = (keyOriginalY.get(note.pitch) || 0) - 0.14;
            keyMesh.rotation.x = 0.038;

            const mat = keyMesh.material as THREE.MeshStandardMaterial;
            mat.color.setHex(isRight ? colors.right : colors.left);
            mat.emissive.setHex(isRight ? colors.rightEmissive : colors.leftEmissive);
            mat.emissiveIntensity = 0.85;

            if (isRight) {
              rightHandXSum += posX;
              rightHandXCount++;
            } else {
              leftHandXSum += posX;
              leftHandXCount++;
            }
          }
        }
      });

      if (leftHandXCount > 0) targetLeftX = leftHandXSum / leftHandXCount;
      if (rightHandXCount > 0) targetRightX = rightHandXSum / rightHandXCount;

      handControllers.forEach((ctrl) => {
        ctrl.group.visible = showHandsRef.current;
        if (!showHandsRef.current) return;
        const targetX = ctrl.isLeft ? targetLeftX : targetRightX;
        ctrl.group.position.x += (targetX - ctrl.group.position.x) * 0.16;
      });

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
      if (containerRef.current) containerRef.current.innerHTML = "";
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
      await api.triggerRender(projectId);
      setApplySuccess(true);
      setTimeout(() => setApplySuccess(false), 3000);
    } catch (err: any) {
      alert("Sozlamalarni saqlashda xatolik: " + (err.message || err));
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
            <h2 className="text-base font-bold text-white">AI Piano Falling Note Studio</h2>
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
            <Music className="w-3.5 h-3.5 text-emerald-400" />
            <select
              value={selectedSound}
              onChange={(e) => setSelectedSound(e.target.value)}
              className="bg-transparent text-white focus:outline-none text-xs font-semibold cursor-pointer"
            >
              <option value="concert_grand">Concert Grand (Steinway C5)</option>
              <option value="bright_pop">Bright Pop Grand (Yamaha C7)</option>
              <option value="vintage_upright">Vintage Upright / Saloon</option>
              <option value="rhodes_ep">Neo-Soul Rhodes (EP Piano)</option>
              <option value="dx7_fm">80s FM Electric Piano (DX7)</option>
              <option value="piano_strings">Cinematic Piano & Strings</option>
              <option value="music_box">Dreamy Music Box / Celesta</option>
            </select>
          </div>

          {/* Apply & Re-render Preset Button */}
          <button
            onClick={handleApplyPreset}
            disabled={isApplying}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
              applySuccess
                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                : "bg-dark-800 text-gray-300 border-dark-700 hover:text-white hover:bg-dark-750"
            }`}
          >
            {isApplying ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-electric-400" />
            ) : applySuccess ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Sliders className="w-3.5 h-3.5 text-purple-400" />
            )}
            <span>{isApplying ? "Saqlanmoqda..." : applySuccess ? "Tayyor!" : "Qayta Render"}</span>
          </button>

          {/* Hands Toggle */}
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

          {/* View Modes Selector: Anime 2D / 3D / Video */}
          <div className="bg-dark-800 p-1 rounded-xl border border-dark-700 flex text-xs font-medium">
            <button
              onClick={() => setViewMode("anime")}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                viewMode === "anime" ? "bg-electric-600 text-white shadow-md shadow-electric-600/30" : "text-gray-400 hover:text-white"
              }`}
            >
              Anime 2D
            </button>
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
        {viewMode === "anime" ? (
          <>
            <canvas ref={canvasRef} className="w-full h-full block" />
            
            {/* Visual Overlays */}
            <div className="absolute top-4 left-4 pointer-events-none flex flex-col space-y-1.5">
              <div className="px-3 py-1 rounded-full text-[11px] font-mono bg-dark-900/80 backdrop-blur-md border border-dark-700/80 text-gray-300 flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-electric-cyan animate-pulse" />
                <span>Bir vaqtdagi notalar: {activeNotesCount}</span>
              </div>
              <div className="px-3 py-1 rounded-full text-[11px] font-mono bg-dark-900/80 backdrop-blur-md border border-dark-700/80 text-gray-400">
                <span>O‘ng Qo‘l (Ko‘k) &bull; Chap Qo‘l (Yashil)</span>
              </div>
            </div>
          </>
        ) : viewMode === "3d" ? (
          <>
            <div ref={containerRef} className="w-full h-full" />
            
            <div className="absolute top-4 left-4 pointer-events-none flex flex-col space-y-1.5">
              <div className="px-3 py-1 rounded-full text-[11px] font-mono bg-dark-900/80 backdrop-blur-md border border-dark-700/80 text-gray-300 flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-electric-cyan animate-pulse" />
                <span>Bir vaqtdagi notalar: {activeNotesCount}</span>
              </div>
              <div className="px-3 py-1 rounded-full text-[11px] font-mono bg-dark-900/80 backdrop-blur-md border border-dark-700/80 text-gray-400">
                <span>3D Perspektiva &bull; Realistik Skeletal Qo‘llar</span>
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

        {/* Speed, Volume, MIDI Editor Link */}
        <div className="flex items-center space-x-4">
          {/* Speed Selector */}
          <div className="flex items-center space-x-1.5 text-xs text-gray-400">
            <Gauge className="w-4 h-4" />
            <select
              value={playbackSpeed}
              onChange={(e) => {
                const s = parseFloat(e.target.value);
                setPlaybackSpeed(s);
                if (audioRef.current) audioRef.current.playbackRate = s;
              }}
              className="bg-dark-800 text-gray-200 border border-dark-700 rounded-lg px-2 py-1 text-xs focus:outline-none"
            >
              <option value="0.5">0.5x</option>
              <option value="0.75">0.75x</option>
              <option value="1.0">1.0x</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
            </select>
          </div>

          {/* Volume Control */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                const nextMute = !isMuted;
                setIsMuted(nextMute);
                if (audioRef.current) audioRef.current.muted = nextMute;
              }}
              className="text-gray-400 hover:text-white transition-colors"
            >
              {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setVolume(v);
                setIsMuted(false);
                if (audioRef.current) {
                  audioRef.current.volume = v;
                  audioRef.current.muted = false;
                }
              }}
              className="w-16 h-1.5 bg-dark-750 rounded-lg appearance-none cursor-pointer accent-electric-400 focus:outline-none"
            />
          </div>

          {onOpenMidiEditor && (
            <button
              onClick={onOpenMidiEditor}
              className="text-xs px-3 py-1.5 rounded-xl bg-dark-800 hover:bg-dark-750 border border-dark-700 text-gray-300 hover:text-white transition-all flex items-center space-x-1.5"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>MIDI Tahrirlash</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
