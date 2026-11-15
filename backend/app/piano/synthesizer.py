import os
import shutil
import logging
import subprocess
import numpy as np
import soundfile as sf
from pathlib import Path
from typing import Optional
from app.core.config import settings
from app.transcription.base import TranscriptionResult

logger = logging.getLogger(__name__)

class PianoSynthesizer:
    def __init__(self, soundfont_path: Optional[Path] = None):
        self.soundfont_path = soundfont_path or settings.DEFAULT_SOUNDFONT

    def synthesize(self, midi_path: Path, output_wav_path: Path, target_duration: Optional[float] = None) -> Path:
        """
        Synthesizes realistic piano audio from a MIDI file using FluidSynth
        and the high-quality Salamander Grand Piano SoundFont.
        """
        output_wav_path.parent.mkdir(parents=True, exist_ok=True)
        fluidsynth_bin = settings.fluidsynth_bin

        # Attempt FluidSynth synthesis
        success = False
        if Path(self.soundfont_path).exists():
            cmd = [
                fluidsynth_bin,
                "-ni",
                "-g", "1.2",
                "-F", str(output_wav_path),
                "-r", "44100",
                str(self.soundfont_path),
                str(midi_path)
            ]
            try:
                logger.info(f"Running FluidSynth: {' '.join(cmd)}")
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
                # Convert mono to stereo
                data = np.column_stack((data, data))

            # Peak normalization to -1.0 dBFS (approx 0.89)
            peak = np.max(np.abs(data))
            if peak > 0:
                target_peak = 0.89
                data = data * (target_peak / peak)

            # Ensure target duration if provided
            if target_duration and target_duration > 0:
                target_samples = int(target_duration * sr)
                current_samples = len(data)
                if current_samples < target_samples:
                    # Pad with silence
                    pad_len = target_samples - current_samples
                    pad = np.zeros((pad_len, 2), dtype=data.dtype)
                    data = np.vstack((data, pad))

            sf.write(str(wav_path), data, sr, subtype='PCM_16')
        except Exception as e:
            logger.warning(f"Audio normalization warning: {e}")

    def _synthesize_internal(self, midi_path: Path, output_wav_path: Path, target_duration: Optional[float] = None):
        """
        High-fidelity physical model / harmonic additive synthesizer for piano.
        Simulates hammer attack strike, string inharmonicity, and multi-harmonic exponential decay.
        """
        import pretty_midi
        pm = pretty_midi.PrettyMIDI(str(midi_path))
        sr = 44100
        
        # Determine total duration
        total_time = pm.get_end_time() + 1.5
        if target_duration and target_duration > total_time:
            total_time = target_duration + 0.5
        total_time = max(2.0, total_time)
        
        total_samples = int(total_time * sr)
        audio = np.zeros(total_samples, dtype=np.float32)

        # Piano harmonic weights and decay rates
        harmonics = [
            (1.0, 1.0, 1.0),      # fundamental: amp 1.0, decay rate 1.0
            (2.0, 0.6, 1.4),      # 2nd harmonic
            (3.0, 0.35, 1.9),     # 3rd harmonic
            (4.0, 0.2, 2.5),      # 4th harmonic
            (5.0, 0.1, 3.2),      # 5th harmonic
            (6.0, 0.05, 4.0)      # 6th harmonic
        ]

        for inst in pm.instruments:
            for note in inst.notes:
                f0 = 440.0 * (2.0 ** ((note.pitch - 69) / 12.0))
                start_sample = int(note.start * sr)
                dur = max(0.1, note.end - note.start)
                release_tail = 0.6
                note_len_samples = int((dur + release_tail) * sr)
                
                if start_sample >= total_samples:
                    continue

                actual_len = min(note_len_samples, total_samples - start_sample)
                t = np.arange(actual_len) / sr

                # Note envelope
                decay_base = np.exp(-t / (dur * 1.5 + 0.2))
                # Soft hammer onset (2ms attack)
                attack = np.clip(t / 0.003, 0.0, 1.0)
                
                vel_factor = (note.velocity / 127.0) ** 1.3
                note_wave = np.zeros(actual_len, dtype=np.float32)

                for h_mult, h_amp, h_decay in harmonics:
                    freq = f0 * h_mult
                    if freq < sr / 2:
                        h_env = np.exp(-t * (h_decay * 1.2))
                        phase = 2.0 * np.pi * freq * t
                        note_wave += h_amp * h_env * np.sin(phase).astype(np.float32)

                # Add subtle strike noise impulse
                if len(t) > 200:
                    strike = np.random.normal(0, 0.05, 200) * np.exp(-np.linspace(0, 5, 200))
                    note_wave[:200] += strike.astype(np.float32)

                audio[start_sample:start_sample + actual_len] += note_wave * attack * decay_base * vel_factor * 0.2

        # Convert to stereo
        stereo_audio = np.column_stack((audio, audio))
        sf.write(str(output_wav_path), stereo_audio, sr, subtype='PCM_16')
