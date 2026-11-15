"use client";

import React from "react";
import { BrainCircuit, Film, Music, Sliders } from "lucide-react";

export const DocsView: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">System Architecture & Technical Specs</h1>
        <p className="text-sm text-gray-400 mt-1">
          Complete breakdown of the AI transcription model, piano synthesizer, and video rendering pipeline.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* AI Audio Transcription */}
        <div className="bg-dark-900 border border-dark-700/60 rounded-2xl p-6 space-y-3">
          <div className="flex items-center space-x-3 text-electric-400">
            <BrainCircuit className="w-5 h-5" />
            <h3 className="font-semibold text-white text-base">AI Audio Transcription</h3>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            Integrates <strong className="text-gray-200">Spotify Basic Pitch</strong> (ICASSP 2022 Polyphonic Architecture), an open-source neural network trained specifically for polyphonic music transcription. It analyzes audio spectrograms to detect simultaneous note pitches (A0 to C8), precise onset/offset timestamps, and velocities.
          </p>
          <div className="text-[11px] font-mono text-gray-400 bg-dark-950 p-3 rounded-xl border border-dark-700/60 space-y-1">
            <div>• Engine: Spotify Basic Pitch (Apache 2.0)</div>
            <div>• Range: 88 Keys (MIDI 21 to 108)</div>
            <div>• Output: Polyphonic Type 1 MIDI (.mid)</div>
          </div>
        </div>

        {/* Hand Assignment Heuristic */}
        <div className="bg-dark-900 border border-dark-700/60 rounded-2xl p-6 space-y-3">
          <div className="flex items-center space-x-3 text-violet-400">
            <Sliders className="w-5 h-5" />
            <h3 className="font-semibold text-white text-base">Hand Separation Heuristic</h3>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            Splits detected notes into <strong className="text-gray-200">Right Hand (Melody/Treble)</strong> and <strong className="text-gray-200">Left Hand (Bass/Accompaniment)</strong> using simultaneous chord clustering, interval span heuristics, and temporal voice leading.
          </p>
          <div className="text-[11px] font-mono text-gray-400 bg-dark-950 p-3 rounded-xl border border-dark-700/60 space-y-1">
            <div>• Split bias: Middle C (MIDI 60) register</div>
            <div>• Channel 0: Right Hand (Electric Blue)</div>
            <div>• Channel 1: Left Hand (Vivid Violet)</div>
          </div>
        </div>

        {/* SoundFont Piano Synthesis */}
        <div className="bg-dark-900 border border-dark-700/60 rounded-2xl p-6 space-y-3">
          <div className="flex items-center space-x-3 text-emerald-400">
            <Music className="w-5 h-5" />
            <h3 className="font-semibold text-white text-base">Piano Sound Synthesis</h3>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            Uses <strong className="text-gray-200">FluidSynth v2.6.2</strong> loaded with the renowned <strong className="text-gray-200">Salamander Grand Piano C5</strong> SoundFont (Creative Commons CC-BY 3.0). Produces rich acoustic concert grand piano sound with authentic resonance and note releases.
          </p>
          <div className="text-[11px] font-mono text-gray-400 bg-dark-950 p-3 rounded-xl border border-dark-700/60 space-y-1">
            <div>• Instrument: Yamaha C5 Grand Piano Samples</div>
            <div>• Sample Rate: 44.1 kHz 16-bit Stereo WAV</div>
            <div>• Dynamic Range: Normalized to -1.0 dBFS</div>
          </div>
        </div>

        {/* Video Rendering Engine */}
        <div className="bg-dark-900 border border-dark-700/60 rounded-2xl p-6 space-y-3">
          <div className="flex items-center space-x-3 text-sky-400">
            <Film className="w-5 h-5" />
            <h3 className="font-semibold text-white text-base">720p 30fps Video Pipeline</h3>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            High-performance deterministic frame rendering written in Python. Streams raw BGR frames directly into FFmpeg via a memory-safe pipe. Supports videos up to 10 minutes with constant low RAM footprint (&lt; 50 MB total memory).
          </p>
          <div className="text-[11px] font-mono text-gray-400 bg-dark-950 p-3 rounded-xl border border-dark-700/60 space-y-1">
            <div>• Output Resolution: 1280 × 720 (720p HD)</div>
            <div>• Video Codec: H.264 (YUV420p) @ 30 FPS</div>
            <div>• Audio Codec: AAC Stereo (192 kbps)</div>
          </div>
        </div>
      </div>
    </div>
  );
};
