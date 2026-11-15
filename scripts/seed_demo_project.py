import os
import sys
import json
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import settings
from app.core.database import SessionLocal, Base, engine
from app.models.project import Project, ProjectStatus
from app.services.video_service import VideoService
from app.midi.midi_generator import MidiGenerator

def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    demo_id = "demo-piano-sample"

    existing = db.query(Project).filter(Project.id == demo_id).first()
    if existing:
        print("Demo project already seeded in database.")
        db.close()
        return

    sample_mp4 = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "sample_piano.mp4"
    sample_wav = settings.TEMP_DIR / f"{demo_id}_audio.wav"
    demo_mid = settings.OUTPUT_DIR / "demo_transcription.mid"
    demo_synth = settings.OUTPUT_DIR / "demo_piano_audio.wav"
    demo_video = settings.OUTPUT_DIR / "demo_piano_video.mp4"

    # Copy files with demo_id naming if needed
    dest_mid = settings.OUTPUT_DIR / f"{demo_id}.mid"
    dest_synth = settings.OUTPUT_DIR / f"{demo_id}_piano.wav"
    dest_video = settings.OUTPUT_DIR / f"{demo_id}_piano_visualization.mp4"

    import shutil
    if demo_mid.exists() and not dest_mid.exists():
        shutil.copy(demo_mid, dest_mid)
    if demo_synth.exists() and not dest_synth.exists():
        shutil.copy(demo_synth, dest_synth)
    if demo_video.exists() and not dest_video.exists():
        shutil.copy(demo_video, dest_video)

    raw_notes = MidiGenerator.read_midi_notes(dest_mid if dest_mid.exists() else demo_mid)

    project = Project(
        id=demo_id,
        filename="Chopin_Nocturne_Op9_No2_Sample.mp4",
        file_size=sample_mp4.stat().st_size if sample_mp4.exists() else 73728,
        duration_seconds=7.0,
        status=ProjectStatus.COMPLETE,
        progress_percent=100.0,
        current_step=8,
        status_message="Processing complete! Ready for 3D preview and MP4 export.",
        video_path=str(sample_mp4),
        audio_path=str(sample_wav),
        midi_path=str(dest_mid),
        synth_audio_path=str(dest_synth),
        rendered_video_path=str(dest_video),
        note_count=len(raw_notes),
        tempo=120.0,
        quality_metrics_json=json.dumps({
            "transcription_quality": "High Precision Polyphonic",
            "confidence_score": 0.94,
            "note_count": len(raw_notes),
            "notes_per_second": round(len(raw_notes) / 7.0, 2),
            "estimated_tempo": 120.0,
            "pitch_range": {"min_midi": 48, "max_midi": 76, "min_note": "C3", "max_note": "E5"},
            "hand_distribution": {"right_hand_notes": 5, "left_hand_notes": 3, "right_hand_pct": 62.5, "left_hand_pct": 37.5},
            "polyphony": {"max_simultaneous": 3, "average_simultaneous": 1.4},
            "model": "Spotify Basic Pitch (ICASSP 2022 Architecture)",
            "license": "Apache-2.0",
            "hand_assignment_method": "Polyphonic register and voice-continuity heuristic"
        })
    )

    db.add(project)
    db.commit()
    print("Seeded demo project successfully into database!")
    db.close()

if __name__ == "__main__":
    seed()
