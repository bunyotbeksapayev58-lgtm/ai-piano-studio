"use client";

import React, { useState } from "react";
import {
  Sliders,
  Plus,
  Trash2,
  Save,
  RotateCcw,
  Film,
  Music,
  CheckCircle2,
  AlertCircle,
  Eye,
  Hand
} from "lucide-react";
import { NoteDto, api } from "@/services/api";

interface MidiEditorProps {
  projectId: string;
  notes: NoteDto[];
  durationSeconds: number;
  tempo: number;
  onNotesSaved: (updatedNotes: NoteDto[]) => void;
  onTriggerReRender: () => void;
  onBackTo3D?: () => void;
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function midiToName(m: number): string {
  const octave = Math.floor(m / 12) - 1;
  const name = NOTE_NAMES[m % 12];
  return `${name}${octave} (${m})`;
}

export const MidiEditor: React.FC<MidiEditorProps> = ({
  projectId,
  notes: initialNotes,
  durationSeconds,
  tempo: initialTempo,
  onNotesSaved,
  onTriggerReRender,
  onBackTo3D,
}) => {
  const [notes, setNotes] = useState<NoteDto[]>(initialNotes);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [tempo, setTempo] = useState<number>(initialTempo);
  const [activeHandFilter, setActiveHandFilter] = useState<"all" | "right" | "left">("all");
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [minOctave, setMinOctave] = useState<number>(2); // C2 (MIDI 36)
  const [maxOctave, setMaxOctave] = useState<number>(6); // C6 (MIDI 84)

  const selectedNote = selectedIdx !== null && selectedIdx < notes.length ? notes[selectedIdx] : null;
  const totalTime = Math.max(durationSeconds, 4.0);

  // Pitch boundaries for current view
  const minMidi = Math.max(21, minOctave * 12 + 12);
  const maxMidi = Math.min(108, maxOctave * 12 + 12);
  const totalPitches = maxMidi - minMidi + 1;

  const handleSelectNote = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIdx(idx);
    setSaveSuccess(false);
  };

  const handleUpdateSelected = (field: keyof NoteDto, val: any) => {
    if (selectedIdx === null) return;
    setNotes((prev) => {
      const updated = [...prev];
      const n = { ...updated[selectedIdx], [field]: val };
      if (field === "start_time" || field === "duration") {
        n.end_time = Number((n.start_time + n.duration).toFixed(3));
      }
      if (field === "hand") {
        n.channel = val === "left" ? 1 : 0;
      }
      updated[selectedIdx] = n;
      return updated;
    });
  };

  const handleDeleteSelected = () => {
    if (selectedIdx === null) return;
    setNotes((prev) => prev.filter((_, i) => i !== selectedIdx));
    setSelectedIdx(null);
  };

  const handleAddNote = () => {
    const newPitch = 60; // Middle C
    const newStart = Number((totalTime / 4).toFixed(2));
    const newDur = 0.5;
    const newNote: NoteDto = {
      pitch: newPitch,
      start_time: newStart,
      end_time: Number((newStart + newDur).toFixed(2)),
      duration: newDur,
      velocity: 85,
      hand: "right",
      channel: 0,
    };
    setNotes((prev) => [...prev, newNote]);
    setSelectedIdx(notes.length);
  };

  const handleReset = () => {
    if (confirm("Discard all unsaved edits and reset to originally detected notes?")) {
      setNotes(initialNotes);
      setSelectedIdx(null);
      setSaveSuccess(false);
    }
  };

