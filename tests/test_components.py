import os
import subprocess
import pytest
from pathlib import Path
from fastapi.testclient import TestClient

from app.core.config import settings
from app.services.video_service import VideoService, VideoValidationError
from app.transcription.factory import get_transcriber
from app.transcription.base import DetectedNote, TranscriptionResult
from app.midi.hand_assigner import HandAssigner
from app.midi.midi_generator import MidiGenerator
from app.piano.synthesizer import PianoSynthesizer
from app.rendering.video_renderer import VideoRenderer
from app.core.security import hash_password, verify_password, create_access_token, decode_access_token
from main import app

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
SAMPLE_MP4 = FIXTURES_DIR / "sample_piano.mp4"
SAMPLE_WAV = FIXTURES_DIR / "sample_piano.wav"

client = TestClient(app)

def test_media_inspection_and_validation():
    """Verify ffprobe correctly inspects duration, audio/video streams."""
    assert SAMPLE_MP4.exists()
    info = VideoService.inspect_media(SAMPLE_MP4)
    assert info["has_audio"] is True
    assert info["has_video"] is True
    assert 3.5 <= info["duration"] <= 4.5

def test_audio_extraction():
    """Verify FFmpeg extracts a clean 44.1kHz WAV from MP4."""
    out_wav = settings.TEMP_DIR / "test_extract.wav"
    extracted = VideoService.extract_audio(SAMPLE_MP4, out_wav)
    assert extracted.exists()
    assert extracted.stat().st_size > 1000
    out_wav.unlink(missing_ok=True)

def test_duration_exceeded_rejection(monkeypatch):
    """Verify files exceeding 10 minutes (600s) are rejected."""
    monkeypatch.setattr(settings, "MAX_VIDEO_DURATION_SECONDS", 2.0)
    with pytest.raises(VideoValidationError) as exc:
        VideoService.inspect_media(SAMPLE_MP4)
    assert "exceeds the maximum allowed limit" in str(exc.value)

def test_ai_transcription_engine():
    """Verify Spotify Basic Pitch neural transcription detects notes and assigns hands."""
    transcriber = get_transcriber("basic_pitch")
    res = transcriber.transcribe(str(SAMPLE_WAV))
    assert res.note_count > 0
    assert len(res.notes) > 0
    for n in res.notes:
        assert 21 <= n.pitch <= 108
        assert n.duration > 0
        assert n.hand in ["right", "left"]
    assert "transcription_quality" in res.quality_report

def test_midi_generation_and_hands():
    """Verify multi-track MIDI generation and smart hand separation."""
    notes = [
        DetectedNote(pitch=48, start_time=0.0, end_time=1.0, duration=1.0, hand="left"),
        DetectedNote(pitch=60, start_time=0.0, end_time=1.0, duration=1.0, hand="right"),
        DetectedNote(pitch=72, start_time=1.0, end_time=2.0, duration=1.0, hand="right")
    ]
    res = TranscriptionResult(notes=notes, tempo=120.0, duration=2.0)
    out_mid = settings.TEMP_DIR / "test_out.mid"
    MidiGenerator.create_midi(res, out_mid)
    assert out_mid.exists()

    read_notes = MidiGenerator.read_midi_notes(out_mid)
    assert len(read_notes) == 3
    assert any(n["hand"] == "left" for n in read_notes)
    assert any(n["hand"] == "right" for n in read_notes)
    out_mid.unlink(missing_ok=True)

