import os
import uuid
import json
from pathlib import Path
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import get_db
from app.models.user import User
from app.models.project import (
    Project, ProjectStatus, ProjectResponse, PreviewDataResponse, NoteDto,
    ProjectPatchRequest, NoteUpdateBatchRequest, DashboardStatsResponse
)
from app.api.auth import get_current_user_optional, get_current_user
from app.services.video_service import VideoService, VideoValidationError
from app.services.job_queue import JobQueue
from app.midi.midi_generator import MidiGenerator
from app.transcription.base import DetectedNote, TranscriptionResult
from app.piano.synthesizer import PianoSynthesizer, PIANO_PRESETS
from app.rendering.video_renderer import VideoRenderer, THEME_PALETTES

router = APIRouter(prefix="/projects", tags=["projects"])

@router.get("/presets")
def get_presets():
    """
    Returns available piano instrument sound presets, visual themes, song arrangement modes, and hand styles.
    """
    return {
        "sound_presets": [
            {"id": k, "name": v["name"], "description": v["description"]}
            for k, v in PIANO_PRESETS.items()
        ],
        "themes": [
            {"id": k, "name": v["name"]}
            for k, v in THEME_PALETTES.items()
        ],
        "song_modes": [
            {
                "id": "universal_song",
                "name": "Har qanday qo'shiq / Pop Cover (HPSS AI)",
                "description": "Baraban, bas va ritmlarni ajratib tashlaydi, vokal melodiyasini o'ng qo'lga, garmoniyani chap qo'lga moslashtiradi."
            },
            {
                "id": "solo_piano",
                "name": "Akustik Solo Pianino",
                "description": "Klassik va instrumental royal asarlari uchun garmonik de-rezonans bilan yuqori aniqlikdagi rejim."
            },
            {
                "id": "easy_tutorial",
                "name": "Oson Pianino (Easy Tutorial)",
                "description": "Boshlang'ich daraja uchun soddalashtirilgan melodiya va bas."
            }
        ],
        "hands_styles": [
            {"id": "anime", "name": "Anime Realistic Hands (Tabiiy teri & yumshoq soya)"},
            {"id": "cyber_glow", "name": "Cyber Glow Hands (Futuristik neon)"},
            {"id": "off", "name": "Qo'llarsiz (Faqat klavishlar)"}
        ]
    }

@router.get("/stats", response_model=DashboardStatsResponse)
def get_dashboard_stats(
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Returns dashboard project metrics, processing counters, and storage consumption.
    """
    query = db.query(Project)
    if user:
        query = query.filter((Project.user_id == user.id) | (Project.user_id == None))

    all_projects = query.all()
    total = len(all_projects)
    completed = sum(1 for p in all_projects if p.status == ProjectStatus.COMPLETE)
    processing = sum(1 for p in all_projects if p.status not in [ProjectStatus.COMPLETE, ProjectStatus.FAILED, ProjectStatus.UPLOADED])
    failed = sum(1 for p in all_projects if p.status == ProjectStatus.FAILED)

    total_bytes = 0
    for p in all_projects:
        for path_str in [p.video_path, p.audio_path, p.midi_path, p.synth_audio_path, p.rendered_video_path]:
            if path_str:
                path = Path(path_str)
                if path.exists():
                    try:
                        total_bytes += path.stat().st_size
                    except Exception:
                        pass

    storage_mb = round(total_bytes / (1024 * 1024), 2)

    return DashboardStatsResponse(
        total_projects=total,
        completed_projects=completed,
        processing_projects=processing,
        failed_projects=failed,
        total_storage_mb=storage_mb,
        storage_limit_mb=5000.0
    )

@router.post("/upload", response_model=ProjectResponse)
async def upload_video(
    file: UploadFile = File(...),
    song_mode: Optional[str] = Form("universal_song"),
    sound_preset: Optional[str] = Form("concert_grand"),
    theme: Optional[str] = Form("falling_note_anime"),
    hands_style: Optional[str] = Form("anime"),
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Upload a music file or video. Supports any general song or solo piano piece.
    """
    sanitized_name = VideoService.sanitize_filename(file.filename or "video.mp4")
    file_ext = Path(sanitized_name).suffix.lower()

    if file_ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format '{file_ext}'. Allowed formats: {', '.join(sorted(settings.ALLOWED_EXTENSIONS))}"
        )

    project_id = str(uuid.uuid4())
    saved_filename = f"{project_id}{file_ext}"
    target_path = settings.UPLOAD_DIR / saved_filename

    total_bytes = 0
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    with open(target_path, "wb") as f:
        while chunk := await file.read(1024 * 1024):
            total_bytes += len(chunk)
            if total_bytes > max_bytes:
                target_path.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=413,
                    detail=f"File exceeds maximum size limit of {settings.MAX_UPLOAD_SIZE_MB}MB."
                )
            f.write(chunk)

    try:
        media_info = VideoService.inspect_media(target_path)
    except VideoValidationError as e:
        target_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        target_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Failed to inspect video: {str(e)}")

    initial_settings = {
        "song_mode": song_mode or "universal_song",
        "sound_preset": sound_preset or "concert_grand",
        "theme": theme or "falling_note_anime",
        "hands_style": hands_style or "anime",
        "lookahead": 3.0,
        "volume": 0.9
    }

    project = Project(
        id=project_id,
        user_id=user.id if user else None,
        title=Path(sanitized_name).stem,
        filename=sanitized_name,
        file_size=total_bytes,
        duration_seconds=round(media_info["duration"], 2),
        status=ProjectStatus.UPLOADED,
        progress_percent=10.0,
        current_step=1,
        status_message="Video uploaded and validated successfully.",
        video_path=str(target_path),
        visual_settings=initial_settings
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    return ProjectResponse.from_orm_custom(project)

@router.get("", response_model=List[ProjectResponse])
def list_projects(
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user_optional)
):
    query = db.query(Project)
    if user:
        query = query.filter((Project.user_id == user.id) | (Project.user_id == None))
    projects = query.order_by(Project.created_at.desc()).all()
    return [ProjectResponse.from_orm_custom(p) for p in projects]

