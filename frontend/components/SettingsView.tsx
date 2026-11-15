"use client";

import React, { useState, useEffect } from "react";
import {
  Palette,
  Sliders,
  Music,
  Video,
  Volume2,
  Check,
  Save,
  RotateCcw,
  Sparkles,
  Info,
} from "lucide-react";

export interface StudioSettings {
  theme: "electric" | "violet" | "cyberpunk" | "emerald" | "monochrome";
  lookaheadSeconds: number;
  bloomEnabled: boolean;
  particlesEnabled: boolean;
  soundFont: "salamander_c5" | "fluid_gm";
  normalizeAudio: boolean;
  masterVolume: number;
  exportFps: number;
}

export const DEFAULT_SETTINGS: StudioSettings = {
  theme: "electric",
  lookaheadSeconds: 2.5,
  bloomEnabled: true,
  particlesEnabled: true,
  soundFont: "salamander_c5",
  normalizeAudio: true,
  masterVolume: 85,
  exportFps: 30,
};

const SETTINGS_KEY = "ai_piano_studio_settings";

export const SettingsView: React.FC = () => {
  const [settings, setSettings] = useState<StudioSettings>(DEFAULT_SETTINGS);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      try {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
      } catch {}
    }
  }, []);

  const handleSave = () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-12">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-dark-700/80">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
            <Sliders className="w-6 h-6 text-electric-400" />
            <span>Studio Preferences</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Customize 3D visual styles, note falling speed, audio synthesis, and export quality.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleReset}
            className="px-4 py-2 rounded-xl bg-dark-800 hover:bg-dark-700 text-gray-300 text-xs font-medium border border-dark-700 transition-colors flex items-center space-x-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2.5 rounded-xl bg-electric-500 hover:bg-electric-400 text-white text-xs font-semibold shadow-lg shadow-electric-500/20 transition-all flex items-center space-x-1.5"
          >
            {isSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            <span>{isSaved ? "Saved!" : "Save Changes"}</span>
          </button>
        </div>
      </div>

      {/* 1. Visual Theme */}
      <div className="p-6 rounded-2xl bg-dark-900 border border-dark-700/80 space-y-4">
        <div className="flex items-center space-x-2 text-sm font-bold text-white">
          <Palette className="w-4 h-4 text-electric-400" />
          <span>Color Theme & Visual Styling</span>
        </div>
        <p className="text-xs text-gray-400">
          Determines the falling note gradient color, key illumination glow, and scene atmosphere.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 pt-2">
          {[
            { id: "electric", label: "Electric Blue", color: "from-sky-500 to-blue-600" },
            { id: "violet", label: "Violet Glow", color: "from-purple-500 to-indigo-600" },
            { id: "cyberpunk", label: "Cyberpunk", color: "from-cyan-400 to-rose-500" },
            { id: "emerald", label: "Emerald Aura", color: "from-emerald-400 to-teal-600" },
            { id: "monochrome", label: "Silver Glass", color: "from-slate-200 to-slate-500" },
          ].map((th) => (
            <button
              key={th.id}
              onClick={() => setSettings({ ...settings, theme: th.id as any })}
              className={`p-3.5 rounded-xl border text-left transition-all relative overflow-hidden ${
                settings.theme === th.id
                  ? "border-electric-400 bg-dark-800 shadow-md ring-1 ring-electric-400"
                  : "border-dark-700 bg-dark-800/40 hover:bg-dark-800/80"
              }`}
            >
              <div className={`w-full h-8 rounded-lg bg-gradient-to-r ${th.color} mb-2.5 shadow-sm`} />
              <div className="text-xs font-semibold text-white">{th.label}</div>
              {settings.theme === th.id && (
                <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-electric-500 text-white flex items-center justify-center text-[10px]">
                  ✓
                </div>
              )}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3">
          <label className="flex items-center justify-between p-3.5 rounded-xl bg-dark-800/60 border border-dark-700/80 cursor-pointer">
            <div>
              <div className="text-xs font-semibold text-white">Keyboard Illumination Bloom</div>
              <div className="text-[11px] text-gray-400">Glowing reflections on piano keys when struck</div>
            </div>
            <input
              type="checkbox"
              checked={settings.bloomEnabled}
              onChange={(e) => setSettings({ ...settings, bloomEnabled: e.target.checked })}
              className="w-4 h-4 accent-electric-500 rounded"
            />
          </label>

          <label className="flex items-center justify-between p-3.5 rounded-xl bg-dark-800/60 border border-dark-700/80 cursor-pointer">
            <div>
              <div className="text-xs font-semibold text-white">Strike Spark Particles</div>
              <div className="text-[11px] text-gray-400">Floating spark emitters when notes make contact</div>
            </div>
            <input
              type="checkbox"
              checked={settings.particlesEnabled}
              onChange={(e) => setSettings({ ...settings, particlesEnabled: e.target.checked })}
              className="w-4 h-4 accent-electric-500 rounded"
            />
          </label>
        </div>
      </div>

      {/* 2. Falling Note Speed */}
      <div className="p-6 rounded-2xl bg-dark-900 border border-dark-700/80 space-y-4">
        <div className="flex items-center space-x-2 text-sm font-bold text-white">
          <Sliders className="w-4 h-4 text-electric-400" />
          <span>Note Falling Speed & Lookahead</span>
        </div>
        <p className="text-xs text-gray-400">
          Controls how far ahead incoming notes appear before reaching the piano keyboard line.
        </p>

        <div className="space-y-3 pt-2">
          <div className="flex justify-between text-xs font-mono">
            <span className="text-gray-400">Lookahead Window:</span>
            <span className="text-electric-400 font-bold">{settings.lookaheadSeconds.toFixed(1)} seconds</span>
          </div>

          <input
            type="range"
            min={1.5}
            max={5.0}
            step={0.5}
            value={settings.lookaheadSeconds}
            onChange={(e) => setSettings({ ...settings, lookaheadSeconds: parseFloat(e.target.value) })}
            className="w-full accent-electric-500 cursor-pointer h-2 bg-dark-700 rounded-lg"
          />

          <div className="flex justify-between text-[11px] text-gray-400 font-mono">
            <span>Fast (1.5s)</span>
            <span>Balanced (2.5s)</span>
            <span>Extended (5.0s)</span>
          </div>
        </div>
      </div>

      {/* 3. Audio & SoundFont Synthesis */}
      <div className="p-6 rounded-2xl bg-dark-900 border border-dark-700/80 space-y-4">
        <div className="flex items-center space-x-2 text-sm font-bold text-white">
          <Music className="w-4 h-4 text-electric-400" />
          <span>Piano Audio Synthesis & SoundFont</span>
        </div>

        <div className="space-y-3">
          <label className="block text-xs font-semibold text-gray-300">Selected SoundFont Engine</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div
              onClick={() => setSettings({ ...settings, soundFont: "salamander_c5" })}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                settings.soundFont === "salamander_c5"
                  ? "border-electric-500 bg-electric-500/10"
                  : "border-dark-700 bg-dark-800/40 hover:bg-dark-800"
              }`}
            >
              <div className="text-xs font-bold text-white">Salamander Grand Piano C5 (Light)</div>
              <p className="text-[11px] text-gray-400 mt-1">
                Authentic Yamaha C5 Grand Piano multi-samples recorded in 24-bit with 16 velocity layers.
              </p>
            </div>

            <div
              onClick={() => setSettings({ ...settings, soundFont: "fluid_gm" })}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                settings.soundFont === "fluid_gm"
                  ? "border-electric-500 bg-electric-500/10"
                  : "border-dark-700 bg-dark-800/40 hover:bg-dark-800"
              }`}
            >
              <div className="text-xs font-bold text-white">Fluid General MIDI Acoustic Grand</div>
              <p className="text-[11px] text-gray-400 mt-1">
                Crisp classical concert piano sound with fast attack times and broad frequency range.
              </p>
            </div>
          </div>

          <label className="flex items-center justify-between p-3.5 rounded-xl bg-dark-800/60 border border-dark-700/80 cursor-pointer mt-3">
            <div>
              <div className="text-xs font-semibold text-white">Dynamic Peak Normalization</div>
              <div className="text-[11px] text-gray-400">Normalizes synthesized piano audio to -1.0 dBFS to prevent clipping</div>
            </div>
            <input
              type="checkbox"
              checked={settings.normalizeAudio}
              onChange={(e) => setSettings({ ...settings, normalizeAudio: e.target.checked })}
              className="w-4 h-4 accent-electric-500 rounded"
            />
          </label>
        </div>
      </div>

      {/* 4. Video Export Specification */}
      <div className="p-6 rounded-2xl bg-dark-900 border border-dark-700/80 space-y-4">
        <div className="flex items-center space-x-2 text-sm font-bold text-white">
          <Video className="w-4 h-4 text-electric-400" />
          <span>Video Rendering Specification</span>
        </div>

        <div className="p-4 rounded-xl bg-dark-800/60 border border-dark-700 space-y-2 text-xs">
          <div className="flex justify-between text-gray-300">
            <span className="text-gray-400">Resolution:</span>
            <span className="font-mono font-medium text-white">1280 × 720 (720p HD)</span>
          </div>
          <div className="flex justify-between text-gray-300">
            <span className="text-gray-400">Frame Rate:</span>
            <span className="font-mono font-medium text-white">{settings.exportFps} FPS</span>
          </div>
          <div className="flex justify-between text-gray-300">
            <span className="text-gray-400">Video Codec:</span>
            <span className="font-mono font-medium text-white">H.264 / AVC (High Profile)</span>
          </div>
          <div className="flex justify-between text-gray-300">
            <span className="text-gray-400">Audio Codec:</span>
            <span className="font-mono font-medium text-white">AAC Stereo (192 kbps, 44.1 kHz)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
