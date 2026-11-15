"use client";

import React, { useEffect, useState } from "react";
import {
  Upload,
  FileAudio,
  BrainCircuit,
  Music,
  Sliders,
  Volume2,
  Film,
  DownloadCloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  Hash,
  Activity
} from "lucide-react";
import confetti from "canvas-confetti";
import { ProjectStatusResponse, api } from "@/services/api";

interface ProcessingViewProps {
  projectId: string;
  onComplete: () => void;
  onError: (msg: string) => void;
}

const STEPS = [
  { step: 1, title: "Uploading video", desc: "Validating media container & audio streams", icon: Upload },
  { step: 2, title: "Extracting audio", desc: "Normalized 44.1 kHz PCM extraction with FFmpeg", icon: FileAudio },
  { step: 3, title: "Analyzing music", desc: "Acoustic spectrum analysis & frequency mapping", icon: BrainCircuit },
  { step: 4, title: "Detecting piano notes", desc: "Spotify Basic Pitch polyphonic neural inference", icon: Music },
  { step: 5, title: "Generating MIDI", desc: "Voice separation & intelligent hand assignment heuristic", icon: Sliders },
  { step: 6, title: "Synthesizing piano audio", desc: "FluidSynth grand piano soundfont synthesis", icon: Volume2 },
  { step: 7, title: "Rendering animation", desc: "Deterministic 720p 30fps falling note visualization", icon: Film },
  { step: 8, title: "Exporting MP4", desc: "H.264 video + AAC audio synchronized container", icon: DownloadCloud },
];

