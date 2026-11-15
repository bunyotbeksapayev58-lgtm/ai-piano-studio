import os
import sys
from pathlib import Path

# Add backend to PYTHONPATH
BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import settings
from app.services.video_service import VideoService
from app.transcription.factory import get_transcriber
from app.midi.midi_generator import MidiGenerator
from app.piano.synthesizer import PianoSynthesizer
from app.rendering.video_renderer import VideoRenderer

def generate_demo():
    print("=== Generating Demonstration AI Piano Video ===")
    test_wav = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "sample_piano.wav"
    output_mid = settings.OUTPUT_DIR / "demo_transcription.mid"
    output_wav = settings.OUTPUT_DIR / "demo_piano_audio.wav"
    output_mp4 = settings.OUTPUT_DIR / "demo_piano_video.mp4"

    # 1. Transcribe with Spotify Basic Pitch
    print("1. Running AI Music Transcription (Spotify Basic Pitch)...")
    transcriber = get_transcriber("basic_pitch")
    res = transcriber.transcribe(str(test_wav))
    print(f"   -> Detected {len(res.notes)} notes, estimated tempo: {res.tempo:.1f} BPM")

    # 2. Generate MIDI
    print("2. Generating Type 1 Multi-track MIDI with Hand Assignment...")
    MidiGenerator.create_midi(res, output_mid)
    print(f"   -> Saved MIDI: {output_mid}")

    # 3. Synthesize Piano Audio with FluidSynth
    print("3. Synthesizing Grand Piano Audio with FluidSynth & Salamander SoundFont...")
    synth = PianoSynthesizer()
    synth.synthesize(output_mid, output_wav, target_duration=res.duration)
    print(f"   -> Saved Synthesized Audio: {output_wav}")

    # 4. Render 720p 30fps Falling Notes MP4
    print("4. Rendering 1280x720 30FPS MP4 Falling Notes Animation...")
    renderer = VideoRenderer(width=1280, height=720, fps=30)
    renderer.render_video(
        midi_path=output_mid,
        synth_audio_path=output_wav,
        output_mp4_path=output_mp4,
        progress_callback=lambda pct, msg: print(f"   [{pct*100:.0f}%] {msg}")
    )
    print(f"=== DEMO COMPLETE: {output_mp4} ({output_mp4.stat().st_size} bytes) ===")

if __name__ == "__main__":
    generate_demo()
