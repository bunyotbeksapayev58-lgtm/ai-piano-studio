import os
import cv2
import logging
import threading
import subprocess
import numpy as np
from pathlib import Path
from typing import List, Dict, Any, Callable, Optional, Tuple
from app.core.config import settings
from app.midi.midi_generator import MidiGenerator

logger = logging.getLogger(__name__)

class VideoRenderer:
    def __init__(
        self,
        width: int = 1280,
        height: int = 720,
        fps: int = 30,
        lookahead_seconds: float = 3.0
    ):
        self.width = width
        self.height = height
        self.fps = fps
        self.lookahead = lookahead_seconds
        
        # Geometry layout
        self.keyboard_top = 560
        self.keyboard_bottom = 710
        self.white_key_height = self.keyboard_bottom - self.keyboard_top
        self.black_key_height = int(self.white_key_height * 0.62)
        self.strike_y = self.keyboard_top - 2
        
        # Calculate 88-key mapping (MIDI 21 to 108)
        self._init_keyboard_geometry()

    def _init_keyboard_geometry(self):
        """
        Maps standard 88 piano keys (MIDI 21=A0 to 108=C8) to exact screen coordinates.
        There are 52 white keys and 36 black keys.
        """
        is_black_table = [False, True, False, True, False, False, True, False, True, False, True, False]
        
        self.key_geometry = {}
        self.white_keys = []
        self.black_keys = []

        total_white_keys = 52
        white_key_width = self.width / float(total_white_keys)
        black_key_width = white_key_width * 0.62

        white_idx = 0
        for midi in range(21, 109):
            is_black = is_black_table[midi % 12]
            if not is_black:
                x_left = white_idx * white_key_width
                x_right = (white_idx + 1) * white_key_width
                geom = {
                    "midi": midi,
                    "is_black": False,
                    "x_left": int(x_left),
                    "x_right": int(x_right),
                    "x_center": (x_left + x_right) / 2.0,
                    "width": int(white_key_width),
                    "top": self.keyboard_top,
                    "bottom": self.keyboard_bottom
                }
                self.key_geometry[midi] = geom
                self.white_keys.append(geom)
                white_idx += 1

        # Now place black keys between white keys
        for midi in range(21, 109):
            is_black = is_black_table[midi % 12]
            if is_black:
                prev_white = self.key_geometry.get(midi - 1)
                next_white = self.key_geometry.get(midi + 1)
                if prev_white and next_white:
                    center_x = (prev_white["x_right"] + next_white["x_left"]) / 2.0
                elif prev_white:
                    center_x = prev_white["x_right"]
                else:
                    center_x = 0
                
                x_left = center_x - (black_key_width / 2.0)
                x_right = center_x + (black_key_width / 2.0)
                geom = {
                    "midi": midi,
                    "is_black": True,
                    "x_left": int(x_left),
                    "x_right": int(x_right),
                    "x_center": center_x,
                    "width": int(black_key_width),
                    "top": self.keyboard_top,
                    "bottom": self.keyboard_top + self.black_key_height
                }
                self.key_geometry[midi] = geom
                self.black_keys.append(geom)

    def render_video(
        self,
        midi_path: Path,
        synth_audio_path: Path,
        output_mp4_path: Path,
        progress_callback: Optional[Callable[[float, str], None]] = None
    ) -> Path:
        """
        Renders the complete 720p 30fps MP4 falling notes animation synchronized with synthesized audio.
        Streams frames frame-by-frame directly into FFmpeg stdin pipe (zero RAM bloat).
        """
        output_mp4_path.parent.mkdir(parents=True, exist_ok=True)
        notes = MidiGenerator.read_midi_notes(midi_path)
        
        # Determine total duration from audio or notes
        import soundfile as sf
        audio_duration = 0.0
        try:
            ainfo = sf.info(str(synth_audio_path))
            audio_duration = ainfo.duration
        except Exception:
            pass

        max_note_end = max((n["end_time"] for n in notes), default=5.0)
        total_duration = max(audio_duration, max_note_end + 1.5)
        total_frames = int(np.ceil(total_duration * self.fps))

        logger.info(f"Rendering {total_frames} frames ({total_duration:.2f}s) at {self.width}x{self.height} @ {self.fps}fps")

        ffmpeg_cmd = [
            settings.ffmpeg_bin,
            "-y",
            "-loglevel", "error",
            "-f", "rawvideo",
            "-vcodec", "rawvideo",
            "-s", f"{self.width}x{self.height}",
            "-pix_fmt", "bgr24",
            "-r", str(self.fps),
            "-i", "-",
            "-i", str(synth_audio_path),
            "-c:v", settings.RENDER_VIDEO_CODEC,
            "-preset", "ultrafast",
            "-crf", "22",
            "-pix_fmt", "yuv420p",
            "-c:a", settings.RENDER_AUDIO_CODEC,
            "-b:a", settings.RENDER_AUDIO_BITRATE,
            "-shortest",
            str(output_mp4_path)
        ]

        proc = subprocess.Popen(
            ffmpeg_cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE
        )

        stderr_lines = []
        def drain_stderr():
            try:
                for line in iter(proc.stderr.readline, b''):
                    stderr_lines.append(line.decode('utf-8', errors='ignore'))
            except Exception:
                pass

        t_err = threading.Thread(target=drain_stderr, daemon=True)
        t_err.start()

        try:
            for frame_idx in range(total_frames):
                current_time = frame_idx / float(self.fps)
                frame = self._render_single_frame(notes, current_time)
                
                # Write raw bytes to ffmpeg stdin
                proc.stdin.write(frame.tobytes())

                # Report progress periodically
                if progress_callback and (frame_idx % (self.fps * 2) == 0 or frame_idx == total_frames - 1):
                    pct = (frame_idx + 1) / float(total_frames)
                    progress_callback(pct, f"Rendered frame {frame_idx + 1}/{total_frames} ({pct * 100:.1f}%)")

            proc.stdin.close()
            proc.wait(timeout=60)
            t_err.join(timeout=5)

            if proc.returncode != 0:
                err_msg = "".join(stderr_lines)
                raise RuntimeError(f"FFmpeg render pipe error: {err_msg}")

        except Exception as e:
            if proc.poll() is None:
                proc.kill()
            raise RuntimeError(f"Video rendering error: {str(e)}")

        if not output_mp4_path.exists() or output_mp4_path.stat().st_size == 0:
            raise RuntimeError("Rendered MP4 file was not generated or is empty.")

        logger.info(f"Successfully generated final MP4: {output_mp4_path} ({output_mp4_path.stat().st_size} bytes)")
        return output_mp4_path

    def _render_single_frame(self, notes: List[Dict[str, Any]], current_time: float) -> np.ndarray:
        """
        Renders a single frame at current_time.
        Dark gradient background, falling colored bars, strike line, glowing 88 keys.
        """
        # Create dark background: top #07090E, bottom #0F1420
        frame = np.zeros((self.height, self.width, 3), dtype=np.uint8)
        # Fast vertical gradient
        for y in range(self.keyboard_top):
            factor = y / float(self.keyboard_top)
            b = int(14 + factor * 14)
            g = int(9 + factor * 11)
            r = int(7 + factor * 9)
            frame[y, :] = (b, g, r)

        # Strike line (Y = self.strike_y) with subtle glow
        cv2.line(frame, (0, self.strike_y), (self.width, self.strike_y), (80, 70, 60), 1)
        cv2.line(frame, (0, self.strike_y - 1), (self.width, self.strike_y - 1), (40, 35, 30), 1)

        # Find active notes and notes in lookahead window
        # Notes in window: end_time >= current_time and start_time <= current_time + lookahead
        t_max = current_time + self.lookahead
        active_midi = {}  # midi -> note info for key illumination

        # Draw falling notes
        for note in notes:
            start_t = note["start_time"]
            end_t = note["end_time"]

            # Check if active currently (hitting piano)
            if start_t <= current_time <= end_t:
                active_midi[note["pitch"]] = note

            # Check if visible on screen
            if end_t < current_time or start_t > t_max:
                continue

            geom = self.key_geometry.get(note["pitch"])
            if not geom:
                continue

            # Calculate Y coordinates
            # When current_time == start_t, bottom is at strike_y
            # When current_time < start_t, bottom is above strike_y
            y_bottom = self.strike_y - int(((start_t - current_time) / self.lookahead) * self.strike_y)
            y_top = self.strike_y - int(((end_t - current_time) / self.lookahead) * self.strike_y)

            # Clamp coordinates to screen
            y_bottom = min(self.strike_y, y_bottom)
            y_top = max(0, y_top)

            if y_bottom <= y_top:
                continue

            # Note width & position
            x_left = geom["x_left"] + 1
            x_right = geom["x_right"] - 1
            if x_right <= x_left:
                x_right = x_left + 1

            # Color scheme:
            # Right Hand (Treble): Electric Blue / Cyan gradient (BGR)
            # Left Hand (Bass): Violet / Magenta / Purple gradient (BGR)
            is_right = (note.get("hand") == "right")
            if is_right:
                # Electric Blue / Cyan: (B=240, G=170, R=50) to (B=255, G=120, R=40)
                pitch_factor = np.clip((note["pitch"] - 60) / 48.0, 0.0, 1.0)
                base_color = (
                    int(255 - pitch_factor * 30),
                    int(180 - pitch_factor * 60),
                    int(40 + pitch_factor * 80)
                )
                border_color = (255, 220, 120)
            else:
                # Violet / Magenta: (B=230, G=70, R=180) to (B=200, G=40, R=140)
                pitch_factor = np.clip((note["pitch"] - 21) / 40.0, 0.0, 1.0)
                base_color = (
                    int(230 - pitch_factor * 40),
                    int(70 + pitch_factor * 30),
                    int(170 + pitch_factor * 60)
                )
                border_color = (240, 160, 240)

            # Draw note rectangle with border
            cv2.rectangle(frame, (x_left, y_top), (x_right, y_bottom), base_color, -1)
            cv2.rectangle(frame, (x_left, y_top), (x_right, y_bottom), border_color, 1)

            # If note is actively playing, draw intense strike spark / glow
            if start_t <= current_time <= end_t:
                spark_h = min(12, y_bottom - y_top)
                spark_color = (255, 255, 255)
                cv2.rectangle(frame, (x_left - 1, y_bottom - spark_h), (x_right + 1, y_bottom + 2), spark_color, -1)

        # Draw Piano Keyboard
        self._render_keyboard(frame, active_midi)

        return frame

    def _render_keyboard(self, frame: np.ndarray, active_midi: Dict[int, Any]):
        """
        Renders the 88-key piano keyboard with realistic white/black keys
        and responsive illumination on active notes.
        """
        # Keyboard background plate
        cv2.rectangle(frame, (0, self.keyboard_top), (self.width, self.keyboard_bottom), (15, 15, 18), -1)

        # 1. Draw White Keys
        for key in self.white_keys:
            midi = key["midi"]
            is_active = (midi in active_midi)
            x1, x2 = key["x_left"], key["x_right"]
            y1, y2 = key["top"], key["bottom"]

            if is_active:
                note = active_midi[midi]
                is_right = (note.get("hand") == "right")
                # Glowing active white key
                if is_right:
                    key_color = (245, 210, 100)  # Bright Cyan/Electric Blue highlight
                else:
                    key_color = (220, 130, 210)  # Bright Violet highlight
                border_color = (255, 255, 255)
            else:
                key_color = (240, 240, 242)      # Off-white ivory
                border_color = (130, 130, 135)   # Subtle key divider

            # Fill white key body
            cv2.rectangle(frame, (x1, y1), (x2, y2), key_color, -1)
            # Key separator border
            cv2.rectangle(frame, (x1, y1), (x2, y2), border_color, 1)
            # Bottom beveled edge
            cv2.rectangle(frame, (x1, y2 - 6), (x2, y2), (180, 180, 185) if not is_active else key_color, -1)

        # 2. Draw Black Keys (overlay on top of white keys)
        for key in self.black_keys:
            midi = key["midi"]
            is_active = (midi in active_midi)
            x1, x2 = key["x_left"], key["x_right"]
            y1, y2 = key["top"], key["bottom"]

            if is_active:
                note = active_midi[midi]
                is_right = (note.get("hand") == "right")
                if is_right:
                    b_color = (230, 160, 40)   # Vivid Electric Cyan
                else:
                    b_color = (200, 70, 180)   # Vivid Magenta
                border_color = (255, 255, 255)
            else:
                b_color = (25, 25, 30)         # Ebony black
                border_color = (50, 50, 55)

            # Drop shadow under black key
            cv2.rectangle(frame, (x1 - 1, y1), (x2 + 2, y2 + 3), (10, 10, 12), -1)
            # Black key body
            cv2.rectangle(frame, (x1, y1), (x2, y2), b_color, -1)
            cv2.rectangle(frame, (x1, y1), (x2, y2), border_color, 1)
            # Top highlight bevel
            if not is_active:
                cv2.rectangle(frame, (x1 + 1, y1 + 1), (x2 - 1, y1 + 8), (55, 55, 60), -1)
