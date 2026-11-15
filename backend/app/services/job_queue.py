import logging
import threading
import traceback
from pathlib import Path
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import SessionLocal
from app.models.project import Project, ProjectStatus
from app.services.video_service import VideoService
from app.transcription.factory import get_transcriber
from app.midi.midi_generator import MidiGenerator
from app.piano.synthesizer import PianoSynthesizer
from app.rendering.video_renderer import VideoRenderer

logger = logging.getLogger(__name__)

class JobQueue:
    _lock = threading.Lock()

    @classmethod
    def start_processing_job(cls, project_id: str, auto_render: bool = True):
        """
        Launches background processing thread for a project.
        """
        thread = threading.Thread(
            target=cls._run_pipeline,
            args=(project_id, auto_render),
            daemon=True
        )
        thread.start()

    @classmethod
    def _run_pipeline(cls, project_id: str, auto_render: bool = True):
        db: Session = SessionLocal()
        try:
            project = db.query(Project).filter(Project.id == project_id).first()
            if not project:
                logger.error(f"Project not found: {project_id}")
                return

            video_path = Path(project.video_path)
            audio_path = settings.TEMP_DIR / f"{project.id}_audio.wav"
            midi_path = settings.OUTPUT_DIR / f"{project.id}.mid"
            synth_audio_path = settings.OUTPUT_DIR / f"{project.id}_piano.wav"
            rendered_video_path = settings.OUTPUT_DIR / f"{project.id}_piano_visualization.mp4"

            # -------------------------------------------------------------------------
            # Stage 2: Inspecting Media
            # -------------------------------------------------------------------------
            project.status = ProjectStatus.INSPECTING_MEDIA
            project.current_step = 2
            project.progress_percent = 12.0
            project.status_message = "Inspecting media metadata, duration, and stream integrity..."
            db.commit()

            media_info = VideoService.inspect_media(video_path)
            project.duration_seconds = round(media_info["duration"], 2)
            db.commit()

            # -------------------------------------------------------------------------
            # Stage 3: Extracting Audio
            # -------------------------------------------------------------------------
            project.status = ProjectStatus.EXTRACTING_AUDIO
            project.current_step = 3
            project.progress_percent = 22.0
            project.status_message = "Extracting audio track to 44.1 kHz 16-bit PCM WAV with FFmpeg..."
            db.commit()

            VideoService.extract_audio(video_path, audio_path)
            project.audio_path = str(audio_path)
            db.commit()

            # -------------------------------------------------------------------------
            # Stage 4: Preparing Audio
            # -------------------------------------------------------------------------
            project.status = ProjectStatus.PREPARING_AUDIO
            project.current_step = 4
            project.progress_percent = 32.0
            project.status_message = "Preparing audio spectrograms & acoustic feature representations..."
            db.commit()

            # -------------------------------------------------------------------------
            # Stage 5: AI Music Transcription
            # -------------------------------------------------------------------------
            project.status = ProjectStatus.ANALYZING_MUSIC
            project.current_step = 5
            project.progress_percent = 45.0
            project.status_message = "Running Spotify Basic Pitch neural network to detect piano notes..."
            db.commit()

            transcriber = get_transcriber("basic_pitch")
            transcription_result = transcriber.transcribe(str(audio_path))

            # -------------------------------------------------------------------------
            # Stage 6: MIDI Generation
            # -------------------------------------------------------------------------
            project.status = ProjectStatus.GENERATING_MIDI
            project.current_step = 6
            project.progress_percent = 60.0
            project.status_message = (
                f"Generating multi-track MIDI ({len(transcription_result.notes)} notes detected, "
                f"estimated tempo: {transcription_result.tempo:.1f} BPM)..."
            )
            db.commit()

            MidiGenerator.create_midi(transcription_result, midi_path)
            project.midi_path = str(midi_path)
            project.note_count = len(transcription_result.notes)
            project.tempo = round(transcription_result.tempo, 1)
            project.quality_metrics = transcription_result.quality_report
            db.commit()

            # -------------------------------------------------------------------------
            # Stage 7: Piano Audio Synthesis
            # -------------------------------------------------------------------------
            project.status = ProjectStatus.SYNTHESIZING_AUDIO
            project.current_step = 7
            project.progress_percent = 72.0
            project.status_message = "Synthesizing authentic concert grand piano audio via FluidSynth..."
            db.commit()

            synth = PianoSynthesizer()
            synth.synthesize(midi_path, synth_audio_path, target_duration=project.duration_seconds)
            project.synth_audio_path = str(synth_audio_path)
            db.commit()

            if auto_render:
                # ---------------------------------------------------------------------
                # Stage 8: Piano Animation Rendering
                # ---------------------------------------------------------------------
                project.status = ProjectStatus.RENDERING_ANIMATION
                project.current_step = 8
                project.progress_percent = 80.0
                project.status_message = "Rendering 720p 30fps falling-note piano animation..."
                db.commit()

                renderer = VideoRenderer(
                    width=settings.RENDER_WIDTH,
                    height=settings.RENDER_HEIGHT,
                    fps=settings.RENDER_FPS
                )

                def update_render_progress(pct: float, msg: str):
                    try:
                        # Stage 8 & 9 spans from 80% to 95%
                        render_progress = 80.0 + (pct * 15.0)
                        project.progress_percent = round(render_progress, 1)
                        project.status_message = msg
                        db.commit()
                    except Exception:
                        pass

                # ---------------------------------------------------------------------
                # Stage 9: MP4 Encoding
                # ---------------------------------------------------------------------
                # Handled via direct pipe stream in VideoRenderer
                project.status = ProjectStatus.EXPORTING_MP4
                project.current_step = 9
                db.commit()

                renderer.render_video(
                    midi_path=midi_path,
                    synth_audio_path=synth_audio_path,
                    output_mp4_path=rendered_video_path,
                    progress_callback=update_render_progress
                )
                project.rendered_video_path = str(rendered_video_path)
                db.commit()

                # ---------------------------------------------------------------------
                # Stage 10: Final Output Validation
                # ---------------------------------------------------------------------
                project.status = ProjectStatus.VALIDATING_OUTPUT
                project.current_step = 10
                project.progress_percent = 98.0
                project.status_message = "Validating final MP4 container, H.264 video, and AAC audio streams..."
                db.commit()

                output_info = VideoService.inspect_media(rendered_video_path)
                if not output_info["has_video"] or not output_info["has_audio"]:
                    raise RuntimeError("Rendered MP4 failed stream validation: missing audio or video.")

                # Mark complete
                project.status = ProjectStatus.COMPLETE
                project.current_step = 10
                project.progress_percent = 100.0
                project.status_message = "Processing complete! Video and MIDI ready for preview and export."
                db.commit()
            else:
                project.status = ProjectStatus.COMPLETE
                project.current_step = 7
                project.progress_percent = 75.0
                project.status_message = "Transcription and preview ready."
                db.commit()

            logger.info(f"Pipeline finished successfully for project: {project.id}")

        except Exception as e:
            logger.error(f"Error in job pipeline for project {project_id}: {str(e)}\n{traceback.format_exc()}")
            try:
                project = db.query(Project).filter(Project.id == project_id).first()
                if project:
                    project.status = ProjectStatus.FAILED
                    project.error_message = str(e)
                    project.status_message = f"Processing failed: {str(e)}"
                    db.commit()
            except Exception as dbe:
                logger.error(f"Failed to record error state: {dbe}")
        finally:
            db.close()
