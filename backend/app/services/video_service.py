import json
import os
import re
import subprocess
from pathlib import Path
from typing import Dict, Any, Tuple
from app.core.config import settings

class VideoValidationError(Exception):
    pass

class VideoService:
    @staticmethod
    def sanitize_filename(filename: str) -> str:
        # Prevent path traversal and unsafe characters
        filename = os.path.basename(filename)
        clean = re.sub(r'[^a-zA-Z0-9_.-]', '_', filename)
        return clean or "uploaded_video.mp4"

    @staticmethod
    def inspect_media(file_path: Path) -> Dict[str, Any]:
        """
        Runs ffprobe to inspect media streams, container format, and duration.
        """
        if not file_path.exists():
            raise VideoValidationError(f"File does not exist: {file_path}")

        ffprobe_cmd = [
            settings.ffprobe_bin,
            "-v", "error",
            "-show_entries", "format=duration,format_name,size,bit_rate",
            "-show_streams",
            "-of", "json",
            str(file_path)
        ]

        try:
            result = subprocess.run(
                ffprobe_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                check=True,
                timeout=30
            )
            data = json.loads(result.stdout)
        except subprocess.TimeoutExpired:
            raise VideoValidationError("FFprobe timed out inspecting media.")
        except subprocess.CalledProcessError as e:
            raise VideoValidationError(f"FFprobe error: {e.stderr or e.stdout}")
        except Exception as e:
            raise VideoValidationError(f"Failed to parse media metadata: {str(e)}")

        streams = data.get("streams", [])
        format_info = data.get("format", {})

        has_audio = any(s.get("codec_type") == "audio" for s in streams)
        has_video = any(s.get("codec_type") == "video" for s in streams)

        if not has_audio:
            raise VideoValidationError("Uploaded file does not contain an audio track.")

        # Duration detection
        duration = 0.0
        if "duration" in format_info:
            try:
                duration = float(format_info["duration"])
            except (ValueError, TypeError):
                pass

        if duration == 0.0:
            for s in streams:
                if "duration" in s:
                    try:
                        duration = float(s["duration"])
                        if duration > 0:
                            break
                    except (ValueError, TypeError):
                        pass

        if duration <= 0.0:
            raise VideoValidationError("Could not determine media duration or audio is empty.")

        if duration > settings.MAX_VIDEO_DURATION_SECONDS:
            raise VideoValidationError(
                f"Video duration ({duration:.1f}s) exceeds the maximum allowed limit of {settings.MAX_VIDEO_DURATION_SECONDS:.0f} seconds (10 minutes)."
            )

        return {
            "duration": duration,
            "has_video": has_video,
            "has_audio": has_audio,
            "format_name": format_info.get("format_name", "unknown"),
            "size": int(format_info.get("size", file_path.stat().st_size)),
            "streams": streams
        }

    @staticmethod
    def extract_audio(video_path: Path, output_wav_path: Path) -> Path:
        """
        Extracts audio to a high quality normalized 44.1 kHz 16-bit PCM WAV.
        """
        output_wav_path.parent.mkdir(parents=True, exist_ok=True)
        
        ffmpeg_cmd = [
            settings.ffmpeg_bin,
            "-y",
            "-i", str(video_path),
            "-vn",
            "-acodec", "pcm_s16le",
            "-ar", "44100",
            "-ac", "2",
            str(output_wav_path)
        ]

        try:
            result = subprocess.run(
                ffmpeg_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                check=True,
                timeout=120
            )
        except subprocess.TimeoutExpired:
            raise RuntimeError("Audio extraction timed out.")
        except subprocess.CalledProcessError as e:
            raise RuntimeError(f"FFmpeg audio extraction failed: {e.stderr}")

        if not output_wav_path.exists() or output_wav_path.stat().st_size == 0:
            raise RuntimeError("Extracted audio file is missing or empty.")

        return output_wav_path
