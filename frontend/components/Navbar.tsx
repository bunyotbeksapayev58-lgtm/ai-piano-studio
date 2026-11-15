"use client";

import React, { useEffect, useState } from "react";
import {
  Music,
  LayoutDashboard,
  PlusCircle,
  FolderOpen,
  Film,
  Sliders,
  HelpCircle,
  User,
} from "lucide-react";
import { UserResponse } from "@/services/api";

export type NavTab = "dashboard" | "new-project" | "projects" | "studio" | "settings" | "help";

interface NavbarProps {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  currentUser: UserResponse | null;
  onOpenAuthModal: () => void;
  hasActiveProject: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onTabChange,
  currentUser,
  onOpenAuthModal,
  hasActiveProject,
}) => {
  const [engineStatus, setEngineStatus] = useState<"checking" | "online" | "offline">("checking");

  useEffect(() => {
    fetch("/api/projects")
      .then((res) => {
        if (res.ok) setEngineStatus("online");
        else setEngineStatus("offline");
      })
      .catch(() => setEngineStatus("offline"));
  }, []);

  return (
    <header className="border-b border-dark-700/60 bg-dark-900/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2">
        {/* Brand */}
        <div
          onClick={() => onTabChange("dashboard")}
          className="flex items-center space-x-3 cursor-pointer group shrink-0"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-electric-600 via-violet-600 to-electric-cyan flex items-center justify-center shadow-lg shadow-electric-600/20 group-hover:scale-105 transition-transform duration-200">
            <Music className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-bold text-base sm:text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-electric-400 bg-clip-text text-transparent">
                AI PIANO STUDIO
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-electric-500/10 text-electric-400 border border-electric-500/20">
                PRO
              </span>
            </div>
            <p className="text-[10px] text-gray-400 font-mono tracking-wider hidden sm:block">
              FALLING NOTE ARCHITECTURE
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center space-x-1 overflow-x-auto scrollbar-none py-1">
          <button
            onClick={() => onTabChange("dashboard")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-1.5 shrink-0 ${
              currentTab === "dashboard"
                ? "bg-electric-500/15 text-electric-400 border border-electric-500/30"
                : "text-gray-400 hover:text-white hover:bg-dark-800"
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Dashboard</span>
          </button>

          <button
            onClick={() => onTabChange("new-project")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-1.5 shrink-0 ${
              currentTab === "new-project"
                ? "bg-electric-500/15 text-electric-400 border border-electric-500/30"
                : "text-gray-400 hover:text-white hover:bg-dark-800"
            }`}
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>New Project</span>
          </button>

          <button
            onClick={() => onTabChange("projects")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-1.5 shrink-0 ${
              currentTab === "projects"
                ? "bg-electric-500/15 text-electric-400 border border-electric-500/30"
                : "text-gray-400 hover:text-white hover:bg-dark-800"
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span className="hidden md:inline">My Projects</span>
          </button>

          {hasActiveProject && (
            <button
              onClick={() => onTabChange("studio")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-1.5 shrink-0 ${
                currentTab === "studio"
                  ? "bg-electric-500/15 text-electric-400 border border-electric-500/30 shadow-[0_0_12px_rgba(14,165,233,0.3)]"
                  : "text-electric-400 hover:text-white hover:bg-dark-800"
              }`}
            >
              <Film className="w-3.5 h-3.5 animate-pulse" />
              <span>Piano Studio</span>
            </button>
          )}

          <button
            onClick={() => onTabChange("settings")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-1.5 shrink-0 ${
              currentTab === "settings"
                ? "bg-electric-500/15 text-electric-400 border border-electric-500/30"
                : "text-gray-400 hover:text-white hover:bg-dark-800"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Settings</span>
          </button>

          <button
            onClick={() => onTabChange("help")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-1.5 shrink-0 ${
              currentTab === "help"
                ? "bg-electric-500/15 text-electric-400 border border-electric-500/30"
                : "text-gray-400 hover:text-white hover:bg-dark-800"
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Help</span>
          </button>
        </nav>

        {/* Right Action: Status & User Profile */}
        <div className="flex items-center space-x-3 shrink-0">
          {/* AI Engine Status */}
          <div className="hidden lg:flex items-center space-x-2 px-2.5 py-1 rounded-full text-[11px] font-mono bg-dark-800/80 border border-dark-700">
            <span
              className={`w-2 h-2 rounded-full ${
                engineStatus === "online"
                  ? "bg-emerald-400 shadow-[0_0_8px_#34d399]"
                  : engineStatus === "checking"
                  ? "bg-amber-400 animate-pulse"
                  : "bg-red-400 shadow-[0_0_8px_#f87171]"
              }`}
            />
            <span className="text-gray-300">
              {engineStatus === "online"
                ? "AI Ready"
                : engineStatus === "checking"
                ? "Connecting..."
                : "Offline"}
            </span>
          </div>

          {/* User Sign In / Profile */}
          <button
            onClick={onOpenAuthModal}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
              currentUser
                ? "bg-dark-800 border-dark-700 text-white hover:border-electric-500"
                : "bg-electric-500/10 border-electric-500/30 text-electric-400 hover:bg-electric-500/20"
            }`}
          >
            {currentUser ? (
              <>
                <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-electric-500 to-violet-500 flex items-center justify-center text-[10px] text-white font-bold">
                  {currentUser.username[0].toUpperCase()}
                </div>
                <span className="max-w-[80px] truncate">{currentUser.username}</span>
              </>
            ) : (
              <>
                <User className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