  const handleSave = async (autoRerender: boolean = false) => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await api.updateMidi(projectId, notes, tempo, true, autoRerender);
      onNotesSaved(notes);
      setSaveSuccess(true);
      if (autoRerender) {
        onTriggerReRender();
      }
    } catch (err: any) {
      alert(err.message || "Failed to save MIDI modifications");
    } finally {
      setIsSaving(false);
    }
  };

  // Filter notes
  const displayedNotes = notes.filter((n) => {
    if (activeHandFilter === "right" && n.hand !== "right") return false;
    if (activeHandFilter === "left" && n.hand !== "left") return false;
    return true;
  });

  return (
    <div className="bg-dark-900 border border-dark-700/60 rounded-2xl overflow-hidden shadow-2xl space-y-4">
      {/* Top Toolbar */}
      <div className="p-4 sm:p-5 border-b border-dark-700/60 bg-dark-850/60 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-electric-500/10 text-electric-400 border border-electric-500/20">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">MIDI Note Editor & Piano Roll</h3>
            <p className="text-xs text-gray-400 font-mono">
              Inspect, move, resize, or delete notes. Changes are saved directly to the project MIDI & FluidSynth audio track.
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {onBackTo3D && (
            <button
              onClick={onBackTo3D}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-dark-800 hover:bg-dark-700 text-electric-400 border border-electric-500/30 transition-all mr-1"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Return to 3D Studio</span>
            </button>
          )}

          <button
            onClick={handleAddNote}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-dark-800 hover:bg-dark-700 text-gray-200 border border-dark-700 transition-all"
          >
            <Plus className="w-3.5 h-3.5 text-electric-400" />
            <span>Add Note</span>
          </button>

          <button
            onClick={handleReset}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-dark-800 hover:bg-dark-700 text-gray-400 hover:text-white border border-dark-700 transition-all"
            title="Reset to initial transcription"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>

          <button
            onClick={() => handleSave(false)}
            disabled={isSaving}
            className="flex items-center space-x-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold bg-electric-600 hover:bg-electric-500 text-white shadow-md shadow-electric-600/30 transition-all"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? "Saving..." : "Save & Resynthesize Audio"}</span>
          </button>

          <button
            onClick={() => handleSave(true)}
            disabled={isSaving}
            className="flex items-center space-x-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-electric-500 to-violet-600 hover:from-electric-400 hover:to-violet-500 text-white shadow-md shadow-violet-600/30 transition-all"
          >
            <Film className="w-3.5 h-3.5" />
            <span>Save & Re-render Video</span>
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div className="mx-6 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-mono flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>MIDI notes saved and audio resynthesized successfully!</span>
        </div>
      )}

      {/* Editor Main Content: Piano Roll Canvas + Inspector Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 p-4 sm:p-6">
        {/* Left Column: Visual Piano Roll (3 spans) */}
        <div className="lg:col-span-3 space-y-3">
          {/* Controls: Filter & Octave view */}
          <div className="flex flex-wrap items-center justify-between text-xs text-gray-400 gap-2">
            <div className="flex items-center space-x-2">
              <span className="font-mono">Track Filter:</span>
              <div className="bg-dark-800 p-0.5 rounded-lg border border-dark-700 flex text-[11px]">
                <button
                  onClick={() => setActiveHandFilter("all")}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    activeHandFilter === "all" ? "bg-dark-700 text-white font-medium" : "text-gray-400"
                  }`}
                >
                  All ({notes.length})
                </button>
                <button
                  onClick={() => setActiveHandFilter("right")}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    activeHandFilter === "right" ? "bg-electric-600 text-white font-medium" : "text-gray-400"
                  }`}
                >
                  Right Hand (Melody)
                </button>
                <button
                  onClick={() => setActiveHandFilter("left")}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    activeHandFilter === "left" ? "bg-violet-600 text-white font-medium" : "text-gray-400"
                  }`}
                >
                  Left Hand (Bass)
                </button>
              </div>
            </div>

            {/* Octave Range View */}
            <div className="flex items-center space-x-2 font-mono text-[11px]">
              <span>Range:</span>
              <button
                onClick={() => {
                  setMinOctave(1);
                  setMaxOctave(7);
                }}
                className="px-2 py-0.5 rounded bg-dark-800 hover:bg-dark-700 text-gray-300"
              >
                Full Piano (A0-C8)
              </button>
              <button
                onClick={() => {
                  setMinOctave(2);
                  setMaxOctave(6);
                }}
                className="px-2 py-0.5 rounded bg-dark-800 hover:bg-dark-700 text-gray-300"
              >
                Mid Register (C2-C6)
              </button>
            </div>
          </div>

          {/* Piano Roll Grid Container */}
          <div className="relative w-full h-[360px] bg-dark-950 border border-dark-700/80 rounded-xl overflow-x-auto overflow-y-hidden select-none">
            {/* Horizontal pitch guides */}
            <div className="absolute inset-0 pointer-events-none flex flex-col justify-between opacity-15">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="w-full border-b border-gray-600 h-full" />
              ))}
            </div>

            {/* Vertical second time markers */}
            <div className="absolute inset-0 pointer-events-none flex justify-between opacity-20">
              {Array.from({ length: Math.ceil(totalTime) + 1 }).map((_, i) => (
                <div key={i} className="h-full border-r border-gray-500 relative">
                  <span className="absolute top-1 left-1 text-[9px] font-mono text-gray-400">{i}s</span>
                </div>
              ))}
            </div>

            {/* Note Rectangles */}
            <div className="absolute inset-0 p-2">
              {displayedNotes.map((note, idx) => {
                const isSelected = selectedIdx === idx;
                const leftPct = (note.start_time / totalTime) * 100;
                const widthPct = Math.max(1.5, (note.duration / totalTime) * 100);

                // Y position: higher pitch = closer to top (0%)
                const pitchNorm = (maxMidi - note.pitch) / totalPitches;
                const topPct = Math.min(92, Math.max(4, pitchNorm * 100));

                const isRight = note.hand === "right";

                return (
                  <div
                    key={idx}
                    onClick={(e) => handleSelectNote(idx, e)}
                    className={`absolute h-5 rounded cursor-pointer transition-all border flex items-center px-1 text-[10px] font-mono truncate shadow-md ${
                      isSelected
                        ? "ring-2 ring-white z-30 scale-105"
                        : "z-10 hover:brightness-125"
                    } ${
                      isRight
                        ? "bg-electric-500/90 border-electric-300 text-white shadow-electric-500/20"
                        : "bg-violet-600/90 border-violet-300 text-white shadow-violet-600/20"
                    }`}
                    style={{
                      left: `${leftPct}%`,
                      top: `${topPct}%`,
                      width: `${widthPct}%`,
                    }}
                    title={`${midiToName(note.pitch)} | Start: ${note.start_time}s | Dur: ${note.duration}s`}
                  >
                    {note.duration >= 0.3 && midiToName(note.pitch).split(" ")[0]}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Note Inspector Sidebar */}
        <div className="bg-dark-950/80 border border-dark-700/80 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-dark-700/60 pb-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-300 font-mono">
              Note Inspector
            </h4>
            {selectedNote && (
              <button
                onClick={handleDeleteSelected}
                className="text-red-400 hover:text-red-300 text-xs flex items-center space-x-1"
                title="Delete note"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            )}
          </div>

          {selectedNote ? (
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-400 mb-1 font-mono">Pitch</label>
                <select
                  value={selectedNote.pitch}
                  onChange={(e) => handleUpdateSelected("pitch", parseInt(e.target.value))}
                  className="w-full bg-dark-800 border border-dark-700 rounded-lg p-2 text-white font-mono text-xs focus:border-electric-500 focus:outline-none"
                >
                  {Array.from({ length: 88 }).map((_, i) => {
                    const m = 21 + i;
                    return (
                      <option key={m} value={m}>
                        {midiToName(m)}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-gray-400 mb-1 font-mono">Start (sec)</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max={totalTime}
                    value={selectedNote.start_time}
                    onChange={(e) => handleUpdateSelected("start_time", parseFloat(e.target.value) || 0)}
                    className="w-full bg-dark-800 border border-dark-700 rounded-lg p-2 text-white font-mono text-xs focus:border-electric-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 mb-1 font-mono">Duration (sec)</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0.05"
                    max="10"
                    value={selectedNote.duration}
                    onChange={(e) => handleUpdateSelected("duration", parseFloat(e.target.value) || 0.1)}
                    className="w-full bg-dark-800 border border-dark-700 rounded-lg p-2 text-white font-mono text-xs focus:border-electric-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-gray-400 mb-1 font-mono">
                  <span>Velocity</span>
                  <span>{selectedNote.velocity}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="127"
                  value={selectedNote.velocity}
                  onChange={(e) => handleUpdateSelected("velocity", parseInt(e.target.value))}
                  className="w-full h-1.5 bg-dark-700 rounded-lg appearance-none cursor-pointer accent-electric-500"
                />
              </div>

              <div>
                <label className="block text-gray-400 mb-1 font-mono">Hand Track</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleUpdateSelected("hand", "right")}
                    className={`p-2 rounded-lg text-center font-medium transition-all ${
                      selectedNote.hand === "right"
                        ? "bg-electric-600 text-white font-semibold"
                        : "bg-dark-800 text-gray-400 hover:text-white"
                    }`}
                  >
                    Right (Melody)
                  </button>
                  <button
                    onClick={() => handleUpdateSelected("hand", "left")}
                    className={`p-2 rounded-lg text-center font-medium transition-all ${
                      selectedNote.hand === "left"
                        ? "bg-violet-600 text-white font-semibold"
                        : "bg-dark-800 text-gray-400 hover:text-white"
                    }`}
                  >
                    Left (Bass)
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500 text-xs space-y-2">
              <Eye className="w-6 h-6 mx-auto opacity-40" />
              <p>Click any note bar on the piano roll to inspect and edit its pitch, timing, and hand assignment.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
