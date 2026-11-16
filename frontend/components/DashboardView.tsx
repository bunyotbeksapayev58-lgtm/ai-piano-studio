"use client";

import React, { useEffect, useState } from "react";
import {
  PlusCircle,
  Film,
  CheckCircle2,
  Clock,
  AlertTriangle,
  HardDrive,
  RefreshCw,
  Play,
  Download,
  Trash2,
  ArrowRight,
  Sliders,
  Sparkles,
} from "lucide-react";
import { api, DashboardStatsResponse, ProjectStatusResponse, UserResponse } from "@/services/api";

interface DashboardViewProps {
  currentUser: UserResponse | null;
  onNewProject: () => void;
  onOpenProject: (projectId: string) => void;
  onOpenSignIn: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  currentUser,
  onNewProject,
  onOpenProject,
  onOpenSignIn,
}) => {
  const [stats, setStats] = useState<DashboardStatsResponse | null>(null);
  const [projects, setProjects] = useState<ProjectStatusResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = async () => {
    try {
      // Use Promise.race with a 7-second timeout to prevent infinite hanging
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Request timed out")), 7000)
      );

      const [statsData, projectsData] = await Promise.race([
        Promise.all([api.getStats(), api.getProjects()]),
        timeoutPromise,
      ]);
      setStats(statsData);
      setProjects(projectsData || []);
    } catch (err) {
      console.warn("Failed or timed out loading dashboard data:", err);
      // Fallback: try fetching projects individually if stats failed
      try {
        const pData = await api.getProjects();
        setProjects(pData || []);
      } catch (_) {}
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    // Auto-refresh periodically if on dashboard
    const timer = setInterval(() => {
      api.getProjects().then((data) => {
        if (Array.isArray(data)) setProjects(data);
      }).catch(() => {});
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadData();
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this project? All associated media will be removed.")) {
      return;
    }
    try {
      await api.deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      if (stats) {
        setStats({
          ...stats,
          total_projects: Math.max(0, stats.total_projects - 1),
        });
      }
    } catch (err) {
      alert("Failed to delete project");
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-dark-900 via-dark-850 to-dark-900 border border-dark-700/80 p-6 sm:p-8 shadow-xl">
        <div className="absolute -right-12 -top-12 w-64 h-64 bg-electric-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-12 -bottom-12 w-64 h-64 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-electric-500/10 border border-electric-500/20 text-electric-400 text-xs font-mono">
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Audio-to-Piano Studio</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {currentUser ? `Welcome back, ${currentUser.username}` : "AI Piano Video Studio"}
            </h1>
            <p className="text-sm text-gray-400 max-w-xl">
              Upload any musical performance to extract high-accuracy polyphonic MIDI, synthesize acoustic grand piano, and render synchronised 3D falling-notes videos.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-3 rounded-xl bg-dark-800 hover:bg-dark-700 border border-dark-700 text-gray-300 hover:text-white transition-colors"
              title="Refresh Stats"
            >
              <RefreshCw className={`w-5 h-5 ${isRefreshing ? "animate-spin" : ""}`} />
            </button>

            <button
              onClick={onNewProject}
              className="px-5 py-3 rounded-xl bg-gradient-to-r from-electric-500 to-violet-600 hover:from-electric-400 hover:to-violet-500 text-white font-semibold text-sm shadow-lg shadow-electric-500/25 flex items-center space-x-2 transition-all hover:scale-[1.02]"
            >
              <PlusCircle className="w-5 h-5" />
              <span>Create New Project</span>
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Projects */}
        <div className="p-5 rounded-2xl bg-dark-900/90 border border-dark-700/80 shadow-md flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-electric-500/10 border border-electric-500/20 flex items-center justify-center text-electric-400">
            <Film className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-white font-mono">
              {isLoading ? "—" : stats?.total_projects ?? 0}
            </div>
            <div className="text-xs text-gray-400">Total Projects</div>
          </div>
        </div>

        {/* Completed */}
        <div className="p-5 rounded-2xl bg-dark-900/90 border border-dark-700/80 shadow-md flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-white font-mono">
              {isLoading ? "—" : stats?.completed_projects ?? 0}
            </div>
            <div className="text-xs text-gray-400">Completed Exports</div>
          </div>
        </div>

        {/* Processing */}
        <div className="p-5 rounded-2xl bg-dark-900/90 border border-dark-700/80 shadow-md flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-white font-mono">
              {isLoading ? "—" : stats?.processing_projects ?? 0}
            </div>
            <div className="text-xs text-gray-400">In Processing</div>
          </div>
        </div>

        {/* Failed */}
        <div className="p-5 rounded-2xl bg-dark-900/90 border border-dark-700/80 shadow-md flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-white font-mono">
              {isLoading ? "—" : stats?.failed_projects ?? 0}
            </div>
            <div className="text-xs text-gray-400">Failed / Retried</div>
          </div>
        </div>

        {/* Storage */}
        <div className="col-span-2 lg:col-span-1 p-5 rounded-2xl bg-dark-900/90 border border-dark-700/80 shadow-md flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
            <HardDrive className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-white font-mono">
              {isLoading ? "—" : `${stats?.total_storage_mb ?? stats?.storage_mb ?? 0} MB`}
            </div>
            <div className="text-xs text-gray-400">Disk Storage</div>
          </div>
        </div>
      </div>

      {/* Recent Projects Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Recent Projects</h2>
            <p className="text-xs text-gray-400">Manage your transcriptions, open the 3D studio, or download exports.</p>
          </div>
          {projects.length > 0 && (
            <span className="text-xs font-mono text-gray-400">{projects.length} project(s)</span>
          )}
        </div>

        {isLoading ? (
          <div className="p-12 text-center rounded-2xl border border-dark-700/80 bg-dark-900/50">
            <div className="w-8 h-8 border-2 border-electric-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs text-gray-400 font-mono">Loading project history...</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="p-12 text-center rounded-3xl border border-dashed border-dark-700 bg-dark-900/40 space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-dark-800 flex items-center justify-center mx-auto text-gray-400">
              <Film className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">No projects found</h3>
              <p className="text-xs text-gray-400 max-w-sm mx-auto mt-1">
                Upload your first music video to transcribe audio notes, synthesize grand piano, and render falling notes animation.
              </p>
            </div>
            <button
              onClick={onNewProject}
              className="px-4 py-2 rounded-xl bg-electric-500 hover:bg-electric-400 text-white text-xs font-medium inline-flex items-center space-x-2"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Create Project</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => {
              const isDone = p.status === "COMPLETE";
              const isFailed = p.status === "FAILED";
              const isBusy = !isDone && !isFailed && p.status !== "UPLOADED";

              return (
                <div
                  key={p.id}
                  onClick={() => onOpenProject(p.id)}
                  className="group relative rounded-2xl bg-dark-900/90 border border-dark-700/80 hover:border-electric-500/50 p-5 shadow-lg transition-all hover:-translate-y-0.5 cursor-pointer flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="truncate flex-1">
                        <h4 className="text-sm font-semibold text-white truncate group-hover:text-electric-400 transition-colors">
                          {p.title || p.filename}
                        </h4>
                        <p className="text-[11px] font-mono text-gray-400 mt-0.5">
                          ID: {p.id.slice(0, 10)}...
                        </p>
                      </div>

                      <span
                        className={`text-[10px] px-2.5 py-0.5 rounded-full font-mono font-medium shrink-0 border ${
                          isDone
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : isFailed
                            ? "bg-red-500/10 text-red-400 border-red-500/20"
                            : isBusy
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse"
                            : "bg-gray-500/10 text-gray-400 border-gray-500/20"
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>

                    {/* Progress Bar (if processing) */}
                    {isBusy && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] text-gray-400 font-mono">
                          <span>{p.status_message}</span>
                          <span>{Math.round(p.progress_percent)}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-dark-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-electric-500 to-violet-500 transition-all duration-300"
                            style={{ width: `${Math.max(5, p.progress_percent)}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Metadata tags */}
                    <div className="flex flex-wrap gap-2 text-[11px] font-mono text-gray-300 pt-1">
                      <div className="px-2 py-1 rounded-md bg-dark-800 border border-dark-700">
                        {p.duration_seconds.toFixed(1)}s
                      </div>
                      <div className="px-2 py-1 rounded-md bg-dark-800 border border-dark-700">
                        {p.note_count} notes
                      </div>
                      {p.tempo > 0 && (
                        <div className="px-2 py-1 rounded-md bg-dark-800 border border-dark-700">
                          {Math.round(p.tempo)} BPM
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions footer */}
                  <div className="mt-5 pt-3 border-t border-dark-800 flex items-center justify-between text-xs">
                    <span className="text-gray-400 text-[11px]">
                      {new Date(p.created_at).toLocaleDateString()}
                    </span>

                    <div className="flex items-center space-x-1">
                      {isDone && (
                        <a
                          href={api.getVideoDownloadUrl(p.id)}
                          download
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 text-gray-400 hover:text-emerald-400 rounded-lg hover:bg-dark-800 transition-colors"
                          title="Download MP4"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      )}
                      <button
                        onClick={(e) => handleDelete(p.id, e)}
                        className="p-1.5 text-gray-400 hover:text-red-400 rounded-lg hover:bg-dark-800 transition-colors"
                        title="Delete project"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <div className="pl-1 text-electric-400 group-hover:translate-x-1 transition-transform">
                        <ArrowRight className="w-4 h-4" />
                      </div>
                    </div>
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
