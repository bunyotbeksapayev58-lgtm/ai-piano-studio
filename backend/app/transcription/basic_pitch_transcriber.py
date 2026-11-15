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
        onset_threshold: float = 0.5,
        frame_threshold: float = 0.3,
        minimum_note_length_ms: float = 58.0,
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
        Transcribes audio using Spotify's Basic Pitch neural network model.
        """
        logger.info(f"Starting Basic Pitch transcription for: {audio_path}")
        from basic_pitch.inference import predict
        from basic_pitch import ICASSP_2022_MODEL_PATH

        # Get audio duration
        try:
            info = sf.info(audio_path)
            duration = info.duration
        except Exception:
            duration = 0.0

        # Run Basic Pitch inference
        # predict returns: (model_output, midi_data, note_events)
        model_output, midi_data, note_events = predict(
            audio_path,
            onset_threshold=self.onset_threshold,
            frame_threshold=self.frame_threshold,
            minimum_note_length=self.minimum_note_length_ms,
            minimum_frequency=27.5,    # Piano A0
            maximum_frequency=4186.0   # Piano C8
        )

        detected_notes: List[DetectedNote] = []

        # Parse note events: (start_time, end_time, pitch, amplitude, pitch_bends)
        for event in note_events:
            start_time = float(event[0])
            end_time = float(event[1])
            pitch = int(round(float(event[2])))
            amplitude = float(event[3])

            # Filter to standard 88-key piano range (A0=21 to C8=108)
            if pitch < self.min_midi or pitch > self.max_midi:
                continue

            note_duration = max(0.05, end_time - start_time)
            # Map amplitude (0.0 - 1.0) to standard MIDI velocity (30 - 127)
            velocity = int(np.clip(30 + amplitude * 97, 30, 127))
            confidence = min(1.0, max(0.1, amplitude))

            detected_notes.append(
                DetectedNote(
                    pitch=pitch,
                    start_time=start_time,
                    end_time=end_time,
                    duration=note_duration,
                    velocity=velocity,
                    confidence=confidence
                )
            )

        # Sort notes by start_time
        detected_notes.sort(key=lambda n: (n.start_time, n.pitch))

        # Estimate tempo
        estimated_tempo = 120.0
        try:
            # Estimate tempo via librosa beat tracking on audio
            y, sr = librosa.load(audio_path, sr=22050, mono=True)
            if len(y) > sr:
                tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
                # Handle scalar or array tempo
                if isinstance(tempo, (list, np.ndarray)):
                    tempo_val = float(tempo[0]) if len(tempo) > 0 else 120.0
                else:
                    tempo_val = float(tempo)
                if 40 <= tempo_val <= 240:
                    estimated_tempo = tempo_val
        except Exception as e:
            logger.warning(f"Could not estimate tempo from audio: {e}")

        # Partition notes into Right Hand and Left Hand
        detected_notes = HandAssigner.assign_hands(detected_notes)

        # Compute quality report
        quality_report = HandAssigner.generate_quality_report(
            notes=detected_notes,
            duration=duration,
            estimated_tempo=estimated_tempo
        )
        quality_report["model"] = "Spotify Basic Pitch (ICASSP 2022 Polyphonic Architecture)"
        quality_report["license"] = "Apache-2.0"

        return TranscriptionResult(
            notes=detected_notes,
            tempo=estimated_tempo,
            duration=duration,
            quality_report=quality_report
        )
