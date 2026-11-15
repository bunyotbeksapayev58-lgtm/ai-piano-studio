import enum
import json
from datetime import datetime
from typing import Optional, Dict, Any, List
from sqlalchemy import Column, String, Integer, Float, DateTime, Text, Enum, ForeignKey
from sqlalchemy.orm import relationship
from pydantic import BaseModel
from app.core.database import Base
from app.models.user import User

class ProjectStatus(str, enum.Enum):
    UPLOADED = "UPLOADED"
    INSPECTING_MEDIA = "INSPECTING_MEDIA"
    EXTRACTING_AUDIO = "EXTRACTING_AUDIO"
    PREPARING_AUDIO = "PREPARING_AUDIO"
    ANALYZING_MUSIC = "ANALYZING_MUSIC"
    GENERATING_MIDI = "GENERATING_MIDI"
    SYNTHESIZING_AUDIO = "SYNTHESIZING_AUDIO"
    RENDERING_ANIMATION = "RENDERING_ANIMATION"
    EXPORTING_MP4 = "EXPORTING_MP4"
    VALIDATING_OUTPUT = "VALIDATING_OUTPUT"
    COMPLETE = "COMPLETE"
    FAILED = "FAILED"

class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    title = Column(String, nullable=True)
    filename = Column(String, nullable=False)
    file_size = Column(Integer, nullable=False)
    duration_seconds = Column(Float, default=0.0)
    
    status = Column(Enum(ProjectStatus), default=ProjectStatus.UPLOADED, nullable=False)
    progress_percent = Column(Float, default=0.0)
    current_step = Column(Integer, default=1)
    status_message = Column(String, default="Uploaded successfully")
    error_message = Column(Text, nullable=True)
    
    video_path = Column(String, nullable=False)
    audio_path = Column(String, nullable=True)
    midi_path = Column(String, nullable=True)
    synth_audio_path = Column(String, nullable=True)
    rendered_video_path = Column(String, nullable=True)
    
    note_count = Column(Integer, default=0)
    tempo = Column(Float, default=120.0)
    quality_metrics_json = Column(Text, default="{}")
    settings_json = Column(Text, default="{}")
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner = relationship("User", back_populates="projects")

    @property
    def display_title(self) -> str:
        return self.title or self.filename

    @property
    def quality_metrics(self) -> Dict[str, Any]:
        try:
            return json.loads(self.quality_metrics_json or "{}")
        except Exception:
            return {}

    @quality_metrics.setter
    def quality_metrics(self, value: Dict[str, Any]):
        self.quality_metrics_json = json.dumps(value)

    @property
    def visual_settings(self) -> Dict[str, Any]:
        try:
            return json.loads(self.settings_json or "{}")
        except Exception:
            return {
                "theme": "electric_blue",
                "lookahead": 3.0,
                "camera_fov": 45,
                "volume": 0.9
            }

    @visual_settings.setter
    def visual_settings(self, value: Dict[str, Any]):
        self.settings_json = json.dumps(value)


# Pydantic Schemas
class ProjectBase(BaseModel):
    id: str
    user_id: Optional[str] = None
    title: Optional[str] = None
    filename: str
    file_size: int
    duration_seconds: float
    status: ProjectStatus
    progress_percent: float
    current_step: int
    status_message: str
    error_message: Optional[str] = None
    note_count: int = 0
    tempo: float = 120.0
    quality_metrics: Dict[str, Any] = {}
    visual_settings: Dict[str, Any] = {}
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class ProjectResponse(ProjectBase):
    has_audio: bool = False
    has_midi: bool = False
    has_synth_audio: bool = False
    has_rendered_video: bool = False

    @classmethod
    def from_orm_custom(cls, p: Project) -> "ProjectResponse":
        return cls(
            id=p.id,
            user_id=p.user_id,
            title=p.title or p.filename,
            filename=p.filename,
            file_size=p.file_size,
            duration_seconds=p.duration_seconds or 0.0,
            status=p.status,
            progress_percent=p.progress_percent,
            current_step=p.current_step,
            status_message=p.status_message,
            error_message=p.error_message,
            note_count=p.note_count or 0,
            tempo=p.tempo or 120.0,
            quality_metrics=p.quality_metrics,
            visual_settings=p.visual_settings,
            created_at=p.created_at,
            updated_at=p.updated_at,
            has_audio=bool(p.audio_path),
            has_midi=bool(p.midi_path),
            has_synth_audio=bool(p.synth_audio_path),
            has_rendered_video=bool(p.rendered_video_path),
        )

class ProjectPatchRequest(BaseModel):
    title: Optional[str] = None
    visual_settings: Optional[Dict[str, Any]] = None

class NoteDto(BaseModel):
    pitch: int
    start_time: float
    end_time: float
    duration: float
    velocity: int = 80
    hand: str = "right"  # "right" or "left"
    channel: int = 0

class NoteUpdateBatchRequest(BaseModel):
    notes: List[NoteDto]
    tempo: Optional[float] = None
    auto_resynthesize: bool = True
    auto_rerender: bool = False

class PreviewDataResponse(BaseModel):
    project_id: str
    duration_seconds: float
    tempo: float
    note_count: int
    notes: List[NoteDto]
    audio_url: Optional[str] = None
    visual_settings: Dict[str, Any] = {}

class DashboardStatsResponse(BaseModel):
    total_projects: int
    completed_projects: int
    processing_projects: int
    failed_projects: int
    total_storage_mb: float
    storage_limit_mb: float = 5000.0