export const ProcessingView: React.FC<ProcessingViewProps> = ({
  projectId,
  onComplete,
  onError,
}) => {
  const [project, setProject] = useState<ProjectStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let timer: NodeJS.Timeout;

    const poll = async () => {
      try {
        const data = await api.getStatus(projectId);
        setProject(data);

        if (data.status === "COMPLETE") {
          try {
            confetti({
              particleCount: 80,
              spread: 70,
              origin: { y: 0.6 },
            });
          } catch {
            // ignore
          }
          // Slight delay so user sees 100% completion
          setTimeout(() => {
            onComplete();
          }, 1500);
        } else if (data.status === "FAILED") {
          const err = data.error_message || data.status_message || "Processing failed";
          setError(err);
          onError(err);
        } else {
          timer = setTimeout(poll, 1200);
        }
      } catch (err: any) {
        console.error("Polling error:", err);
        timer = setTimeout(poll, 2000);
      }
    };

    poll();

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [projectId, onComplete, onError]);

  const currentStep = project?.current_step || 1;
  const progressPercent = project?.progress_percent || 10;
  const statusMessage = project?.status_message || "Processing pipeline active...";

  const handleRetry = async () => {
    setError(null);
    try {
      await api.startAnalysis(projectId, true);
    } catch (e: any) {
      setError(e.message || "Failed to restart pipeline");
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header Banner */}
      <div className="bg-dark-900 border border-dark-700/60 rounded-2xl p-6 sm:p-8 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-electric-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs font-mono uppercase tracking-wider text-electric-400 font-semibold px-2.5 py-1 rounded-full bg-electric-500/10 border border-electric-500/20">
                Pipeline Processing
              </span>
              <h1 className="text-2xl sm:text-3xl font-bold text-white mt-2">
                Generating Your Piano Video
              </h1>
              <p className="text-sm text-gray-400 mt-1">
                Project File: <span className="text-gray-200 font-mono">{project?.filename || "Loading..."}</span>
              </p>
            </div>

            {/* Live percentage badge */}
            <div className="text-right">
              <div className="text-3xl sm:text-4xl font-extrabold font-mono bg-gradient-to-r from-electric-400 via-white to-violet-400 bg-clip-text text-transparent">
                {progressPercent.toFixed(0)}%
              </div>
              <p className="text-xs text-gray-400 font-mono mt-0.5">Real Progress</p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="w-full h-3 bg-dark-950 rounded-full overflow-hidden p-0.5 border border-dark-700/80">
              <div
                className="h-full bg-gradient-to-r from-electric-600 via-electric-400 to-violet-500 rounded-full transition-all duration-500 ease-out shadow-[0_0_12px_#3b82f6]"
                style={{ width: `${Math.min(100, Math.max(5, progressPercent))}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs font-mono text-gray-400">
              <div className="flex items-center space-x-2">
                <Loader2 className="w-3.5 h-3.5 text-electric-400 animate-spin" />
                <span className="text-gray-200">{statusMessage}</span>
              </div>
              <span>Step {currentStep} of 8</span>
            </div>
          </div>

          {/* Metrics summary card if available */}
          {project && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="bg-dark-950/60 p-3 rounded-xl border border-dark-700/60">
                <div className="flex items-center space-x-1.5 text-gray-400 text-xs">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Duration</span>
                </div>
                <div className="text-base font-mono font-semibold text-white mt-1">
                  {project.duration_seconds.toFixed(1)}s
                </div>
              </div>

              <div className="bg-dark-950/60 p-3 rounded-xl border border-dark-700/60">
                <div className="flex items-center space-x-1.5 text-gray-400 text-xs">
                  <Hash className="w-3.5 h-3.5" />
                  <span>Detected Notes</span>
                </div>
                <div className="text-base font-mono font-semibold text-electric-400 mt-1">
                  {project.note_count > 0 ? project.note_count : "--"}
                </div>
              </div>

              <div className="bg-dark-950/60 p-3 rounded-xl border border-dark-700/60">
                <div className="flex items-center space-x-1.5 text-gray-400 text-xs">
                  <Activity className="w-3.5 h-3.5" />
                  <span>Tempo (BPM)</span>
                </div>
                <div className="text-base font-mono font-semibold text-violet-400 mt-1">
                  {project.tempo > 0 ? `${project.tempo.toFixed(0)}` : "--"}
                </div>
              </div>

              <div className="bg-dark-950/60 p-3 rounded-xl border border-dark-700/60">
                <div className="flex items-center space-x-1.5 text-gray-400 text-xs">
                  <Film className="w-3.5 h-3.5" />
                  <span>Resolution</span>
                </div>
                <div className="text-base font-mono font-semibold text-emerald-400 mt-1">
                  720p @ 30fps
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Error Alert Box */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 text-red-200 space-y-3">
          <div className="flex items-center space-x-3">
            <AlertCircle className="w-6 h-6 text-red-400 shrink-0" />
            <h3 className="font-semibold text-base text-red-100">Processing Interrupted</h3>
          </div>
          <p className="text-sm font-mono text-red-300 bg-red-950/40 p-3 rounded-lg border border-red-500/20">
            {error}
          </p>
          <button
            onClick={handleRetry}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-semibold shadow transition-all"
          >
            Retry Pipeline
          </button>
        </div>
      )}

      {/* Steps List */}
      <div className="bg-dark-900 border border-dark-700/60 rounded-2xl p-6 sm:p-8 space-y-4">
        <h2 className="text-base font-semibold text-white mb-2">Workflow Stages</h2>
        <div className="space-y-3">
          {STEPS.map((s) => {
            const Icon = s.icon;
            const isDone = currentStep > s.step || project?.status === "COMPLETE";
            const isCurrent = currentStep === s.step && project?.status !== "COMPLETE" && !error;

            return (
              <div
                key={s.step}
                className={`p-4 rounded-xl border transition-all flex items-center justify-between ${
                  isCurrent
                    ? "bg-dark-800/90 border-electric-500/50 shadow-md shadow-electric-500/5"
                    : isDone
                    ? "bg-dark-850/40 border-dark-700/40 opacity-90"
                    : "bg-dark-950/40 border-dark-800/40 opacity-50"
                }`}
              >
                <div className="flex items-center space-x-4">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                      isDone
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                        : isCurrent
                        ? "bg-electric-500/15 border-electric-500/40 text-electric-400"
                        : "bg-dark-800 border-dark-700 text-gray-500"
                    }`}
                  >
                    {isDone ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : isCurrent ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Icon className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-mono text-gray-400 font-medium">0{s.step}.</span>
                      <h4
                        className={`text-sm font-semibold ${
                          isCurrent ? "text-white" : isDone ? "text-gray-200" : "text-gray-400"
                        }`}
                      >
                        {s.title}
                      </h4>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{s.desc}</p>
                  </div>
                </div>

                {/* State Tag */}
                <div className="text-right">
                  {isDone ? (
                    <span className="text-xs font-mono text-emerald-400 font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                      Done
                    </span>
                  ) : isCurrent ? (
                    <span className="text-xs font-mono text-electric-400 font-semibold px-2 py-0.5 rounded-full bg-electric-500/10 border border-electric-500/20 animate-pulse">
                      In Progress
                    </span>
                  ) : (
                    <span className="text-xs font-mono text-gray-500">Waiting</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
