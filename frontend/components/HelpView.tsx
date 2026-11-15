"use client";

import React, { useState } from "react";
import {
  HelpCircle,
  FileVideo,
  Cpu,
  Music,
  Sliders,
  Download,
  ChevronDown,
  ChevronUp,
  Layers,
  Sparkles,
  BookOpen,
} from "lucide-react";

interface FaqItem {
  q: string;
  a: string;
}

const FAQS: FaqItem[] = [
  {
    q: "What video formats and durations are supported?",
    a: "AI Piano Studio accepts MP4, MOV, MKV, and WEBM video containers up to 10 minutes (600 seconds) in duration and up to 500 MB in file size. Audio is automatically extracted to 44.1 kHz 16-bit PCM WAV.",
  },
  {
    q: "How does the AI transcription work?",
    a: "We utilize Spotify Basic Pitch, a cutting-edge polyphonic neural network trained on thousands of piano and musical instrument recordings. It models pitch trajectories, onset contours, and note activations across the full 88-key piano range (A0 to C8, MIDI 21–108).",
  },
  {
    q: "Why does the original uploaded video not appear in the final MP4?",
    a: "By design, AI Piano Studio transforms live musical performances into pristine, studio-quality piano animations. The uploaded video provides the acoustic source, while the final output is 100% synthetically generated with 3D falling notes and clean stereo piano audio.",
  },
  {
    q: "How does the Left / Right hand assignment heuristic work?",
    a: "The engine runs a two-pass clustering algorithm: notes in the lower register (below Middle C / C4) are classified as Left Hand (Bass accompaniment, Channel 1), while notes above are classified as Right Hand (Melody, Channel 0). Rapid chord clusters are grouped together to prevent unnatural voice-crossing.",
  },
  {
    q: "Can I manually fix or adjust detected notes?",
    a: "Yes! In the Piano Studio, switch to the 'MIDI Piano Roll' tab. You can select any note to change its pitch, start time, duration, velocity, or switch its hand assignment between Left and Right. Clicking 'Save & Resynthesize' instantly updates the audio and allows one-click re-rendering.",
  },
  {
    q: "What SoundFont is used for audio synthesis?",
    a: "We use FluidSynth 2.6.2 paired with the renowned Salamander Grand Piano C5 (Light) SoundFont, recorded from a Yamaha C5 concert grand piano with multi-velocity acoustic sample layers.",
  },
];