@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: str,
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return ProjectResponse.from_orm_custom(project)

@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: str,
    patch: ProjectPatchRequest,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user_optional)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if user and project.user_id and project.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to edit this project.")

    if patch.title is not None:
        project.title = patch.title.strip()
    if patch.visual_settings is not None:
        current_settings = project.visual_settings or {}
        current_settings.update(patch.visual_settings)
        project.visual_settings = current_settings

    db.commit()
    db.refresh(project)
    return ProjectResponse.from_orm_custom(project)

@router.post("/{project_id}/analyze", response_model=ProjectResponse)
def analyze_project(
    project_id: str,
    auto_render: bool = True,
    song_mode: Optional[str] = None,
    sound_preset: Optional[str] = None,
    theme: Optional[str] = None,
    hands_style: Optional[str] = None,
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if project.status not in [ProjectStatus.UPLOADED, ProjectStatus.FAILED, ProjectStatus.COMPLETE]:
        raise HTTPException(status_code=409, detail="Project is currently processing.")

    # Update settings if supplied
    current_settings = project.visual_settings or {}
    if song_mode: current_settings["song_mode"] = song_mode
    if sound_preset: current_settings["sound_preset"] = sound_preset
    if theme: current_settings["theme"] = theme
    if hands_style: current_settings["hands_style"] = hands_style
    project.visual_settings = current_settings

    project.status = ProjectStatus.INSPECTING_MEDIA
    project.current_step = 2
    project.progress_percent = 12.0
    project.error_message = None
    project.status_message = "Starting transcription workflow..."
    db.commit()
    db.refresh(project)

    JobQueue.start_processing_job(project_id, auto_render=auto_render)
    return ProjectResponse.from_orm_custom(project)

@router.get("/{project_id}/status", response_model=ProjectResponse)
def get_project_status(
    project_id: str,
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return ProjectResponse.from_orm_custom(project)

@router.get("/{project_id}/preview", response_model=PreviewDataResponse)
def get_preview_data(
    project_id: str,
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not project.midi_path or not Path(project.midi_path).exists():
        raise HTTPException(status_code=400, detail="MIDI data is not yet generated for this project.")

    notes_dict = MidiGenerator.read_midi_notes(Path(project.midi_path))
    notes = [
        NoteDto(
            pitch=n["pitch"],
            start_time=n["start_time"],
            end_time=n["end_time"],
            duration=n["duration"],
            velocity=n["velocity"],
            hand=n["hand"],
            channel=n["channel"]
        )
        for n in notes_dict
    ]

    audio_url = f"/api/projects/{project.id}/audio" if project.synth_audio_path and Path(project.synth_audio_path).exists() else None

    return PreviewDataResponse(
        project_id=project.id,
        duration_seconds=project.duration_seconds,
        tempo=project.tempo,
        note_count=len(notes),
        notes=notes,
        audio_url=audio_url,
        visual_settings=project.visual_settings
    )

@router.put("/{project_id}/midi", response_model=ProjectResponse)
def update_midi_notes(
    project_id: str,
    req: NoteUpdateBatchRequest,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user_optional)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if user and project.user_id and project.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to edit this project.")

    midi_path = settings.OUTPUT_DIR / f"{project.id}.mid"
    synth_path = settings.OUTPUT_DIR / f"{project.id}_piano.wav"

    detected_notes = [
        DetectedNote(
            pitch=n.pitch,
            start_time=n.start_time,
            end_time=n.end_time,
            duration=n.duration,
            velocity=n.velocity,
            hand=n.hand
        )
        for n in req.notes
    ]

    tempo = req.tempo if req.tempo and req.tempo > 0 else project.tempo
    duration = max(project.duration_seconds, max((n.end_time for n in req.notes), default=5.0))

    res = TranscriptionResult(
        notes=detected_notes,
        tempo=tempo,
        duration=duration
    )

    v_settings = project.visual_settings or {}
    sound_preset = v_settings.get("sound_preset", "concert_grand")
    preset_info = PIANO_PRESETS.get(sound_preset, PIANO_PRESETS["concert_grand"])

    # 1. Re-write standard Type 1 MIDI file
    MidiGenerator.create_midi(
        result=res,
        output_path=midi_path,
        program=preset_info.get("program", 0),
        bank=preset_info.get("bank", 0)
    )
    project.midi_path = str(midi_path)
    project.note_count = len(detected_notes)
    project.tempo = round(tempo, 1)

    # 2. Re-synthesize piano audio
    if req.auto_resynthesize:
        synth = PianoSynthesizer()
        synth.synthesize(
            midi_path=midi_path,
            output_wav_path=synth_path,
            preset_key=sound_preset,
            target_duration=duration
        )
        project.synth_audio_path = str(synth_path)

    project.status_message = f"MIDI notes updated ({len(detected_notes)} notes saved)."
    db.commit()
    db.refresh(project)

    # 3. Optional auto re-render
    if req.auto_rerender:
        JobQueue.start_processing_job(project_id, auto_render=True)

    return ProjectResponse.from_orm_custom(project)

@router.get("/{project_id}/midi")
def download_midi(
    project_id: str,
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project or not project.midi_path or not Path(project.midi_path).exists():
        raise HTTPException(status_code=404, detail="MIDI file not found or not yet generated.")

    clean_name = f"{Path(project.filename).stem}_piano.mid"
    return FileResponse(
        path=project.midi_path,
        media_type="audio/midi",
        filename=clean_name
    )

@router.post("/{project_id}/render", response_model=ProjectResponse)
def trigger_render(
    project_id: str,
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not project.midi_path or not Path(project.midi_path).exists():
        raise HTTPException(status_code=400, detail="Cannot render video without generated MIDI.")

    JobQueue.start_processing_job(project_id, auto_render=True)
    return ProjectResponse.from_orm_custom(project)

@router.get("/{project_id}/download")
def download_video(
    project_id: str,
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project or not project.rendered_video_path or not Path(project.rendered_video_path).exists():
        raise HTTPException(status_code=404, detail="Rendered video not found or not yet completed.")

    clean_name = f"{Path(project.filename).stem}_piano_animation.mp4"
    return FileResponse(
        path=project.rendered_video_path,
        media_type="video/mp4",
        filename=clean_name
    )

@router.get("/{project_id}/video")
def stream_video(
    project_id: str,
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project or not project.rendered_video_path or not Path(project.rendered_video_path).exists():
        raise HTTPException(status_code=404, detail="Rendered video not available.")

    return FileResponse(
        path=project.rendered_video_path,
        media_type="video/mp4"
    )

@router.get("/{project_id}/audio")
def stream_audio(
    project_id: str,
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project or not project.synth_audio_path or not Path(project.synth_audio_path).exists():
        raise HTTPException(status_code=404, detail="Synthesized audio not available.")

    return FileResponse(
        path=project.synth_audio_path,
        media_type="audio/wav"
    )

@router.delete("/{project_id}")
def delete_project(
    project_id: str,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user_optional)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if user and project.user_id and project.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this project.")

    for p_str in [project.video_path, project.audio_path, project.midi_path, project.synth_audio_path, project.rendered_video_path]:
        if p_str:
            try:
                Path(p_str).unlink(missing_ok=True)
            except Exception:
                pass

    db.delete(project)
    db.commit()
    return {"message": "Project deleted successfully", "project_id": project_id}
