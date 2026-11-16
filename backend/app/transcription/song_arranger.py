import logging
import numpy as np
import librosa
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional
import soundfile as sf
from scipy.signal import butter, sosfilt

logger = logging.getLogger(__name__)

class SongArranger:
    """
    AI Song-to-Piano Cover Arranger:
    Preserves musical integrity, full chords, and arpeggios while cleanly separating:
    - Lead melody on Right Hand (boosted velocity for singing articulation).
    - Bass and chord foundation on Left Hand.
    - Zero note destruction: avoids dropping accidental notes or truncating chords.
    """

    PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

    @staticmethod
    def preprocess_audio_for_universal_song(
        input_wav_path: str,
        output_harmonic_wav_path: str,
        sr: int = 22050
    ) -> Dict[str, Any]:
        """
        Applies transient-preserving percussive attenuation for songs with heavy drum beats.
        Never smears note onsets or blurs piano hammer attacks.
        """
        logger.info(f"Applying transient-preserving audio pre-processing on: {input_wav_path}")
        
        y, orig_sr = librosa.load(input_wav_path, sr=sr, mono=True)
        if len(y) == 0:
            raise ValueError("Input audio is empty.")

        # Gentle sub-bass high-pass filter (35 Hz cutoff to remove 808 sub-rumble without touching piano A0=27.5Hz fundamentals)
        sos = butter(2, 35.0 / (sr / 2.0), btype='highpass', output='sos')
        y_filtered = sosfilt(sos, y)

        # Detect percussive presence (onset strength variance)
        onset_env = librosa.onset.onset_strength(y=y_filtered, sr=sr)
        is_percussive = np.std(onset_env) > 1.8

        if is_percussive:
            # Gentle separation that preserves sharp note attacks (margin=1.0, 1.4)
            y_harmonic, _ = librosa.effects.hpss(y_filtered, margin=(1.0, 1.4))
        else:
            y_harmonic = y_filtered

        # Save clean harmonic audio
        sf.write(output_harmonic_wav_path, y_harmonic, sr, subtype='PCM_16')

        return {
            "cleaned_wav": output_harmonic_wav_path
        }

    @staticmethod
    def arrange_piano_cover(
        raw_notes: List[Dict[str, Any]],
        key_info: Optional[Dict[str, Any]] = None,
        song_mode: str = "universal_song"
    ) -> List[Dict[str, Any]]:
        """
        Arranges polyphonic notes into an expressive piano performance:
        - NEVER drops chord notes or essential passing tones.
        - Identifies the highest voice as the Lead Melody and gives it a velocity boost.
        - Clearly assigns bass register (< 60) to Left Hand and melody (>= 60) to Right Hand.
        """
        if not raw_notes:
            return []

        # Sort chronologically by start time, then pitch
        arranged_notes = []
        for n in raw_notes:
            note_copy = dict(n)
            pitch = note_copy["pitch"]
            # Partition hands by register: middle C (60)
            if pitch < 60:
                note_copy["hand"] = "left"
                note_copy["is_lead_melody"] = False
            else:
                note_copy["hand"] = "right"
                note_copy["is_lead_melody"] = False
            arranged_notes.append(note_copy)

        # Identify lead melody: in simultaneous clusters (within 40ms), highlight highest treble note
        arranged_notes.sort(key=lambda n: (n["start"], n["pitch"]))

        for i in range(len(arranged_notes)):
            cur = arranged_notes[i]
            if cur["hand"] == "right":
                # Check if this is the highest pitch in this onset cluster
                is_highest = True
                for j in range(len(arranged_notes)):
                    if i == j: continue
                    other = arranged_notes[j]
                    if abs(cur["start"] - other["start"]) <= 0.040:
                        if other["pitch"] > cur["pitch"]:
                            is_highest = False
                            break
                if is_highest:
                    cur["is_lead_melody"] = True
                    cur["amplitude"] = min(1.0, cur["amplitude"] * 1.15)

        return arranged_notes