export const HelpView: React.FC = () => {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const toggleFaq = (idx: number) => {
    setOpenFaq(openFaq === idx ? null : idx);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-10 animate-fade-in pb-16">
      {/* Header */}
      <div className="space-y-3 pb-6 border-b border-dark-700/80">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-electric-500/10 border border-electric-500/20 text-electric-400 text-xs font-mono">
          <BookOpen className="w-3.5 h-3.5" />
          <span>Documentation & FAQ</span>
        </div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">
          AI Piano Studio Documentation
        </h1>
        <p className="text-sm text-gray-400 leading-relaxed max-w-2xl">
          Everything you need to know about uploading videos, AI transcription models, the 10-stage processing pipeline, and generating 3D falling-notes videos.
        </p>
      </div>

      {/* 10-Stage Pipeline Overview */}
      <div className="p-6 rounded-3xl bg-dark-900 border border-dark-700/80 space-y-4">
        <h2 className="text-lg font-bold text-white flex items-center space-x-2">
          <Layers className="w-5 h-5 text-electric-400" />
          <span>10-Stage Processing Pipeline</span>
        </h2>
        <p className="text-xs text-gray-400">
          Every video goes through our deterministic pipeline with real-time WebSocket/REST polling status:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          {[
            { step: "1", title: "Uploading Video", desc: "Streaming chunk upload with format validation" },
            { step: "2", title: "Inspecting Media", desc: "FFprobe inspection (duration <= 600s, stream verification)" },
            { step: "3", title: "Extracting Audio", desc: "FFmpeg 44.1 kHz stereo 16-bit PCM WAV extraction" },
            { step: "4", title: "Preparing Audio", desc: "Audio normalization, DC offset removal & resampling" },
            { step: "5", title: "AI Music Transcription", desc: "Spotify Basic Pitch polyphonic CNN inference" },
            { step: "6", title: "MIDI Generation", desc: "88-key quantization & intelligent hand separation" },
            { step: "7", title: "Piano Audio Synthesis", desc: "FluidSynth Yamaha C5 Grand Piano rendering" },
            { step: "8", title: "Piano Animation Rendering", desc: "3D falling-notes frame generation via OpenCV" },
            { step: "9", title: "MP4 Encoding", desc: "H.264/AAC video muxing with pipe stream" },
            { step: "10", title: "Final Output Validation", desc: "Duration & integrity check of final MP4" },
          ].map((st) => (
            <div key={st.step} className="p-3.5 rounded-xl bg-dark-800/60 border border-dark-700/60 flex items-start space-x-3">
              <div className="w-6 h-6 rounded-lg bg-electric-500/20 text-electric-400 font-mono text-xs font-bold flex items-center justify-center shrink-0">
                {st.step}
              </div>
              <div>
                <div className="text-xs font-semibold text-white">{st.title}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">{st.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Transcription Best Practices */}
      <div className="p-6 rounded-3xl bg-dark-900 border border-dark-700/80 space-y-4">
        <h2 className="text-lg font-bold text-white flex items-center space-x-2">
          <Sparkles className="w-5 h-5 text-violet-400" />
          <span>Tips for Optimal Transcription Accuracy</span>
        </h2>

        <div className="space-y-3 text-xs text-gray-300">
          <div className="p-3.5 rounded-xl bg-dark-800/50 border border-dark-700 flex items-start space-x-3">
            <span className="text-emerald-400 font-bold">✓</span>
            <div>
              <strong className="text-white">Clean Piano Recordings:</strong> Direct line-in audio or clean microphone recordings of piano/keyboard yield over 95% note precision.
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-dark-800/50 border border-dark-700 flex items-start space-x-3">
            <span className="text-emerald-400 font-bold">✓</span>
            <div>
              <strong className="text-white">Solo Instrument or Melody:</strong> Works wonderfully with solo piano, guitar, harp, synthesizer, or clean polyphonic instruments.
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-dark-800/50 border border-dark-700 flex items-start space-x-3">
            <span className="text-amber-400 font-bold">!</span>
            <div>
              <strong className="text-white">Heavy Drum Kits & Vocals:</strong> Complex pop mixes with heavy percussion and aggressive mastering can induce phantom notes. Use the built-in MIDI Editor to prune false triggers in seconds.
            </div>
          </div>
        </div>
      </div>

      {/* Frequently Asked Questions */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-white flex items-center space-x-2">
          <HelpCircle className="w-5 h-5 text-electric-400" />
          <span>Frequently Asked Questions</span>
        </h2>

        <div className="space-y-3">
          {FAQS.map((faq, idx) => (
            <div
              key={idx}
              className="rounded-2xl bg-dark-900 border border-dark-700/80 overflow-hidden transition-all"
            >
              <button
                onClick={() => toggleFaq(idx)}
                className="w-full p-4 text-left flex items-center justify-between text-xs sm:text-sm font-semibold text-white hover:text-electric-400 transition-colors"
              >
                <span>{faq.q}</span>
                {openFaq === idx ? (
                  <ChevronUp className="w-4 h-4 shrink-0 text-electric-400 ml-2" />
                ) : (
                  <ChevronDown className="w-4 h-4 shrink-0 text-gray-400 ml-2" />
                )}
              </button>
              {openFaq === idx && (
                <div className="px-4 pb-4 text-xs text-gray-300 leading-relaxed border-t border-dark-800 pt-3">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
