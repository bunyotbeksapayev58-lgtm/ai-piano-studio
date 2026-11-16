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
from app.rendering.hand_animator import HandAnimator

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
        self.keyboard_top = 540
        self.keyboard_bottom = 710
        self.white_key_height = self.keyboard_bottom - self.keyboard_top
        self.black_key_height = int(self.white_key_height * 0.62)
        self.strike_y = self.keyboard_top - 2
        
        # Calculate 88-key mapping (MIDI 21 to 108)
        self._init_keyboard_geometry()

        # Initialize animated hands engine
        self.hand_animator = HandAnimator(
            width=self.width,
            height=self.height,
            keyboard_top=self.keyboard_top,
            keyboard_bottom=self.keyboard_bottom
        )

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

        # Place black keys between white keys
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
        Renders the complete 720p 30fps MP4 falling notes animation with animated hands
        synchronized with synthesized audio. Streams frames directly into FFmpeg stdin pipe.
        """
        output_mp4_path.parent.mkdir(parents=True, exist_ok=True)
        notes = MidiGenerator.read_midi_notes(midi_path)
        
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

        dt = 1.0 / float(self.fps)
        try:
            for frame_idx in range(total_frames):
                current_time = frame_idx * dt
                frame = self._render_single_frame(notes, current_time, dt)
                
                # Write raw bytes to ffmpeg stdin
                proc.stdin.write(frame.tobytes())

                # Report progress periodically
                if progress_callback and (frame_idx % (self.fps * 2) == 0 or frame_idx == total_frames - 1):
                    pct = (frame_idx + 1) / float(total_frames)
                    progress_callback(pct, f"Rendered frame {frame_idx + 1}/{total_frames} ({pct * 100:.1f}%)")

            proc.stdin.close()
            proc.wait(timeout=120)
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

    def _render_single_frame(self, notes: List[Dict[str, Any]], current_time: float, dt: float = 0.033) -> np.ndarray:
        """
        Renders a single frame at current_time with Falling Note aesthetic:
        - Deep gradient background
        - Rounded falling note bars with musical pitch badges
        - Glowing 88-key piano keyboard with octave indicators
        - Animated anime hands with soft drop shadows and finger kinematics
        - Elegant 'Ped.' indicator and neon strike bloom
        """
        # 1. Dark Gradient Background (#06080D to #0B101B)
        frame = np.zeros((self.height, self.width, 3), dtype=np.uint8)
        for y in range(self.keyboard_top):
            factor = y / float(self.keyboard_top)
            b = int(13 + factor * 12)
            g = int(8 + factor * 8)
            r = int(6 + factor * 6)
            frame[y, :] = (b, g, r)

        # Subtle vertical key guideline dividers in the falling note area
        for key in self.white_keys:
            x = key["x_left"]
            cv2.line(frame, (x, 0), (x, self.strike_y), (18, 16, 20), 1)

        # 2. Identify active notes & visible notes in lookahead window
        t_max = current_time + self.lookahead
        active_notes = []
        active_midi = {}

        for note in notes:
            start_t = note["start_time"]
            end_t = note["end_time"]
            if start_t <= current_time <= end_t:
                active_notes.append(note)
                active_midi[note["pitch"]] = note

        # 3. Draw Falling Note Bars with Rounded Ends & Note Badges
        visible_notes = [n for n in notes if not (n["end_time"] < current_time or n["start_time"] > t_max)]
        
        # Sort so longer / background notes render behind shorter notes
        visible_notes.sort(key=lambda n: n["start_time"])

        for note in visible_notes:
            start_t = note["start_time"]
            end_t = note["end_time"]
            geom = self.key_geometry.get(note["pitch"])
            if not geom:
                continue

            # Calculate Y coordinates
            y_bottom = self.strike_y - int(((start_t - current_time) / self.lookahead) * self.strike_y)
            y_top = self.strike_y - int(((end_t - current_time) / self.lookahead) * self.strike_y)

            # Clamp coordinates
            y_bottom = min(self.strike_y, y_bottom)
            y_top = max(0, y_top)

            if y_bottom <= y_top:
                continue

            # Note width & position
            x_left = geom["x_left"] + 2
            x_right = geom["x_right"] - 2
            if x_right <= x_left:
                x_right = x_left + 2
            note_w = x_right - x_left
            radius = min(note_w // 2, 7)

            # Color scheme matching Falling Note:
            # Right Hand: Cyan / Electric Blue (#38bdf8 / #3b82f6)
            # Left Hand: Emerald / Green (#10b981 / #059669)
            is_right = (note.get("hand") == "right")
            if is_right:
                # Electric Blue / Sky Blue
                base_color = (248, 189, 56)      # BGR: #38bdf8
                glow_border = (255, 230, 160)
                badge_bg = (220, 120, 30)
            else:
                # Emerald / Jade Green (like the screenshot!)
                base_color = (129, 185, 16)      # BGR: #10b981
                glow_border = (180, 240, 100)
                badge_bg = (100, 150, 10)

            # Draw note body
            cv2.rectangle(frame, (x_left, y_top + radius), (x_right, y_bottom - radius), base_color, -1)
            # Rounded top cap
            cv2.circle(frame, (x_left + radius, y_top + radius), radius, base_color, -1)
            cv2.circle(frame, (x_right - radius, y_top + radius), radius, base_color, -1)
            cv2.rectangle(frame, (x_left + radius, y_top), (x_right - radius, y_top + radius * 2), base_color, -1)
            # Rounded bottom cap
            cv2.circle(frame, (x_left + radius, y_bottom - radius), radius, base_color, -1)
            cv2.circle(frame, (x_right - radius, y_bottom - radius), radius, base_color, -1)
            cv2.rectangle(frame, (x_left + radius, y_bottom - radius * 2), (x_right - radius, y_bottom), base_color, -1)

            # Subtle glow border
            cv2.rectangle(frame, (x_left, y_top + radius), (x_right, y_bottom - radius), glow_border, 1)

            # Draw note pitch badge (e.g. 'C#', 'G#') if bar is tall enough
            note_h = y_bottom - y_top
            if note_h >= 24:
                note_name = HandAnimator.get_note_name(note["pitch"])
                badge_cx = int((x_left + x_right) / 2)
                badge_cy = int(y_bottom - 11)
                badge_r = min(radius + 2, 8)

                # Badge background pill
                cv2.circle(frame, (badge_cx, badge_cy), badge_r, (15, 15, 20), -1)
                cv2.circle(frame, (badge_cx, badge_cy), badge_r, glow_border, 1, cv2.LINE_AA)
                
                # Badge text
                text_scale = 0.32 if len(note_name) > 1 else 0.36
                text_size = cv2.getTextSize(note_name, cv2.FONT_HERSHEY_SIMPLEX, text_scale, 1)[0]
                tx = badge_cx - text_size[0] // 2
                ty = badge_cy + text_size[1] // 2
                cv2.putText(frame, note_name, (tx, ty), cv2.FONT_HERSHEY_SIMPLEX, text_scale, (255, 255, 255), 1, cv2.LINE_AA)

            # Spark glow when hitting strike line
            if start_t <= current_time <= end_t:
                spark_color = (255, 255, 255)
                cv2.rectangle(frame, (x_left - 1, self.strike_y - 6), (x_right + 1, self.strike_y + 2), spark_color, -1)

        # 4. Draw 88-Key Piano Keyboard with Octave Labels
        self._render_keyboard(frame, active_midi)

        # 5. Animate & Draw Anime Hands with Soft Drop Shadows
        self.hand_animator.update_positions(active_notes, self.key_geometry, dt)
        self.hand_animator.draw_hands(frame)

        # 6. Draw Pedal Indicator & Neon Strike Line
        self.hand_animator.draw_pedal_and_decorations(frame, has_pedal=True)

        return frame

    def _render_keyboard(self, frame: np.ndarray, active_midi: Dict[int, Any]):
        """
        Renders the 88-key piano keyboard with realistic white/black keys,
        active key illumination, and octave subtitle markers (C1, C2, etc.).
        """
        # Keyboard chassis
        cv2.rectangle(frame, (0, self.keyboard_top), (self.width, self.keyboard_bottom), (12, 12, 16), -1)

        # 1. White Keys
        for key in self.white_keys:
            midi = key["midi"]
            is_active = (midi in active_midi)
            x1, x2 = key["x_left"], key["x_right"]
            y1, y2 = key["top"], key["bottom"]

            if is_active:
                note = active_midi[midi]
                is_right = (note.get("hand") == "right")
                # Active highlight glow
                key_color = (250, 220, 130) if is_right else (180, 235, 140)
                border_color = (255, 255, 255)
            else:
                key_color = (242, 242, 245)      # Clean ivory
                border_color = (130, 130, 138)   # Key divider

            cv2.rectangle(frame, (x1, y1), (x2, y2), key_color, -1)
            cv2.rectangle(frame, (x1, y1), (x2, y2), border_color, 1)
            # Bottom beveled edge
            bevel_color = key_color if is_active else (190, 190, 195)
            cv2.rectangle(frame, (x1, y2 - 6), (x2, y2), bevel_color, -1)

            # Octave marker (C1, C2, ..., C8)
            octave_label = HandAnimator.is_c_key(midi)
            if octave_label:
                # Draw subtle gray octave text near bottom of key
                text_size = cv2.getTextSize(octave_label, cv2.FONT_HERSHEY_SIMPLEX, 0.36, 1)[0]
                tx = int((x1 + x2) / 2 - text_size[0] / 2)
                ty = y2 - 14
                cv2.putText(frame, octave_label, (tx, ty), cv2.FONT_HERSHEY_SIMPLEX, 0.36, (140, 140, 150), 1, cv2.LINE_AA)

        # 2. Black Keys (overlay on top of white keys)
        for key in self.black_keys:
            midi = key["midi"]
            is_active = (midi in active_midi)
            x1, x2 = key["x_left"], key["x_right"]
            y1, y2 = key["top"], key["bottom"]

            if is_active:
                note = active_midi[midi]
                is_right = (note.get("hand") == "right")
                b_color = (240, 180, 50) if is_right else (120, 210, 80)
                border_color = (255, 255, 255)
            else:
                b_color = (22, 22, 26)           # Deep ebony
                border_color = (48, 48, 54)

            # Drop shadow under black key
            cv2.rectangle(frame, (x1 - 1, y1), (x2 + 2, y2 + 4), (10, 10, 12), -1)
            # Black key body
            cv2.rectangle(frame, (x1, y1), (x2, y2), b_color, -1)
            cv2.rectangle(frame, (x1, y1), (x2, y2), border_color, 1)
            # Top highlight sheen
            if not is_active:
                cv2.rectangle(frame, (x1 + 1, y1 + 1), (x2 - 1, y1 + 8), (55, 55, 62), -1)
