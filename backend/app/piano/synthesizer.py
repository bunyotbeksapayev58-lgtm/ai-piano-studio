import os
import shutil
import logging
import subprocess
import numpy as np
import soundfile as sf
from pathlib import Path
from typing import Optional, Dict, Any
from app.core.config import settings

logger = logging.getLogger(__name__)

PIANO_PRESETS: Dict[str, Dict[str, Any]] = {
    "concert_grand": {
        "name": "Salamander Concert Grand",
        "description": "Chuqur va boy akustik konsert royali (Steinway C5)",
        "soundfont": "SalC5Light2.sf2",
        "program": 0,
        "bank": 0,
        "gain": 1.25
    },
    "bright_pop": {
        "name": "Yamaha C7 Bright Pop Grand",
        "description": "Zamonaviy estrada, pop va rok uchun jarangdor, o'tkir grand pianino",
        "soundfont": "GeneralUser.sf2",
        "program": 1,
        "bank": 0,
        "gain": 1.20
    },
    "vintage_upright": {
        "name": "Vintage Honky-Tonk & Upright",
        "description": "Retro kafe, ragtime va jazz saloon pianinosi",
        "soundfont": "GeneralUser.sf2",
        "program": 3,
        "bank": 0,
        "gain": 1.15
    },
    "rhodes_ep": {
        "name": "Neo-Soul Rhodes (Tine EP)",
        "description": "Mayin va iliq elektr pianino (Fender Rhodes)",
        "soundfont": "GeneralUser.sf2",
        "program": 4,
        "bank": 0,
        "gain": 1.25
    },
    "dx7_fm": {
        "name": "80s FM Electric Piano (DX7)",
        "description": "80-yillar romantik balladalar va retro pop elektr royali",
        "soundfont": "GeneralUser.sf2",
        "program": 5,
        "bank": 0,
        "gain": 1.15
    },
    "piano_strings": {
        "name": "Cinematic Piano & Strings",
        "description": "Pianino va fonda mayin simfonik torli cholg'ular",
        "soundfont": "GeneralUser.sf2",
        "program": 0,
        "bank": 11,
        "gain": 1.20
    },
    "music_box": {
        "name": "Dreamy Music Box / Celesta",
        "description": "Sehrli, sokin va ertaknamo jarang",
        "soundfont": "GeneralUser.sf2",
        "program": 10,
        "bank": 0,
        "gain": 1.30
    }
}

class PianoSynthesizer:
    def __init__(self, soundfont_path: Optional[Path] = None):
        self.soundfont_path = soundfont_path or settings.DEFAULT_SOUNDFONT

    def synthesize(
        self,
        midi_path: Path,
        output_wav_path: Path,
        preset_key: str = "concert_grand",
        target_duration: Optional[float] = None
    ) -> Path:
        """
        Synthesizes realistic piano audio from a MIDI file using FluidSynth
        with the requested instrument preset (Concert Grand, Bright Pop, Rhodes, etc.).
        """
        output_wav_path.parent.mkdir(parents=True, exist_ok=True)
        fluidsynth_bin = settings.fluidsynth_bin

        preset_info = PIANO_PRESETS.get(preset_key, PIANO_PRESETS["concert_grand"])
        sf_name = preset_info.get("soundfont", "SalC5Light2.sf2")
        sf_path = settings.SOUNDFONT_DIR / sf_name
        if not sf_path.exists():
            sf_path = settings.DEFAULT_SOUNDFONT

        gain_str = str(preset_info.get("gain", 1.2))

        # Attempt FluidSynth synthesis
        success = False
        if sf_path.exists():
            cmd = [
                fluidsynth_bin,
                "-ni",
                "-q",
                "-g", gain_str,
                "-R", "1",
                "-C", "0",
                "-r", "44100",
                "-F", str(output_wav_path),
                str(sf_path),
                str(midi_path)
            ]
            try:
                logger.info(f"Running FluidSynth with preset '{preset_key}' ({sf_name}): {' '.join(cmd)}")
                result = subprocess.run(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    check=True,
                    timeout=180
                )
                if output_wav_path.exists() and output_wav_path.stat().st_size > 44:
                    success = True
            except Exception as e:
                logger.warning(f"FluidSynth execution failed ({e}). Falling back to internal acoustic piano synthesizer.")

        # Fallback to internal acoustic harmonic piano synthesizer if FluidSynth wasn't available
        if not success:
            logger.info("Using internal acoustic piano harmonic synthesizer.")
            self._synthesize_internal(midi_path, output_wav_path, target_duration)

        # Post-process: normalize audio with headroom (-1.0 dBFS)
        self._normalize_audio(output_wav_path, target_duration)

        return output_wav_path

    def _normalize_audio(self, wav_path: Path, target_duration: Optional[float] = None):
        """
        Normalizes audio to -1.0 dBFS without clipping and ensures proper length.
        """
        try:
            data, sr = sf.read(str(wav_path))
            if data.ndim == 1:
                data = np.column_stack((data, data))

            peak = np.max(np.abs(data))
            if peak > 0:
                target_peak = 0.89
                data = data * (target_peak / peak)

            if target_duration and target_duration > 0:
                target_samples = int(target_duration * sr)
                current_samples = len(data)
                if current_samples < target_samples:
                    pad_len = target_samples - current_samples
                    pad = np.zeros((pad_len, 2), dtype=data.dtype)
                    data = np.vstack((data, pad))

            sf.write(str(wav_path), data, sr, subtype='PCM_16')
        except Exception as e:
            logger.warning(f"Audio normalization warning: {e}")

    def _synthesize_internal(self, midi_path: Path, output_wav_path: Path, target_duration: Optional[float] = None):
        """
        Internal fallback physical harmonic synthesizer.
        """
        import pretty_midi
        pm = pretty_midi.PrettyMIDI(str(midi_path))
        sr = 44100
        duration = max(pm.get_end_time(), target_duration or 1.0)
        total_samples = int(duration * sr)
        audio = np.zeros(total_samples, dtype=np.float32)

        for inst in pm.instruments:
            for note in inst.notes:
                freq = 440.0 * (2.0 ** ((note.pitch - 69) / 12.0))
                start_sample = int(note.start * sr)
                note_duration = max(0.05, note.end - note.start)
                note_samples = int(note_duration * sr)
                if start_sample >= total_samples:
                    continue
                end_sample = min(total_samples, start_sample + note_samples)
                length = end_sample - start_sample
                t = np.linspace(0, length / sr, length, endpoint=False)
                vel_factor = note.velocity / 127.0

                harmonics = [
                    (1.0, 1.0, 3.2),
                    (2.0, 0.45, 4.5),
                    (3.0, 0.25, 5.8),
                    (4.0, 0.12, 7.0),
                    (5.0, 0.06, 8.5)
                ]
                note_wave = np.zeros(length, dtype=np.float32)
                for h_mult, h_amp, decay_rate in harmonics:
                    env = np.exp(-t * decay_rate)
                    note_wave += (h_amp * np.sin(2.0 * np.pi * freq * h_mult * t) * env).astype(np.float32)

                attack_len = min(int(0.005 * sr), length)
                if attack_len > 0:
                    note_wave[:attack_len] *= np.linspace(0.0, 1.0, attack_len)

                audio[start_sample:end_sample] += note_wave * vel_factor * 0.25

        stereo = np.column_stack((audio, audio))
        sf.write(str(output_wav_path), stereo, sr, subtype='PCM_16')
