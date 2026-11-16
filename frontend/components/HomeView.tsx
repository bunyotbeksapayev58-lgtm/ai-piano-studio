"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  UploadCloud,
  FileVideo,
  Sparkles,
  Music,
  AlertCircle,
  Trash2,
  ChevronRight,
  Sliders,
  Layers,
  Wand2,
  Check
} from "lucide-react";
import { ProjectStatusResponse, PresetsResponse, api } from "@/services/api";

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

  // Studio Configuration States
  const [songMode, setSongMode] = useState<string>("universal_song");
  const [soundPreset, setSoundPreset] = useState<string>("concert_grand");
  const [theme, setTheme] = useState<string>("falling_note_anime");
  const [handsStyle, setHandsStyle] = useState<string>("anime");
  const [showConfig, setShowConfig] = useState<boolean>(true);
  const [presetData, setPresetData] = useState<PresetsResponse | null>(null);

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
    api.getPresets().then((p) => setPresetData(p)).catch(console.error);
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

    const options = {
      song_mode: songMode,
      sound_preset: soundPreset,
      theme: theme,
      hands_style: handsStyle,
    };

    try {
      // 1. Upload file with chosen piano preset & song mode
      const uploadedProject = await api.uploadVideo(file, options, (pct) => {
        setUploadPercent(pct);
      });

      // 2. Trigger analysis, MIDI arrangement, and video rendering
      await api.startAnalysis(uploadedProject.id, true, options);

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
    <div className="space-y-10">
      {/* Hero Section */}
      <div className="text-center max-w-3xl mx-auto space-y-3 pt-2">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-mono font-medium bg-electric-500/10 text-electric-400 border border-electric-500/20">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Universal AI Audio-to-Piano Studio</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
          Har qanday qo‘shiqni{" "}
          <span className="bg-gradient-to-r from-electric-400 via-sky-300 to-violet-400 bg-clip-text text-transparent">
            Pianinoga aylantiring
          </span>
        </h1>

        <p className="text-sm sm:text-base text-gray-400 max-w-2xl mx-auto leading-relaxed">
          Istalgan musiqani (pop, rap, rok, estrada, klassik) yuklang. AI baraban va shovqinlarni tozalab, vokal va ohanglarni pianinoga moslashtiradi hamda jonli harakatlanuvchi anime qo‘llar bilan 720p HD video yasab beradi.
        </p>
      </div>

      {/* Piano Studio Customization Panel */}
      <div className="max-w-4xl mx-auto bg-dark-900/90 border border-dark-700/80 rounded-3xl p-6 sm:p-7 shadow-2xl backdrop-blur-md space-y-6">
        <div className="flex items-center justify-between border-b border-dark-700/60 pb-4">
          <div className="flex items-center space-x-2.5">
            <Sliders className="w-5 h-5 text-electric-400" />
            <h2 className="text-base font-bold text-white tracking-wide">Pianino Rusumlari va Ijro Sozlamalari</h2>
          </div>
          <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-electric-500/10 text-electric-400 border border-electric-500/20">
            AI Auto-Arranger Active
          </span>
        </div>

        {/* 1. Song Mode / Qo'shiq turi */}
        <div className="space-y-2.5">
          <label className="text-xs font-semibold text-gray-300 flex items-center space-x-2">
            <Wand2 className="w-4 h-4 text-emerald-400" />
            <span>1. Qo‘shiq / Ijro Rejimi:</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setSongMode("universal_song")}
              className={`p-3.5 rounded-2xl border text-left transition-all ${
                songMode === "universal_song"
                  ? "bg-electric-500/15 border-electric-400 text-white shadow-lg shadow-electric-500/10"
                  : "bg-dark-800/80 border-dark-700 text-gray-400 hover:text-white hover:border-dark-600"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-xs text-electric-300">🌟 Har qanday qo‘shiq (HPSS AI)</span>
                {songMode === "universal_song" && <Check className="w-3.5 h-3.5 text-electric-400" />}
              </div>
              <p className="text-[11px] text-gray-400 leading-snug">
                Baraban & beatlarni tozalab, vokal melodiyasini o‘ng qo‘lga, basni chap qo‘lga moslaydi.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setSongMode("solo_piano")}
              className={`p-3.5 rounded-2xl border text-left transition-all ${
                songMode === "solo_piano"
                  ? "bg-electric-500/15 border-electric-400 text-white shadow-lg shadow-electric-500/10"
                  : "bg-dark-800/80 border-dark-700 text-gray-400 hover:text-white hover:border-dark-600"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-xs text-sky-300">🎹 Akustik Solo Pianino</span>
                {songMode === "solo_piano" && <Check className="w-3.5 h-3.5 text-electric-400" />}
              </div>
              <p className="text-[11px] text-gray-400 leading-snug">
                Klassik va instrumental royal asarlari uchun tor aks-sadosini tozalovchi rejim.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setSongMode("easy_tutorial")}
              className={`p-3.5 rounded-2xl border text-left transition-all ${
                songMode === "easy_tutorial"
                  ? "bg-electric-500/15 border-electric-400 text-white shadow-lg shadow-electric-500/10"
                  : "bg-dark-800/80 border-dark-700 text-gray-400 hover:text-white hover:border-dark-600"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-xs text-amber-300">🎓 Oson Pianino (Tutorial)</span>
                {songMode === "easy_tutorial" && <Check className="w-3.5 h-3.5 text-electric-400" />}
              </div>
              <p className="text-[11px] text-gray-400 leading-snug">
                Boshlang‘ich o‘rganuvchilar uchun soddalashtirilgan melodiya va bas akkordlari.
              </p>
            </button>
          </div>
        </div>

        {/* 2. Piano Instrument Sound Presets / Pianino Rusumi */}
        <div className="space-y-2.5">
          <label className="text-xs font-semibold text-gray-300 flex items-center space-x-2">
            <Music className="w-4 h-4 text-violet-400" />
            <span>2. Pianino Rusumi va Jarangi (SoundFont Instrument):</span>
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[
              { id: "concert_grand", name: "Concert Grand", tag: "Salamander Steinway C5", icon: "🎼" },
              { id: "bright_pop", name: "Bright Pop Grand", tag: "Yamaha C7 Pop/Rock", icon: "🎹" },
              { id: "vintage_upright", name: "Vintage Upright", tag: "Honky-Tonk / Saloon", icon: "📻" },
              { id: "rhodes_ep", name: "Neo-Soul Rhodes", tag: "Warm Tine Electric", icon: "⚡" },
              { id: "dx7_fm", name: "80s DX7 FM Piano", tag: "Retro Romantic Synth", icon: "🎹" },
              { id: "piano_strings", name: "Piano & Strings", tag: "Cinematic Symphony", icon: "🎻" },
              { id: "music_box", name: "Dreamy Music Box", tag: "Celesta / Fairytale", icon: "✨" },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSoundPreset(p.id)}
                className={`p-3 rounded-2xl border text-left transition-all ${
                  soundPreset === p.id
                    ? "bg-violet-600/20 border-violet-400 text-white shadow-md shadow-violet-500/10"
                    : "bg-dark-800/80 border-dark-700 text-gray-400 hover:text-white hover:border-dark-600"
                }`}
              >
                <div className="text-base mb-1">{p.icon}</div>
                <div className="font-bold text-xs text-white truncate">{p.name}</div>
                <div className="text-[10px] text-gray-400 font-mono truncate">{p.tag}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 3. Visual Theme & Hands Style */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          {/* Theme */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-300 flex items-center space-x-2">
              <Layers className="w-4 h-4 text-sky-400" />
              <span>3. Vizual Dizayn / Mavzu:</span>
            </label>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              className="w-full bg-dark-800 border border-dark-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-electric-400 transition-colors font-medium"
            >
              <option value="falling_note_anime">🌌 Falling Note Anime (Sky Blue & Emerald)</option>
              <option value="cyberpunk_neon">⚡ Cyberpunk Neon (Magenta & Cyan Bloom)</option>
              <option value="royal_gold">👑 Royal Gold & Ebony (Oltin va Qora)</option>
              <option value="emerald_nature">🌊 Emerald Nature (Zumrad va Moviy Yalpiz)</option>
              <option value="sunset_lofi">🌸 Sunset Lo-Fi (Pastel Shaftoli & Binafsha)</option>
              <option value="synthesia_pro">🎮 Synthesia Pro (Klassik Yashil & Ko‘k)</option>
            </select>
          </div>

          {/* Hands Style */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-300 flex items-center space-x-2">
              <span>🖐 4. Qo‘llar Harakati Uslubi:</span>
            </label>
            <select
              value={handsStyle}
              onChange={(e) => setHandsStyle(e.target.value)}
              className="w-full bg-dark-800 border border-dark-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-electric-400 transition-colors font-medium"
            >
              <option value="anime">🖐 Anime Realistic Hands (Tabiiy teri & yumshoq soya)</option>
              <option value="cyber_glow">⚡ Cyber Glow Hands (Futuristik neon kontur)</option>
              <option value="off">🚫 Qo‘llarsiz (Faqat klavishlar va tushuvchi notalar)</option>
            </select>
          </div>
        </div>

        {/* Upload Zone Card */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleFileDrop}
          onClick={() => !isUploading && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-3xl p-8 sm:p-10 text-center cursor-pointer transition-all duration-300 relative overflow-hidden group ${
            isDragging
              ? "border-electric-400 bg-electric-500/10 scale-[1.01]"
              : isUploading
              ? "border-dark-700 bg-dark-950/60 cursor-wait"
              : "border-electric-500/40 hover:border-electric-400 bg-dark-950/60 hover:bg-dark-850/80 shadow-2xl"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp4,.mov,.mkv,.webm,.avi,.mp3,.wav,.m4a,.flac,.ogg"
            onChange={handleFileSelect}
            className="hidden"
          />

          {isUploading ? (
            <div className="space-y-4 max-w-md mx-auto relative z-10">
              <div className="w-14 h-14 rounded-2xl bg-electric-500/15 border border-electric-500/30 flex items-center justify-center mx-auto text-electric-400 animate-pulse">
                <UploadCloud className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Musiqa yuklanmoqda va tahlilga tayyorlanmoqda...</h3>
                <p className="text-xs text-gray-400 font-mono mt-1">Tanlangan rejim: {songMode} • Pianino: {soundPreset}</p>
              </div>
              <div className="w-full h-2.5 bg-dark-950 rounded-full overflow-hidden p-0.5 border border-dark-700">
                <div
                  className="h-full bg-gradient-to-r from-electric-500 to-violet-500 rounded-full transition-all duration-200"
                  style={{ width: `${uploadPercent}%` }}
                />
              </div>
              <div className="text-xs font-mono text-electric-400 font-semibold">
                {uploadPercent}% Yuklandi
              </div>
            </div>
          ) : (
            <div className="space-y-4 relative z-10">
              <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-electric-600/30 to-violet-600/30 border border-electric-500/30 flex items-center justify-center mx-auto text-electric-400 shadow-xl shadow-electric-600/10 group-hover:scale-110 group-hover:border-electric-400 transition-all duration-300">
                <UploadCloud className="w-8 h-8" />
              </div>

              <div className="space-y-1.5">
                <h3 className="text-lg font-bold text-white">
                  Istalgan MP3 musiqa yoki videoni bu yerga tashlang, yoki{" "}
                  <span className="text-electric-400 underline underline-offset-4 decoration-electric-500/40 hover:decoration-electric-400">
                    faylni tanlang
                  </span>
                </h3>
                <p className="text-xs text-gray-400 max-w-sm mx-auto">
                  MP3, WAV, M4A, FLAC, MP4, MOV • 10 daqiqagacha davomiylik • Max 500MB
                </p>
              </div>
            </div>
          )}
        </div>

        {uploadError && (
          <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-200 text-xs font-mono flex items-center space-x-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{uploadError}</span>
          </div>
        )}
      </div>

      {/* Project History Section */}
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Mening Loyihalarim</h2>
            <p className="text-xs text-gray-400">Tayyorlangan videolarni ko‘rish, 3D studiyada ochish yoki MP4 yuklab olish</p>
          </div>
          <button
            onClick={loadProjects}
            className="text-xs font-semibold text-gray-400 hover:text-white px-3 py-1.5 rounded-lg bg-dark-850 border border-dark-700/80 transition-colors"
          >
            Yangilash
          </button>
        </div>

        {loadingProjects ? (
          <div className="text-center py-8 text-xs font-mono text-gray-500">Loyihalar yuklanmoqda...</div>
        ) : projects.length === 0 ? (
          <div className="border border-dark-700/60 rounded-2xl p-8 text-center bg-dark-900/40 text-gray-400 space-y-2">
            <Music className="w-8 h-8 mx-auto text-dark-600" />
            <p className="text-sm font-medium text-gray-300">Hozircha loyihalar yo‘q</p>
            <p className="text-xs text-gray-500">Yuqoridagi oynaga istalgan qo‘shiqni yuklab, birinchi pianino videongizni yarating.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {projects.map((p) => {
              const isComplete = p.status === "COMPLETE";
              const isFailed = p.status === "FAILED";
              const pTheme = p.visual_settings?.theme || "falling_note_anime";
              const pSound = p.visual_settings?.sound_preset || "concert_grand";

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
                          {p.title || p.filename}
                        </h4>
                        <div className="flex items-center space-x-2 text-[11px] text-gray-400 font-mono mt-0.5">
                          <span>{p.duration_seconds > 0 ? `${Math.floor(p.duration_seconds / 60)}:${Math.floor(p.duration_seconds % 60).toString().padStart(2, "0")}` : "--:--"}</span>
                          <span>•</span>
                          <span>{p.note_count > 0 ? `${p.note_count} nota` : "0 nota"}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={(e) => handleDeleteProject(p.id, e)}
                      className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="O'chirish"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-dark-750 text-xs">
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-dark-800 text-gray-300 border border-dark-700">
                        {pSound}
                      </span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium font-mono ${
                          isComplete
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                            : isFailed
                            ? "bg-red-500/15 text-red-400 border border-red-500/30"
                            : "bg-amber-500/15 text-amber-400 border border-amber-500/30 animate-pulse"
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>

                    <div className="flex items-center space-x-1 text-electric-400 text-xs font-semibold group-hover:translate-x-1 transition-transform">
                      <span>{isComplete ? "Studiyada ochish" : "Jarayon"}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
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
