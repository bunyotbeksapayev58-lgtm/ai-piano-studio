import os
import logging
import numpy as np
import soundfile as sf
import librosa
from pathlib import Path
from typing import List, Tuple
from app.transcription.base import BaseTranscriber, DetectedNote, TranscriptionResult
from app.midi.hand_assigner import HandAssigner

logger = logging.getLogger(__name__)

class BasicPitchTranscriber(BaseTranscriber):
    def __init__(
        self,
        onset_threshold: float = 0.60,
        frame_threshold: float = 0.35,
        minimum_note_length_ms: float = 95.0,
        min_midi: int = 21,   # A0
        max_midi: int = 108   # C8
    ):
        self.onset_threshold = onset_threshold
        self.frame_threshold = frame_threshold
        self.minimum_note_length_ms = minimum_note_length_ms
        self.min_midi = min_midi
        self.max_midi = max_midi

    def transcribe(self, audio_path: str) -> TranscriptionResult:
        """
        Transcribes piano audio using Spotify's Basic Pitch neural network model
        with specialized acoustic piano overtone filtering and split-note de-stuttering.
        """
        logger.info(f"Starting High-Precision Piano transcription for: {audio_path}")
        from basic_pitch.inference import predict
        from basic_pitch import ICASSP_2022_MODEL_PATH

        # Get audio duration
        try:
            info = sf.info(audio_path)
            duration = info.duration
        except Exception:
            duration = 0.0

        # Run Basic Pitch inference with piano-optimized thresholds
        model_output, midi_data, note_events = predict(
            audio_path,
            onset_threshold=self.onset_threshold,
            frame_threshold=self.frame_threshold,
            minimum_note_length=self.minimum_note_length_ms,
            minimum_frequency=27.5,    # Piano A0
            maximum_frequency=4186.0   # Piano C8
        )

        # 1. Parse and filter raw note events
        raw_notes: List[dict] = []
        for event in note_events:
            start_time = float(event[0])
            end_time = float(event[1])
            pitch = int(round(float(event[2])))
            amplitude = float(event[3])

            # Filter to standard 88-key piano range (A0=21 to C8=108)
            if pitch < self.min_midi or pitch > self.max_midi:
                continue

            raw_notes.append({
                "start": start_time,
                "end": max(start_time + 0.08, end_time),
                "pitch": pitch,
                "amplitude": amplitude
            })

        # Sort chronologically by start_time, then pitch
        raw_notes.sort(key=lambda n: (n["start"], n["pitch"]))
        logger.info(f"Raw detected piano notes: {len(raw_notes)}")

        # 2. Acoustic Harmonic Overtone Suppression Filter
        # Eliminates false octave (+12, +24) and octave-fifth (+19) harmonics caused by piano string resonance
        filtered_notes: List[dict] = []
        for i, n in enumerate(raw_notes):
            is_harmonic = False
            for j, other in enumerate(raw_notes):
                if i == j:
                    continue
                # Simultaneous onset within 45 ms
                if abs(n["start"] - other["start"]) <= 0.045:
                    interval = n["pitch"] - other["pitch"]
                    # If pitch is an acoustic harmonic overtone (+12 octave, +19 twelfth, +24 double octave)
                    if interval in (12, 19, 24):
                        # If overtone amplitude is lower or comparable to the fundamental
                        if n["amplitude"] <= other["amplitude"] * 1.15:
                            # And overtone doesn't substantially outlast the fundamental
                            if n["end"] <= other["end"] + 0.35:
                                is_harmonic = True
                                break
            if not is_harmonic:
                filtered_notes.append(n)

        logger.info(f"Notes after acoustic harmonic filter: {len(filtered_notes)} (removed {len(raw_notes) - len(filtered_notes)} false harmonics)")

        # 3. Consecutive Split-Note De-stuttering (Note Merge)
        # Merges rapid broken re-strikes of the identical key (gap < 65 ms) into smooth, held notes
        merged_notes: List[dict] = []
        for n in filtered_notes:
            if (
                merged_notes
                and merged_notes[-1]["pitch"] == n["pitch"]
                and 0.0 <= (n["start"] - merged_notes[-1]["end"]) < 0.065
            ):
                merged_notes[-1]["end"] = max(merged_notes[-1]["end"], n["end"])
                merged_notes[-1]["amplitude"] = max(merged_notes[-1]["amplitude"], n["amplitude"])
            else:
                merged_notes.append(n)

        logger.info(f"Notes after de-stutter merge: {len(merged_notes)}")

        # 4. Construct final DetectedNote objects with expressive velocity curve
        detected_notes: List[DetectedNote] = []
        for n in merged_notes:
            amp = n["amplitude"]
            note_duration = max(0.08, n["end"] - n["start"])
            
            # Musical velocity dynamics curve (pianissimo 28 to fortissimo 127)
            norm_amp = min(1.0, max(0.0, (amp - 0.18) / 0.82))
            velocity = int(np.clip(28 + (norm_amp ** 1.15) * 99, 28, 127))
            confidence = min(1.0, max(0.1, amp))

            detected_notes.append(
                DetectedNote(
                    pitch=n["pitch"],
                    start_time=round(n["start"], 3),
                    end_time=round(n["end"], 3),
                    duration=round(note_duration, 3),
                    velocity=velocity,
                    confidence=round(confidence, 3)
                )
            )

        # Sort notes by start_time
        detected_notes.sort(key=lambda n: (n.start_time, n.pitch))

        # 5. Estimate tempo via librosa beat tracking on audio
        estimated_tempo = 120.0
        try:
            y, sr = librosa.load(audio_path, sr=22050, mono=True)
            if len(y) > sr:
                tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
                if isinstance(tempo, (list, np.ndarray)):
                    tempo_val = float(tempo[0]) if len(tempo) > 0 else 120.0
                else:
                    tempo_val = float(tempo)
                if 40 <= tempo_val <= 240:
                    estimated_tempo = round(tempo_val, 1)
        except Exception as e:
            logger.warning(f"Could not estimate tempo from audio: {e}")

        # 6. Partition notes into Right Hand and Left Hand
        detected_notes = HandAssigner.assign_hands(detected_notes)

        # 7. Compute quality report
        quality_report = HandAssigner.generate_quality_report(
            notes=detected_notes,
            duration=duration,
            estimated_tempo=estimated_tempo
        )
        quality_report["model"] = "Spotify Basic Pitch + Acoustic Harmonic De-resonator"
        quality_report["license"] = "Apache-2.0"
        quality_report["filtered_harmonic_overtones"] = len(raw_notes) - len(filtered_notes)

        return TranscriptionResult(
            notes=detected_notes,
            tempo=estimated_tempo,
            duration=duration,
            quality_report=quality_report
        )
