import os
import logging
import numpy as np
import soundfile as sf
import librosa
from pathlib import Path
from typing import List, Tuple, Optional, Dict, Any
from app.transcription.base import BaseTranscriber, DetectedNote, TranscriptionResult
from app.transcription.song_arranger import SongArranger
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

    def transcribe(self, audio_path: str, song_mode: str = "universal_song") -> TranscriptionResult:
        """
        Transcribes any audio or music song using Spotify's Basic Pitch neural network
        combined with AI Song Arranger (HPSS percussion stripper + key scale detection)
        and specialized acoustic harmonic overtone filtering.
        """
        logger.info(f"Starting Universal Song Piano transcription for: {audio_path} [Mode: {song_mode}]")
        from basic_pitch.inference import predict
        from basic_pitch import ICASSP_2022_MODEL_PATH

        # Get audio duration
        try:
            info = sf.info(audio_path)
            duration = info.duration
        except Exception:
            duration = 0.0

        inference_audio_path = audio_path
        key_info: Optional[Dict[str, Any]] = None

        # If universal_song mode: apply HPSS to remove drums, 808s, and percussive transients
        if song_mode in ["universal_song", "easy_tutorial"]:
            harmonic_path = str(Path(audio_path).parent / f"hpss_harmonic_{Path(audio_path).stem}.wav")
            try:
                prep = SongArranger.preprocess_audio_for_universal_song(
                    input_wav_path=audio_path,
                    output_harmonic_wav_path=harmonic_path
                )
                inference_audio_path = prep["cleaned_wav"]
                key_info = prep
                logger.info(f"Using HPSS harmonic audio for inference. Detected Key: {prep['key']}")
            except Exception as e:
                logger.warning(f"HPSS separation failed ({e}), falling back to direct audio.")

        # Run Basic Pitch inference
        onset_th = self.onset_threshold if song_mode == "solo_piano" else 0.55
        frame_th = self.frame_threshold if song_mode == "solo_piano" else 0.32
        min_len = self.minimum_note_length_ms if song_mode == "solo_piano" else 85.0

        model_output, midi_data, note_events = predict(
            inference_audio_path,
            onset_threshold=onset_th,
            frame_threshold=frame_th,
            minimum_note_length=min_len,
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
        logger.info(f"Raw detected notes: {len(raw_notes)}")

        # 2. Acoustic Harmonic Overtone Suppression Filter
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
                            if n["end"] <= other["end"] + 0.35:
                                is_harmonic = True
                                break
            if not is_harmonic:
                filtered_notes.append(n)

        logger.info(f"Notes after acoustic harmonic filter: {len(filtered_notes)} (removed {len(raw_notes) - len(filtered_notes)} false harmonics)")

        # 3. Consecutive Split-Note De-stuttering (Note Merge)
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

        # 4. Universal Song Arranger (Melody/Lead prioritization & Human hand polyphony limiter)
        if song_mode in ["universal_song", "easy_tutorial"]:
            arranged_notes_dict = SongArranger.arrange_piano_cover(merged_notes, key_info, song_mode)
        else:
            arranged_notes_dict = merged_notes

        # 5. Construct final DetectedNote objects with expressive velocity curve
        detected_notes: List[DetectedNote] = []
        for n in arranged_notes_dict:
            amp = n["amplitude"]
            note_duration = max(0.08, n["end"] - n["start"])
            
            # Musical velocity dynamics curve (pianissimo 30 to fortissimo 127)
            norm_amp = min(1.0, max(0.0, (amp - 0.15) / 0.85))
            velocity = int(np.clip(30 + (norm_amp ** 1.12) * 97, 30, 127))
            
            # Boost lead melody slightly for singing articulation
            if n.get("is_lead_melody", False):
                velocity = min(127, velocity + 14)

            confidence = min(1.0, max(0.1, amp))

            d_note = DetectedNote(
                pitch=n["pitch"],
                start_time=round(n["start"], 3),
                end_time=round(n["end"], 3),
                duration=round(note_duration, 3),
                velocity=velocity,
                confidence=round(confidence, 3)
            )
            if "hand" in n:
                d_note.hand = n["hand"]
            detected_notes.append(d_note)

        # Sort notes by start_time
        detected_notes.sort(key=lambda n: (n.start_time, n.pitch))

        # 6. Estimate tempo via librosa beat tracking on audio
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

        # 7. Partition notes into Right Hand and Left Hand if not already assigned
        unassigned = any(n.hand is None for n in detected_notes)
        if unassigned:
            detected_notes = HandAssigner.assign_hands(detected_notes)

        # 8. Compute quality report
        quality_report = HandAssigner.generate_quality_report(
            notes=detected_notes,
            duration=duration,
            estimated_tempo=estimated_tempo
        )
        quality_report["model"] = "Spotify Basic Pitch + Universal Song Arranger"
        quality_report["song_mode"] = song_mode
        if key_info:
            quality_report["detected_key"] = key_info["key"]
        quality_report["filtered_harmonic_overtones"] = len(raw_notes) - len(filtered_notes)

        # Cleanup temporary HPSS wav
        if song_mode in ["universal_song", "easy_tutorial"] and inference_audio_path != audio_path:
            try:
                os.unlink(inference_audio_path)
            except Exception:
                pass

        return TranscriptionResult(
            notes=detected_notes,
            tempo=estimated_tempo,
            duration=duration,
            quality_report=quality_report
        )
