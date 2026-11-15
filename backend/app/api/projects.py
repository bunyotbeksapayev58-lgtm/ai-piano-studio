import os
import uuid
import json
from pathlib import Path
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
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
from app.piano.synthesizer import PianoSynthesizer

router = APIRouter(prefix="/projects", tags=["projects"])

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

    # Calculate actual disk consumption in outputs and uploads
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
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Upload a music video file. Validates format, media streams, and duration (<= 10 mins).
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
        video_path=str(target_path)
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
    """
    Returns list of projects. If user is logged in, returns user's projects + public/demo items.
    """
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
    """
    Fetches details of a specific project.
    """
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
    """
    Updates project title or visual settings.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if user and project.user_id and project.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to edit this project.")

    if patch.title is not None:
        project.title = patch.title.strip()
    if patch.visual_settings is not None:
        current_settings = project.visual_settings
        current_settings.update(patch.visual_settings)
        project.visual_settings = current_settings

    db.commit()
    db.refresh(project)
    return ProjectResponse.from_orm_custom(project)

@router.post("/{project_id}/analyze", response_model=ProjectResponse)
def analyze_project(
    project_id: str,
    auto_render: bool = True,
    db: Session = Depends(get_db)
):
    """
    Triggers the AI transcription, MIDI generation, sound synthesis, and video rendering pipeline.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if project.status not in [ProjectStatus.UPLOADED, ProjectStatus.FAILED, ProjectStatus.COMPLETE]:
        raise HTTPException(status_code=409, detail="Project is currently processing.")

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
        raise HTTPException(status_code=400, detail="Transcription has not produced MIDI notes yet.")

    raw_notes = MidiGenerator.read_midi_notes(Path(project.midi_path))
    notes = [
        NoteDto(
            pitch=n["pitch"],
            start_time=n["start_time"],
            end_time=n["end_time"],
            duration=n["duration"],
            velocity=n.get("velocity", 80),
            hand=n.get("hand", "right"),
            channel=n.get("channel", 0)
        )
        for n in raw_notes
    ]

    audio_url = f"/api/projects/{project.id}/audio" if project.synth_audio_path else None

    return PreviewDataResponse(
        project_id=project.id,
        duration_seconds=project.duration_seconds,
        tempo=project.tempo or 120.0,
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
    """
    Saves manually edited MIDI notes back into the project MIDI file,
    re-synthesizes the piano audio, and updates note metrics.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if user and project.user_id and project.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to edit this project.")

    midi_path = Path(project.midi_path or (settings.OUTPUT_DIR / f"{project.id}.mid"))
    synth_path = Path(project.synth_audio_path or (settings.OUTPUT_DIR / f"{project.id}_piano.wav"))

    # Convert NoteDto list to DetectedNote list
    detected_notes = [
        DetectedNote(
            pitch=n.pitch,
            start_time=n.start_time,
            end_time=n.end_time,
            duration=n.duration,
            velocity=n.velocity,
            hand=n.hand,
            channel=1 if n.hand == "left" else 0
        )
        for n in req.notes
    ]

    tempo = req.tempo if req.tempo and req.tempo > 0 else (project.tempo or 120.0)
    max_end = max((n.end_time for n in detected_notes), default=project.duration_seconds)
    duration = max(project.duration_seconds, max_end)

    res = TranscriptionResult(
        notes=detected_notes,
        tempo=tempo,
        duration=duration
    )

    # 1. Re-write standard Type 1 MIDI file
    MidiGenerator.create_midi(res, midi_path)
    project.midi_path = str(midi_path)
    project.note_count = len(detected_notes)
    project.tempo = round(tempo, 1)

    # 2. Re-synthesize piano audio
    if req.auto_resynthesize:
        synth = PianoSynthesizer()
        synth.synthesize(midi_path, synth_path, target_duration=duration)
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