def test_piano_sound_generation():
    """Verify FluidSynth synthesizes piano audio from MIDI."""
    notes = [
        DetectedNote(pitch=60, start_time=0.0, end_time=0.8, duration=0.8, velocity=90, hand="right"),
        DetectedNote(pitch=64, start_time=0.2, end_time=0.8, duration=0.6, velocity=85, hand="right"),
        DetectedNote(pitch=67, start_time=0.4, end_time=0.8, duration=0.4, velocity=80, hand="right")
    ]
    res = TranscriptionResult(notes=notes, tempo=120.0, duration=1.0)
    midi_file = settings.TEMP_DIR / "synth_test.mid"
    wav_file = settings.TEMP_DIR / "synth_test.wav"
    MidiGenerator.create_midi(res, midi_file)

    synth = PianoSynthesizer()
    synth.synthesize(midi_file, wav_file, target_duration=1.0)
    assert wav_file.exists()
    assert wav_file.stat().st_size > 1000
    
    midi_file.unlink(missing_ok=True)
    wav_file.unlink(missing_ok=True)

def test_note_to_key_mapping():
    """Verify 88-key geometry covers all MIDI keys 21 to 108 without overlapping bounds."""
    renderer = VideoRenderer(1280, 720)
    assert len(renderer.white_keys) == 52
    assert len(renderer.black_keys) == 36
    assert len(renderer.key_geometry) == 88
    assert renderer.key_geometry[21]["is_black"] is False
    assert renderer.key_geometry[108]["is_black"] is False
    assert renderer.key_geometry[60]["is_black"] is False
    assert renderer.key_geometry[61]["is_black"] is True

def test_render_pipeline_mp4_generation():
    """Verify rendering engine outputs a valid 720p H.264/AAC MP4 with both streams."""
    notes = [
        DetectedNote(pitch=60, start_time=0.0, end_time=0.5, duration=0.5, velocity=85, hand="right"),
        DetectedNote(pitch=64, start_time=0.5, end_time=1.0, duration=0.5, velocity=85, hand="right")
    ]
    res = TranscriptionResult(notes=notes, tempo=120.0, duration=1.2)
    midi_file = settings.TEMP_DIR / "render_test.mid"
    wav_file = settings.TEMP_DIR / "render_test.wav"
    mp4_file = settings.TEMP_DIR / "render_test.mp4"

    MidiGenerator.create_midi(res, midi_file)
    synth = PianoSynthesizer()
    synth.synthesize(midi_file, wav_file, target_duration=1.2)

    renderer = VideoRenderer(1280, 720, fps=30)
    rendered = renderer.render_video(midi_file, wav_file, mp4_file)

    assert rendered.exists()
    assert rendered.stat().st_size > 5000

    info = VideoService.inspect_media(rendered)
    assert info["has_video"] is True
    assert info["has_audio"] is True
    assert any(s.get("codec_name") == "h264" for s in info["streams"])
    assert any(s.get("codec_name") == "aac" for s in info["streams"])

    midi_file.unlink(missing_ok=True)
    wav_file.unlink(missing_ok=True)
    mp4_file.unlink(missing_ok=True)

def test_security_password_and_token():
    """Verify PBKDF2 hashing and HMAC token encoding/decoding."""
    pwd = "SecretPianoPassword123!"
    h = hash_password(pwd)
    assert verify_password(pwd, h) is True
    assert verify_password("WrongPassword", h) is False

    token = create_access_token("user-123", "test@example.com", "pianist")
    payload = decode_access_token(token)
    assert payload is not None
    assert payload["sub"] == "user-123"
    assert payload["email"] == "test@example.com"
    assert payload["username"] == "pianist"

def test_auth_api_register_login():
    """Verify user registration, login, and auth status."""
    import time
    unique_suffix = int(time.time() * 1000)
    email = f"user_{unique_suffix}@pianostudio.com"
    username = f"user_{unique_suffix}"

    reg_resp = client.post("/api/auth/register", json={
        "email": email,
        "username": username,
        "password": "Password123!"
    })
    assert reg_resp.status_code == 200
    token_data = reg_resp.json()
    assert "access_token" in token_data
    token = token_data["access_token"]

    # Login
    login_resp = client.post("/api/auth/login", json={
        "login": email,
        "password": "Password123!"
    })
    assert login_resp.status_code == 200

    # Me check
    me_resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == email

