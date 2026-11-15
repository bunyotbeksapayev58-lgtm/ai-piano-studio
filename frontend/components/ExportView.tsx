"use client";

import React, { useState } from "react";
import {
  Film,
  Music,
  Trash2,
  ArrowLeft,
  Sparkles,
  Layers,
  Activity
} from "lucide-react";
import { ProjectStatusResponse, api } from "@/services/api";

interface ExportViewProps {
  project: ProjectStatusResponse;
  onBackToPreview: () => void;
  onBackToHome: () => void;
  onDeleted: () => void;
}

export const ExportView: React.FC<ExportViewProps> = ({
  project,
  onBackToPreview,
  onBackToHome,
  onDeleted,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const qm = project.quality_metrics || {};

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this project and all generated files?")) {
      return;
    }
    setIsDeleting(true);
    try {
      await api.deleteProject(project.id);
      onDeleted();
    } catch (e: any) {
      alert(e.message || "Failed to delete project");
      setIsDeleting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Top navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBackToPreview}
          className="flex items-center space-x-2 text-xs font-semibold text-gray-400 hover:text-white px-3 py-1.5 rounded-lg bg-dark-800 border border-dark-700/80 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Interactive 3D Canvas</span>
        </button>

        <button
          onClick={onBackToHome}
          className="text-xs font-semibold text-electric-400 hover:text-electric-300"
        >
          + Create New Project
        </button>
      </div>

      {/* Main Video Presentation Card */}
      <div className="bg-dark-900 border border-dark-700/60 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl overflow-hidden relative">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono uppercase tracking-wider text-emerald-400 font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                Render Complete
              </span>
              <span className="text-xs font-mono text-gray-400">720p HD • 30 FPS • H.264/AAC</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mt-2">
              {project.filename}
            </h1>
            <p className="text-xs text-gray-400 mt-1 font-mono">
              Duration: {project.duration_seconds.toFixed(1)}s • Total Notes: {project.note_count} • Synth: Salamander Grand Piano
            </p>
          </div>

          {/* Action Download Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={api.getVideoDownloadUrl(project.id)}
              download
              className="flex items-center space-x-2 px-5 py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-electric-600 via-electric-500 to-violet-600 text-white shadow-xl shadow-electric-600/30 hover:scale-105 active:scale-95 transition-all"
            >
              <Film className="w-4 h-4" />
              <span>Download MP4 Video</span>
            </a>

            <a
              href={api.getMidiDownloadUrl(project.id)}
              download
              className="flex items-center space-x-2 px-4 py-3 rounded-xl text-sm font-semibold bg-dark-800 hover:bg-dark-700 text-gray-200 border border-dark-700 transition-all hover:scale-105"
            >
              <Music className="w-4 h-4 text-violet-400" />
              <span>Download MIDI</span>
            </a>
          </div>
        </div>

        {/* Video Player Box */}
        <div className="w-full aspect-video bg-dark-950 rounded-2xl overflow-hidden border border-dark-700/80 shadow-2xl relative">
          <video
            src={api.getVideoUrl(project.id)}
            controls
            className="w-full h-full object-contain"
          />
        </div>
      </div>

      {/* Details & Quality Report Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Hand & Voice Breakdown */}
        <div className="bg-dark-900 border border-dark-700/60 rounded-2xl p-6 space-y-4">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-electric-500/10 text-electric-400 border border-electric-500/20">
              <Layers className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white">Hand Voice Distribution</h3>
          </div>

          <div className="space-y-3 pt-2">
            <div>
              <div className="flex justify-between text-xs font-mono text-gray-300 mb-1">
                <span className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-electric-400" />
                  <span>Right Hand (Treble/Melody)</span>
                </span>
                <span>{qm.hand_distribution?.right_hand_notes ?? 0} notes ({qm.hand_distribution?.right_hand_pct ?? 0}%)</span>
              </div>
              <div className="w-full h-2 bg-dark-950 rounded-full overflow-hidden">
                <div
                  className="h-full bg-electric-500 rounded-full"
                  style={{ width: `${qm.hand_distribution?.right_hand_pct ?? 50}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-mono text-gray-300 mb-1">
                <span className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-violet-400" />
                  <span>Left Hand (Bass/Accompaniment)</span>
                </span>
                <span>{qm.hand_distribution?.left_hand_notes ?? 0} notes ({qm.hand_distribution?.left_hand_pct ?? 0}%)</span>
              </div>
              <div className="w-full h-2 bg-dark-950 rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-500 rounded-full"
                  style={{ width: `${qm.hand_distribution?.left_hand_pct ?? 50}%` }}
                />
              </div>
            </div>
          </div>

          <div className="text-[11px] text-gray-400 bg-dark-950/60 p-3 rounded-xl border border-dark-700/60 leading-relaxed">
            <span className="text-gray-300 font-semibold">Heuristic Note:</span> {qm.hand_assignment_method || "Voice continuity and register spacing."}
          </div>
        </div>

        {/* Center Column: Polyphony & Timing */}
        <div className="bg-dark-900 border border-dark-700/60 rounded-2xl p-6 space-y-4">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20">
              <Activity className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white">Polyphony & Timing</h3>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="bg-dark-950/80 p-3 rounded-xl border border-dark-700/60">
              <span className="text-xs text-gray-400 font-mono">Max Polyphony</span>
              <div className="text-lg font-bold font-mono text-white mt-0.5">
                {qm.polyphony?.max_simultaneous ?? 1} voices
              </div>
            </div>

            <div className="bg-dark-950/80 p-3 rounded-xl border border-dark-700/60">
              <span className="text-xs text-gray-400 font-mono">Avg Polyphony</span>
              <div className="text-lg font-bold font-mono text-white mt-0.5">
                {qm.polyphony?.average_simultaneous ?? 1.0} voices
              </div>
            </div>

            <div className="bg-dark-950/80 p-3 rounded-xl border border-dark-700/60">
              <span className="text-xs text-gray-400 font-mono">Pitch Span</span>
              <div className="text-sm font-semibold font-mono text-electric-400 mt-0.5">
                {qm.pitch_range?.min_note ?? "A0"} &rarr; {qm.pitch_range?.max_note ?? "C8"}
              </div>
            </div>

            <div className="bg-dark-950/80 p-3 rounded-xl border border-dark-700/60">
              <span className="text-xs text-gray-400 font-mono">Estimated Tempo</span>
              <div className="text-lg font-bold font-mono text-violet-400 mt-0.5">
                {project.tempo.toFixed(0)} BPM
              </div>
            </div>
          </div>

          <div className="text-[11px] text-gray-400 bg-dark-950/60 p-3 rounded-xl border border-dark-700/60">
            Notes per second: <span className="text-white font-mono">{qm.notes_per_second ?? "--"}</span>
          </div>
        </div>

        {/* Right Column: AI Model & Project Controls */}
        <div className="bg-dark-900 border border-dark-700/60 rounded-2xl p-6 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Sparkles className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-white">AI Engine Info</h3>
            </div>

            <div className="space-y-1.5 text-xs text-gray-300 bg-dark-950/60 p-3 rounded-xl border border-dark-700/60">
              <div><span className="text-gray-400">Model:</span> {qm.model || "Spotify Basic Pitch"}</div>
              <div><span className="text-gray-400">Synthesizer:</span> FluidSynth v2.6.2 (WASAPI/PCM)</div>
              <div><span className="text-gray-400">SoundFont:</span> Salamander Grand Piano C5 (CC-BY)</div>
              <div><span className="text-gray-400">Video Encoder:</span> H.264 / AAC 720p 30fps</div>
            </div>
          </div>

          {/* Delete Project Button */}
          <div className="pt-4 border-t border-dark-700/60">
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="w-full flex items-center justify-center space-x-2 px-3 py-2.5 rounded-xl text-xs font-semibold bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isDeleting ? "Deleting..." : "Delete Project Files"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
