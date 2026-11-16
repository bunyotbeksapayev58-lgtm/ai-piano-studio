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
    Enables transcription of ANY general song (Pop, Hip-hop, Rap, Rock, EDM, Ballad, Vocal tracks)
    into a clean, playable acoustic piano arrangement.
    
    1. Harmonic-Percussive Source Separation (HPSS) to strip drums, 808 kicks, hi-hats, and percussive noise.
    2. Musical key detection via Krumhansl-Schmuckler tonality profiles.
    3. Vocal/Lead melody extraction & prioritization (singing melody -> Right Hand).
    4. Harmonic bass & chord accompaniment (-> Left Hand).
    5. Human playability limiter (max 4-5 notes per hand, pruning dissonant micro-clusters).
    """

    # Major and minor pitch profile templates (Krumhansl-Kessler)
    MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
    MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
    PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

    @staticmethod
    def preprocess_audio_for_universal_song(
        input_wav_path: str,
        output_harmonic_wav_path: str,
        sr: int = 22050
    ) -> Dict[str, Any]:
        """
        Applies aggressive Harmonic-Percussive Source Separation (HPSS) and bandpass filtering
        to strip away drums, percussion, cymbals, and transient noise while preserving melodic vocals,
        chords, and sustained instruments.
        """
        logger.info(f"Applying Universal Song Arranger HPSS pre-processing on: {input_wav_path}")
        
        # Load audio (mono, 22.05 kHz)
        y, orig_sr = librosa.load(input_wav_path, sr=sr, mono=True)
        if len(y) == 0:
            raise ValueError("Input audio is empty.")

        # 1. Bandpass filter: 30 Hz (sub-rumble cutoff) to 4200 Hz (Piano C8 top harmonic)
        sos = butter(4, [30.0 / (sr / 2.0), min(0.95, 4200.0 / (sr / 2.0))], btype='bandpass', output='sos')
        y_filtered = sosfilt(sos, y)

        # 2. Harmonic-Percussive Source Separation (HPSS)
        # Margin (1.0, 4.5): high percussive margin aggressively pushes drums/beats to percussive stream,
        # leaving clean melodic tones in y_harmonic!
        y_harmonic, y_percussive = librosa.effects.hpss(y_filtered, margin=(1.0, 4.5))

        # 3. Detect Musical Key
        key_info = SongArranger.detect_key(y_harmonic, sr)

        # Save clean harmonic audio for Basic Pitch neural transcription
        sf.write(output_harmonic_wav_path, y_harmonic, sr, subtype='PCM_16')
        logger.info(f"Harmonic audio prepared: {output_harmonic_wav_path} (Detected Key: {key_info['key']})")

        return {
            "key": key_info["key"],
            "scale_pitches": key_info["scale_pitches"],
            "is_minor": key_info["is_minor"],
            "cleaned_wav": output_harmonic_wav_path
        }

    @classmethod
    def detect_key(cls, y: np.ndarray, sr: int) -> Dict[str, Any]:
        """
        Estimates the musical key (e.g. 'A Minor', 'C Major') using Chroma CQT and Krumhansl-Schmuckler profiles.
        """
        try:
            # Chroma representation
            chroma = librosa.feature.chroma_cqt(y=y, sr=sr, n_chroma=12)
            chroma_mean = np.mean(chroma, axis=1)

            # Normalize
            if np.sum(chroma_mean) > 0:
                chroma_mean = chroma_mean / np.sum(chroma_mean)

            best_corr = -1.0
            best_key = "C Major"
            best_root = 0
            is_minor = False

            # Test 12 major keys
            for root in range(12):
                rotated_profile = np.roll(cls.MAJOR_PROFILE, root)
                rotated_profile /= np.sum(rotated_profile)
                corr = np.corrcoef(chroma_mean, rotated_profile)[0, 1]
                if corr > best_corr:
                    best_corr = corr
                    best_key = f"{cls.PITCH_NAMES[root]} Major"
                    best_root = root
                    is_minor = False

            # Test 12 minor keys
            for root in range(12):
                rotated_profile = np.roll(cls.MINOR_PROFILE, root)
                rotated_profile /= np.sum(rotated_profile)
                corr = np.corrcoef(chroma_mean, rotated_profile)[0, 1]
                if corr > best_corr:
                    best_corr = corr
                    best_key = f"{cls.PITCH_NAMES[root]} Minor"
                    best_root = root
                    is_minor = True

            # Scale pitches in semitone offsets
            if is_minor:
                scale_intervals = [0, 2, 3, 5, 7, 8, 10]  # Natural minor
            else:
                scale_intervals = [0, 2, 4, 5, 7, 9, 11]  # Major scale

            scale_pitches = {(best_root + interval) % 12 for interval in scale_intervals}

            return {
                "key": best_key,
                "root_name": cls.PITCH_NAMES[best_root],
                "is_minor": is_minor,
                "scale_pitches": list(scale_pitches)
            }
        except Exception as e:
            logger.warning(f"Key detection error ({e}), defaulting to C Major.")
            return {
                "key": "C Major",
                "root_name": "C",
                "is_minor": False,
                "scale_pitches": [0, 2, 4, 5, 7, 9, 11]
            }

    @staticmethod
    def arrange_piano_cover(
        raw_notes: List[Dict[str, Any]],
        key_info: Optional[Dict[str, Any]] = None,
        song_mode: str = "universal_song"
    ) -> List[Dict[str, Any]]:
        """
        Arranges polyphonic notes into an expressive, playable piano performance:
        - Lead vocal melody given higher dynamic velocity and assigned to Right Hand.
        - Bass/chords assigned to Left Hand.
        - Prunes clashing transient dissonances and limits maximum simultaneous notes per hand.
        """
        if not raw_notes:
            return []

        # 1. Scale Snapping / Out-of-key Accidental Softening (if in universal_song or easy mode)
        scale_pitches = set(key_info["scale_pitches"]) if (key_info and "scale_pitches" in key_info) else None
        
        cleaned_notes = []
        for n in raw_notes:
            pitch = n["pitch"]
            amp = n["amplitude"]
            
            # If scale is detected and note is out of scale with low confidence, drop it
            if scale_pitches is not None and (pitch % 12) not in scale_pitches:
                if amp < 0.40:
                    continue  # Filter stray accidental micro-noise
            
            cleaned_notes.append(n)

        # 2. Sort chronologically
        cleaned_notes.sort(key=lambda n: (n["start"], n["pitch"]))

        # 3. Time-slice clustering to identify Lead Melody vs Accompaniment
        # In a time window (e.g. 50ms), the highest pitch above Middle C (60) is typically the melody!
        arranged_notes = []
        
        # Group notes by simultaneous onset (within 50ms)
        slices: List[List[Dict[str, Any]]] = []
        current_slice: List[Dict[str, Any]] = []
        slice_start = -1.0

        for n in cleaned_notes:
            if slice_start < 0 or (n["start"] - slice_start) > 0.050:
                if current_slice:
                    slices.append(current_slice)
                current_slice = [n]
                slice_start = n["start"]
            else:
                current_slice.append(n)
        if current_slice:
            slices.append(current_slice)

        for s in slices:
            # Sort slice by pitch ascending
            s.sort(key=lambda x: x["pitch"])
            
            # Human hand polyphony limiter:
            # Left Hand (pitch < 60): max 3 simultaneous notes
            # Right Hand (pitch >= 60): max 4 simultaneous notes
            left_candidates = [n for n in s if n["pitch"] < 60]
            right_candidates = [n for n in s if n["pitch"] >= 60]

            # If bass has too many dense notes, keep the lowest (bass root) and most resonant
            if len(left_candidates) > 3:
                # Keep lowest note (fundamental bass) and the top 2
                left_candidates = [left_candidates[0]] + left_candidates[-2:]

            # If right hand has too many notes, keep highest (lead melody) and 2 harmony notes
            if len(right_candidates) > 4:
                right_candidates = right_candidates[:2] + right_candidates[-2:]

            # Assign hands & velocity boost
            # Right hand highest note is the LEAD MELODY: boost velocity so it sings out!
            for i, n in enumerate(right_candidates):
                is_highest = (i == len(right_candidates) - 1)
                note_copy = dict(n)
                note_copy["hand"] = "right"
                if is_highest:
                    # Lead melody emphasis
                    note_copy["is_lead_melody"] = True
                    note_copy["amplitude"] = min(1.0, note_copy["amplitude"] * 1.25)
                else:
                    note_copy["is_lead_melody"] = False
                arranged_notes.append(note_copy)

            for i, n in enumerate(left_candidates):
                note_copy = dict(n)
                note_copy["hand"] = "left"
                note_copy["is_lead_melody"] = False
                arranged_notes.append(note_copy)

        # Sort chronologically
        arranged_notes.sort(key=lambda n: (n["start"], n["pitch"]))
        logger.info(f"SongArranger finished: arranged {len(arranged_notes)} playable piano notes.")
        return arranged_notes
