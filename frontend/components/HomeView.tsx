"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  UploadCloud,
  FileVideo,
  Sparkles,
  Music,
  AlertCircle,
  Trash2,
  ChevronRight
} from "lucide-react";
import { ProjectStatusResponse, api } from "@/services/api";

interface HomeViewProps {
  onProjectSelected: (projectId: string) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({ onProjectSelected }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectStatusResponse[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadProjects = async () => {
    try {
      setLoadingProjects(true);
      const data = await api.getProjects();
      setProjects(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingProjects(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleFileUpload = async (file: File) => {
    setUploadError(null);
    setIsUploading(true);
    setUploadPercent(0);

    try {
      // 1. Upload video
      const uploadedProject = await api.uploadVideo(file, (pct) => {
        setUploadPercent(pct);
      });

      // 2. Trigger analysis & video rendering
      await api.startAnalysis(uploadedProject.id, true);

      // 3. Switch to processing view
      onProjectSelected(uploadedProject.id);
    } catch (err: any) {
      setUploadError(err.message || "Failed to upload video");
      setIsUploading(false);
    }
  };

  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this project?")) return;
    try {
      await api.deleteProject(id);
      loadProjects();
    } catch (err: any) {
      alert(err.message || "Failed to delete project");
    }
  };

  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <div className="text-center max-w-3xl mx-auto space-y-4 pt-4">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-mono font-medium bg-electric-500/10 text-electric-400 border border-electric-500/20">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Professional Audio-to-MIDI Neural Transcription Engine</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
          Turn Any Music Video Into{" "}
          <span className="bg-gradient-to-r from-electric-400 via-sky-300 to-violet-400 bg-clip-text text-transparent">
            Falling Piano Notes
          </span>
        </h1>

        <p className="text-sm sm:text-base text-gray-400 max-w-2xl mx-auto leading-relaxed">
          Upload any music video (up to 10 minutes). Our AI analyzes pitch and chords, synthesizes rich Salamander Grand Piano audio, and renders a synchronized 720p falling-notes animation ready for MP4 export.
        </p>
      </div>

      {/* Upload Zone Card */}
      <div className="max-w-3xl mx-auto">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleFileDrop}
          onClick={() => !isUploading && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center cursor-pointer transition-all duration-300 relative overflow-hidden group ${
            isDragging
              ? "border-electric-400 bg-electric-500/10 scale-[1.01]"
              : isUploading
              ? "border-dark-700 bg-dark-900/60 cursor-wait"
              : "border-dark-700 hover:border-electric-500/60 bg-dark-900/70 hover:bg-dark-850/80 shadow-2xl"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp4,.mov,.mkv,.webm,.avi,.mp3,.wav,.m4a,.flac"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Background Ambient Glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-electric-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-electric-500/20 transition-all" />

          {isUploading ? (
            <div className="space-y-4 max-w-md mx-auto relative z-10">
              <div className="w-14 h-14 rounded-2xl bg-electric-500/15 border border-electric-500/30 flex items-center justify-center mx-auto text-electric-400 animate-pulse">
                <UploadCloud className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Uploading & Validating Video...</h3>
                <p className="text-xs text-gray-400 font-mono mt-1">Inspecting duration & audio streams</p>
              </div>
              <div className="w-full h-2.5 bg-dark-950 rounded-full overflow-hidden p-0.5 border border-dark-700">
                <div
                  className="h-full bg-gradient-to-r from-electric-500 to-violet-500 rounded-full transition-all duration-200"
                  style={{ width: `${uploadPercent}%` }}
                />
              </div>
              <div className="text-xs font-mono text-electric-400 font-semibold">
                {uploadPercent}% Uploaded
              </div>
            </div>
          ) : (
            <div className="space-y-5 relative z-10">
              <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-electric-600/30 to-violet-600/30 border border-electric-500/30 flex items-center justify-center mx-auto text-electric-400 shadow-xl shadow-electric-600/10 group-hover:scale-110 group-hover:border-electric-400 transition-all duration-300">
                <UploadCloud className="w-8 h-8" />
              </div>

              <div className="space-y-1.5">
                <h3 className="text-lg font-bold text-white">
                  Drop your MP3 audio or music video here, or{" "}
                  <span className="text-electric-400 underline underline-offset-4 decoration-electric-500/40 hover:decoration-electric-400">
                    browse files
                  </span>
                </h3>
                <p className="text-xs text-gray-400 max-w-sm mx-auto">
                  Supports MP3, WAV, MP4, MOV, MKV, WEBM • Up to 10 Minutes (600s) • Max 500MB
                </p>
              </div>

              {/* Badges */}
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-[11px] font-mono text-gray-400">
                <span className="px-2.5 py-1 rounded-lg bg-dark-800 border border-dark-700/80">
                  MP3 / Audio & Video Input
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-dark-800 border border-dark-700/80">
                  88-Key Polyphonic
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-dark-800 border border-dark-700/80">
                  FluidSynth Grand Piano
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-dark-800 border border-dark-700/80">
                  720p HD MP4
                </span>
              </div>
            </div>
          )}
        </div>

        {uploadError && (
          <div className="mt-4 p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-200 text-xs font-mono flex items-center space-x-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{uploadError}</span>
          </div>
        )}
      </div>

      {/* Project History Section */}
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Recent Projects</h2>
            <p className="text-xs text-gray-400">Manage, preview, and download your generated piano animations</p>
          </div>
          <button
            onClick={loadProjects}
            className="text-xs font-semibold text-gray-400 hover:text-white px-3 py-1.5 rounded-lg bg-dark-850 border border-dark-700/80 transition-colors"
          >
            Refresh
          </button>
        </div>

        {loadingProjects ? (
          <div className="text-center py-8 text-xs font-mono text-gray-500">Loading projects...</div>
        ) : projects.length === 0 ? (
          <div className="border border-dark-700/60 rounded-2xl p-8 text-center bg-dark-900/40 text-gray-400 space-y-2">
            <Music className="w-8 h-8 mx-auto text-dark-600" />
            <p className="text-sm font-medium text-gray-300">No projects yet</p>
            <p className="text-xs text-gray-500">Upload a video above to generate your first falling piano note video.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {projects.map((p) => {
              const isComplete = p.status === "COMPLETE";
              const isFailed = p.status === "FAILED";

              return (
                <div
                  key={p.id}
                  onClick={() => onProjectSelected(p.id)}
                  className="bg-dark-900 border border-dark-700/60 hover:border-electric-500/40 rounded-2xl p-5 cursor-pointer transition-all hover:bg-dark-850 group space-y-3 relative overflow-hidden"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-xl bg-dark-800 border border-dark-700 flex items-center justify-center text-electric-400 group-hover:scale-105 transition-transform">
                        <FileVideo className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-white group-hover:text-electric-400 transition-colors truncate max-w-[220px]">
                          {p.filename}
                        </h4>
                        <div className="flex items-center space-x-2 text-[11px] font-mono text-gray-400 mt-0.5">
                          <span>{p.duration_seconds.toFixed(1)}s</span>
                          <span>&bull;</span>
                          <span>{p.note_count} Notes</span>
                          <span>&bull;</span>
                          <span>{p.tempo.toFixed(0)} BPM</span>
                        </div>
                      </div>
                    </div>

                    {/* Status Pill */}
                    <div className="flex items-center space-x-2">
                      <span
                        className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border ${
                          isComplete
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : isFailed
                            ? "bg-red-500/10 text-red-400 border-red-500/20"
                            : "bg-electric-500/10 text-electric-400 border-electric-500/20 animate-pulse"
                        }`}
                      >
                        {p.status}
                      </span>
                      <button
                        onClick={(e) => handleDeleteProject(p.id, e)}
                        className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-dark-800 rounded-lg transition-colors"
                        title="Delete project"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Progress bar if still running */}
                  {!isComplete && !isFailed && (
                    <div className="space-y-1">
                      <div className="w-full h-1.5 bg-dark-950 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-electric-500 rounded-full transition-all"
                          style={{ width: `${p.progress_percent}%` }}
                        />
                      </div>
                      <p className="text-[10px] font-mono text-gray-400 truncate">{p.status_message}</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs pt-1 text-gray-400">
                    <span className="font-mono text-[11px]">{new Date(p.created_at).toLocaleDateString()}</span>
                    <span className="flex items-center space-x-1 text-electric-400 group-hover:translate-x-1 transition-transform font-medium">
                      <span>Open Studio</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
