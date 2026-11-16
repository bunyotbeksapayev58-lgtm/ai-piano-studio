import json
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional
import pretty_midi
from app.transcription.base import DetectedNote, TranscriptionResult

class MidiGenerator:
    @staticmethod
    def create_midi(
        result: TranscriptionResult,
        output_path: Path,
        program: int = 0,
        bank: int = 0
    ) -> Path:
        """
        Generates a valid standard Type 1 MIDI file with two distinct tracks:
        1. Right Hand (Melody / Treble)
        2. Left Hand (Bass / Accompaniment)
        Configured with the specified MIDI program and soundfont bank.
        """
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        pm = pretty_midi.PrettyMIDI(initial_tempo=result.tempo)

        # Track 0: Right Hand
        right_instrument = pretty_midi.Instrument(
            program=program,
            is_drum=False,
            name="Right Hand - Melody"
        )
        if bank > 0:
            right_instrument.control_changes.append(pretty_midi.ControlChange(number=0, value=bank, time=0.0))
            right_instrument.control_changes.append(pretty_midi.ControlChange(number=32, value=0, time=0.0))

        # Track 1: Left Hand
        left_instrument = pretty_midi.Instrument(
            program=program,
            is_drum=False,
            name="Left Hand - Bass"
        )
        if bank > 0:
            left_instrument.control_changes.append(pretty_midi.ControlChange(number=0, value=bank, time=0.0))
            left_instrument.control_changes.append(pretty_midi.ControlChange(number=32, value=0, time=0.0))

        for note in result.notes:
            pm_note = pretty_midi.Note(
                velocity=int(note.velocity),
                pitch=int(note.pitch),
                start=float(note.start_time),
                end=float(note.end_time)
            )
            if note.hand == "left":
                left_instrument.notes.append(pm_note)
            else:
                right_instrument.notes.append(pm_note)

        # Sort notes in each instrument
        right_instrument.notes.sort(key=lambda n: n.start)
        left_instrument.notes.sort(key=lambda n: n.start)

        pm.instruments.append(right_instrument)
        pm.instruments.append(left_instrument)

        pm.write(str(output_path))
        return output_path

    @staticmethod
    def read_midi_notes(midi_path: Path) -> List[Dict[str, Any]]:
        """
        Reads notes from an existing MIDI file into a normalized dictionary list.
        """
        pm = pretty_midi.PrettyMIDI(str(midi_path))
        notes: List[Dict[str, Any]] = []

        for inst_idx, inst in enumerate(pm.instruments):
            hand = "left" if ("left" in inst.name.lower() or inst_idx == 1) else "right"
            for n in inst.notes:
                notes.append({
                    "pitch": n.pitch,
                    "start_time": round(n.start, 3),
                    "end_time": round(n.end, 3),
                    "duration": round(n.end - n.start, 3),
                    "velocity": n.velocity,
                    "hand": hand,
                    "channel": inst_idx
                })

        notes.sort(key=lambda n: (n["start_time"], n["pitch"]))
        return notes
