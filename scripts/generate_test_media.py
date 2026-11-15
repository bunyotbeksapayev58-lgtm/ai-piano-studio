import numpy as np
import soundfile as sf
import subprocess
from pathlib import Path
import os
import shutil

PROJECT_ROOT = Path(__file__).resolve().parent.parent
TEST_DIR = PROJECT_ROOT / "tests" / "fixtures"
TEST_DIR.mkdir(parents=True, exist_ok=True)

def generate_musical_wav(output_wav: Path, duration: float = 4.0):
    sr = 44100
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    audio = np.zeros_like(t, dtype=np.float32)

    # Sequence of notes: C4 (261.63Hz), E4 (329.63Hz), G4 (392.0Hz), C5 (523.25Hz)
    notes = [
        (261.63, 0.0, 1.0),
        (329.63, 1.0, 2.0),
        (392.00, 2.0, 3.0),
        (523.25, 3.0, 4.0)
    ]

    for freq, start, end in notes:
        idx_start = int(start * sr)
        idx_end = int(end * sr)
        note_t = np.linspace(0, end - start, idx_end - idx_start, endpoint=False)
        
        # Fundamental + 2nd harmonic with smooth envelope
        envelope = np.exp(-note_t * 1.5) * np.clip(note_t / 0.01, 0, 1)
        wave = (np.sin(2 * np.pi * freq * note_t) + 0.4 * np.sin(2 * np.pi * freq * 2 * note_t)) * envelope
        audio[idx_start:idx_end] += wave.astype(np.float32)

    # Normalize
    audio = audio / np.max(np.abs(audio) + 1e-6) * 0.8
    stereo = np.column_stack((audio, audio))
    sf.write(str(output_wav), stereo, sr, subtype='PCM_16')
    print(f"Generated test audio: {output_wav}")

def generate_test_video(wav_path: Path, output_mp4: Path):
    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        winget_ff = Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "WinGet" / "Packages"
        for p in winget_ff.glob("**/ffmpeg.exe"):
            ffmpeg_bin = str(p)
            break
    if not ffmpeg_bin:
        ffmpeg_bin = "ffmpeg"

    # Create a simple test video with color background and the musical audio
    cmd = [
        ffmpeg_bin,
        "-y",
        "-f", "lavfi",
        "-i", "color=c=navy:s=640x360:d=4:r=30",
        "-i", str(wav_path),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-shortest",
        str(output_mp4)
    ]
    subprocess.run(cmd, check=True)
    print(f"Generated test video: {output_mp4}")

if __name__ == "__main__":
    wav_path = TEST_DIR / "sample_piano.wav"
    mp4_path = TEST_DIR / "sample_piano.mp4"
    generate_musical_wav(wav_path, duration=4.0)
    generate_test_video(wav_path, mp4_path)
