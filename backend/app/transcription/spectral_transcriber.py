import logging
import numpy as np
import soundfile as sf
import librosa
from typing import List
from app.transcription.base import BaseTranscriber, DetectedNote, TranscriptionResult
from app.midi.hand_assigner import HandAssigner

logger = logging.getLogger(__name__)

class SpectralTranscriber(BaseTranscriber):
    """
    Modular polyphonic pitch transcriber using Constant-Q Transform (CQT)
    and onset peak picking. Useful as a fast fallback or alternative engine.
    """
    def __init__(self, min_midi: int = 21, max_midi: int = 108):
        self.min_midi = min_midi
        self.max_midi = max_midi

    def transcribe(self, audio_path: str) -> TranscriptionResult:
        logger.info(f"Running Spectral CQT Transcription for: {audio_path}")
        y, sr = librosa.load(audio_path, sr=22050, mono=True)
        duration = float(librosa.get_duration(y=y, sr=sr))

        # Compute Constant-Q transform: 84 bins, 12 bins per octave starting from MIDI 21 (A0)
        n_bins = self.max_midi - self.min_midi + 1
        cqt = np.abs(librosa.cqt(y=y, sr=sr, fmin=librosa.note_to_hz('A0'), n_bins=n_bins, bins_per_octave=12))
        
        # Onset envelope
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        tempo, beats = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr)
        if isinstance(tempo, (list, np.ndarray)):
            estimated_tempo = float(tempo[0]) if len(tempo) > 0 else 120.0
        else:
            estimated_tempo = float(tempo)

        # Detect active notes per frame
        hop_length = 512
        frames_time = librosa.frames_to_time(np.arange(cqt.shape[1]), sr=sr, hop_length=hop_length)
        
        # Dynamic energy threshold
        threshold = np.percentile(cqt, 85)
        detected_notes: List[DetectedNote] = []

        for pitch_idx in range(n_bins):
            midi_pitch = self.min_midi + pitch_idx
            energy = cqt[pitch_idx, :]
            active = energy > threshold

            in_note = False
            start_t = 0.0
            max_amp = 0.0

            for f_idx, is_active in enumerate(active):
                t = frames_time[f_idx]
                if is_active and not in_note:
                    in_note = True
                    start_t = t
                    max_amp = energy[f_idx]
                elif is_active and in_note:
                    max_amp = max(max_amp, energy[f_idx])
                elif not is_active and in_note:
                    in_note = False
                    end_t = t
                    dur = end_t - start_t
                    if dur >= 0.06:
                        vel = int(np.clip(40 + (max_amp / (threshold * 3.0)) * 75, 40, 120))
                        detected_notes.append(
                            DetectedNote(
                                pitch=midi_pitch,
                                start_time=start_t,
                                end_time=end_t,
                                duration=dur,
                                velocity=vel,
                                confidence=0.85
                            )
                        )

        # Final note in progress
        if in_note and (duration - start_t >= 0.06):
            detected_notes.append(
                DetectedNote(
                    pitch=midi_pitch,
                    start_time=start_t,
                    end_time=duration,
                    duration=duration - start_t,
                    velocity=80,
                    confidence=0.85
                )
            )

        detected_notes.sort(key=lambda n: (n.start_time, n.pitch))
        detected_notes = HandAssigner.assign_hands(detected_notes)

        quality_report = HandAssigner.generate_quality_report(
            notes=detected_notes,
            duration=duration,
            estimated_tempo=estimated_tempo
        )
        quality_report["model"] = "Spectral Constant-Q Harmonic Detector (Modular Fallback)"
        quality_report["license"] = "Open-Source (BSD-3-Clause)"

        return TranscriptionResult(
            notes=detected_notes,
            tempo=estimated_tempo,
            duration=duration,
            quality_report=quality_report
        )