def test_interactive_midi_update_and_resynthesis():
    """Verify that editing MIDI notes via PUT /api/projects/{id}/midi persists and updates audio."""
    with open(SAMPLE_MP4, "rb") as f:
        upload_resp = client.post(
            "/api/projects/upload",
            files={"file": ("test_edit.mp4", f, "video/mp4")}
        )
    assert upload_resp.status_code == 200
    proj_id = upload_resp.json()["id"]

    # PUT updated notes
    updated_notes = [
        {"pitch": 60, "start_time": 0.0, "end_time": 1.0, "duration": 1.0, "velocity": 85, "hand": "right", "channel": 0},
        {"pitch": 64, "start_time": 1.0, "end_time": 2.0, "duration": 1.0, "velocity": 85, "hand": "right", "channel": 0},
        {"pitch": 67, "start_time": 2.0, "end_time": 3.0, "duration": 1.0, "velocity": 85, "hand": "right", "channel": 0},
        {"pitch": 48, "start_time": 0.0, "end_time": 3.0, "duration": 3.0, "velocity": 90, "hand": "left", "channel": 1}
    ]

    put_resp = client.put(f"/api/projects/{proj_id}/midi", json={
        "notes": updated_notes,
        "tempo": 125.0,
        "auto_resynthesize": True,
        "auto_rerender": False
    })
    assert put_resp.status_code == 200
    proj_data = put_resp.json()
    assert proj_data["note_count"] == 4
    assert proj_data["tempo"] == 125.0
    assert proj_data["has_midi"] is True
    assert proj_data["has_synth_audio"] is True

    # Read preview to verify the 4 notes are served
    prev_resp = client.get(f"/api/projects/{proj_id}/preview")
    assert prev_resp.status_code == 200
    assert len(prev_resp.json()["notes"]) == 4

    # Clean up
    client.delete(f"/api/projects/{proj_id}")

def test_dashboard_stats_and_patch():
    """Verify dashboard stats and project patch endpoint."""
    stats_resp = client.get("/api/projects/stats")
    assert stats_resp.status_code == 200
    stats = stats_resp.json()
    assert "total_projects" in stats
    assert "completed_projects" in stats
    assert "total_storage_mb" in stats

    # Health check
    health_resp = client.get("/health")
    assert health_resp.status_code == 200
    assert health_resp.json()["status"] == "healthy"

def test_mp3_audio_upload_and_validation(tmp_path):
    """Verify that MP3 audio files (e.g. Moonlight Sonata MP3) are accepted, inspected, and uploaded cleanly."""
    mp3_path = tmp_path / "moonlight_sample.mp3"
    wav_out = tmp_path / "extracted_from_mp3.wav"

    # Generate a 3-second test MP3 file using FFmpeg
    cmd = [
        settings.ffmpeg_bin,
        "-y",
        "-f", "lavfi",
        "-i", "sine=frequency=440:duration=3",
        "-acodec", "libmp3lame",
        str(mp3_path)
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert mp3_path.exists()

    # 1. Media inspection handles MP3
    info = VideoService.inspect_media(mp3_path)
    assert info["has_audio"] is True
    assert 2.8 <= info["duration"] <= 3.2

    # 2. Audio extraction converts MP3 to 44.1kHz WAV
    VideoService.extract_audio(mp3_path, wav_out)
    assert wav_out.exists()
    assert wav_out.stat().st_size > 0

    # 3. Direct upload via REST API
    with open(mp3_path, "rb") as f:
        resp = client.post(
            "/api/projects/upload",
            files={"file": ("moonlight_sonata.mp3", f, "audio/mpeg")}
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["filename"] == "moonlight_sonata.mp3"
    assert data["status"] == "UPLOADED"
    assert 2.8 <= data["duration_seconds"] <= 3.2
    proj_id = data["id"]

    # Clean up project
    client.delete(f"/api/projects/{proj_id}")
