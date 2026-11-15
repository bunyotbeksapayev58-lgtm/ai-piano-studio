"use client";

import React, { useState, useEffect } from "react";
import { Navbar, NavTab } from "@/components/Navbar";
import { DashboardView } from "@/components/DashboardView";
import { HomeView } from "@/components/HomeView";
import { ProcessingView } from "@/components/ProcessingView";
import { PianoPreview } from "@/components/PianoPreview";
import { MidiEditor } from "@/components/MidiEditor";
import { ExportView } from "@/components/ExportView";
import { SettingsView } from "@/components/SettingsView";
import { HelpView } from "@/components/HelpView";
import { AuthModal } from "@/components/AuthModal";
import {
  ProjectStatusResponse,
  PreviewDataResponse,
  UserResponse,
  NoteDto,
  authApi,
  api,
} from "@/services/api";

type ViewState =
  | "dashboard"
  | "new-project"
  | "processing"
  | "studio-3d"
  | "studio-midi"
  | "export"
  | "settings"
  | "help";

export default function App() {
  const [currentNavTab, setCurrentNavTab] = useState<NavTab>("dashboard");
  const [activeView, setActiveView] = useState<ViewState>("dashboard");
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeProject, setActiveProject] = useState<ProjectStatusResponse | null>(null);
  const [previewData, setPreviewData] = useState<PreviewDataResponse | null>(null);
  const [isLoadingProject, setIsLoadingProject] = useState<boolean>(false);

  // Authentication state
  const [currentUser, setCurrentUser] = useState<UserResponse | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);

  // On mount, load user if token exists
  useEffect(() => {
    const cachedUser = authApi.getCurrentUser();
    if (cachedUser) {
      setCurrentUser(cachedUser);
    }
    authApi.getMe().then((u) => {
      if (u) setCurrentUser(u);
    });
  }, []);

  // Handle project selection (from dashboard, upload, or projects view)
  const handleProjectSelected = async (projectId: string) => {
    setActiveProjectId(projectId);
    setIsLoadingProject(true);

    try {
      const statusData = await api.getStatus(projectId);
      setActiveProject(statusData);

      if (statusData.status === "COMPLETE") {
        const pData = await api.getPreview(projectId);
        setPreviewData(pData);
        setActiveView("studio-3d");
        setCurrentNavTab("studio");
      } else {
        setActiveView("processing");
      }
    } catch (err) {
      console.error("Error loading project:", err);
      setActiveView("processing");
    } finally {
      setIsLoadingProject(false);
    }
  };

  const handleProcessingComplete = async () => {
    if (!activeProjectId) return;
    try {
      const statusData = await api.getStatus(activeProjectId);
      setActiveProject(statusData);
      const pData = await api.getPreview(activeProjectId);
      setPreviewData(pData);
      setActiveView("studio-3d");
      setCurrentNavTab("studio");
    } catch (err) {
      console.error("Failed to load completed preview:", err);
    }
  };

  const handleNotesSaved = async (_updatedNotes: NoteDto[]) => {
    if (!activeProjectId) return;
    try {
      const pData = await api.getPreview(activeProjectId);
      setPreviewData(pData);
      const sData = await api.getStatus(activeProjectId);
      setActiveProject(sData);
    } catch (err) {
      console.error("Error refreshing after note save:", err);
    }
  };

  const handleTriggerReRender = () => {
    if (!activeProjectId) return;
    setActiveView("processing");
  };

  const handleNavTabChange = (tab: NavTab) => {
    setCurrentNavTab(tab);
    if (tab === "dashboard") {
      setActiveView("dashboard");
    } else if (tab === "new-project") {
      setActiveView("new-project");
    } else if (tab === "projects") {
      setActiveView("dashboard");
    } else if (tab === "studio") {
      if (activeProjectId && previewData) {
        setActiveView("studio-3d");
      } else {
        setActiveView("new-project");
      }
    } else if (tab === "settings") {
      setActiveView("settings");
    } else if (tab === "help") {
      setActiveView("help");
    }
  };

  return (
    <div className="min-h-screen bg-dark-950 text-gray-100 flex flex-col selection:bg-electric-500/30 selection:text-white">
      {/* Navigation */}
      <Navbar
        currentTab={currentNavTab}
        onTabChange={handleNavTabChange}
        currentUser={currentUser}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        hasActiveProject={Boolean(activeProjectId && previewData)}
      />

      {/* Main View Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {isLoadingProject ? (
          <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-3">
            <div className="w-10 h-10 border-2 border-electric-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-mono text-gray-400">Loading project data...</p>
          </div>
        ) : activeView === "dashboard" ? (
          <DashboardView
            currentUser={currentUser}
            onNewProject={() => {
              setCurrentNavTab("new-project");
              setActiveView("new-project");
            }}
            onOpenProject={handleProjectSelected}
            onOpenSignIn={() => setIsAuthModalOpen(true)}
          />
        ) : activeView === "new-project" ? (
          <HomeView onProjectSelected={handleProjectSelected} />
        ) : activeView === "processing" && activeProjectId ? (
          <ProcessingView
            projectId={activeProjectId}
            onComplete={handleProcessingComplete}
            onError={(msg) => console.error("Pipeline error:", msg)}
          />
        ) : activeView === "studio-3d" && activeProjectId && previewData ? (
          <PianoPreview
            projectId={activeProjectId}
            previewData={previewData}
            onGoToExport={() => setActiveView("export")}
            onOpenMidiEditor={() => setActiveView("studio-midi")}
          />
        ) : activeView === "studio-midi" && activeProjectId && previewData ? (
          <MidiEditor
            projectId={activeProjectId}
            notes={previewData.notes}
            durationSeconds={previewData.duration_seconds}
            tempo={previewData.tempo}
            onNotesSaved={handleNotesSaved}
            onTriggerReRender={handleTriggerReRender}
            onBackTo3D={() => setActiveView("studio-3d")}
          />
        ) : activeView === "export" && activeProject ? (
          <ExportView
            project={activeProject}
            onBackToPreview={() => setActiveView("studio-3d")}
            onBackToHome={() => {
              setCurrentNavTab("dashboard");
              setActiveView("dashboard");
            }}
            onDeleted={() => {
              setActiveProjectId(null);
              setPreviewData(null);
              setActiveProject(null);
              setCurrentNavTab("dashboard");
              setActiveView("dashboard");
            }}
          />
        ) : activeView === "settings" ? (
          <SettingsView />
        ) : activeView === "help" ? (
          <HelpView />
        ) : (
          <DashboardView
            currentUser={currentUser}
            onNewProject={() => {
              setCurrentNavTab("new-project");
              setActiveView("new-project");
            }}
            onOpenProject={handleProjectSelected}
            onOpenSignIn={() => setIsAuthModalOpen(true)}
          />
        )}
      </main>

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        currentUser={currentUser}
        onUserChanged={(u) => setCurrentUser(u)}
      />

      {/* Footer */}
      <footer className="border-t border-dark-700/60 bg-dark-900/60 py-6 text-center text-xs text-gray-400 font-mono">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-electric-500" />
            <span>AI Piano Studio &bull; Falling Note Architecture</span>
          </div>
          <div>
            Spotify Basic Pitch AI &bull; FluidSynth &bull; FFmpeg &bull; Three.js WebGL &bull; FastAPI &bull; Next.js 14
          </div>
        </div>
      </footer>
    </div>
  );
}
