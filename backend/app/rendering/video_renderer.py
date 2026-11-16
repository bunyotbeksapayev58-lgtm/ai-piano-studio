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

THEME_PALETTES: Dict[str, Dict[str, Any]] = {
    "falling_note_anime": {
        "name": "Falling Note Anime",
        "right_color": (248, 189, 56),      # BGR: #38bdf8 (Sky Blue)
        "right_glow": (255, 230, 160),
        "left_color": (129, 185, 16),       # BGR: #10b981 (Emerald Green)
        "left_glow": (180, 240, 100),
        "bg_top": (13, 8, 6),
        "bg_bottom": (25, 16, 11),
        "pedal_color": (255, 180, 80)
    },
    "cyberpunk_neon": {
        "name": "Cyberpunk Neon",
        "right_color": (142, 63, 244),      # BGR: #f43f8e (Neon Pink/Magenta)
        "right_glow": (200, 140, 255),
        "left_color": (212, 182, 6),        # BGR: #06b6d4 (Cyber Cyan)
        "left_glow": (245, 225, 100),
        "bg_top": (25, 10, 15),
        "bg_bottom": (40, 15, 25),
        "pedal_color": (220, 60, 240)
    },
    "royal_gold": {
        "name": "Royal Gold & Ebony",
        "right_color": (11, 158, 245),      # BGR: #f59e0b (Radiant Amber Gold)
        "right_glow": (100, 210, 255),
        "left_color": (36, 191, 251),       # BGR: #fbbf24 (Warm Platinum Gold)
        "left_glow": (120, 225, 255),
        "bg_top": (10, 10, 14),
        "bg_bottom": (18, 16, 24),
        "pedal_color": (40, 180, 250)
    },
    "emerald_nature": {
        "name": "Emerald Nature",
        "right_color": (166, 184, 20),      # BGR: #14b8a6 (Teal Mint)
        "right_glow": (210, 235, 120),
        "left_color": (94, 197, 34),        # BGR: #22c55e (Forest Green)
        "left_glow": (150, 245, 110),
        "bg_top": (10, 18, 10),
        "bg_bottom": (15, 28, 18),
        "pedal_color": (120, 240, 140)
    },
    "sunset_lofi": {
        "name": "Sunset Lo-Fi",
        "right_color": (133, 113, 251),     # BGR: #fb7185 (Peach Coral)
        "right_glow": (180, 170, 255),
        "left_color": (252, 132, 192),      # BGR: #c084fc (Lavender Orchid)
        "left_glow": (255, 180, 230),
        "bg_top": (20, 12, 22),
        "bg_bottom": (35, 20, 38),
        "pedal_color": (180, 120, 240)
    },
    "synthesia_pro": {
        "name": "Synthesia Pro",
        "right_color": (235, 99, 37),       # BGR: #2563eb (Royal Blue)
        "right_glow": (255, 180, 120),
        "left_color": (22, 204, 132),       # BGR: #84cc16 (Lime Green)
        "left_glow": (80, 240, 180),
        "bg_top": (8, 8, 8),
        "bg_bottom": (16, 16, 16),
        "pedal_color": (100, 200, 255)
    }
}

class VideoRenderer:
    def __init__(
        self,
        width: int = 1280,
        height: int = 720,
        fps: int = 30,
        lookahead_seconds: float = 3.0,
        theme: str = "falling_note_anime",
        hands_style: str = "anime"
    ):
        self.width = width
        self.height = height
        self.fps = fps
        self.lookahead = lookahead_seconds
        self.theme_key = theme if theme in THEME_PALETTES else "falling_note_anime"
        self.palette = THEME_PALETTES[self.theme_key]
        self.hands_style = hands_style
        
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
            keyboard_bottom=self.keyboard_bottom,
            hands_style=self.hands_style
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
        Renders the complete 720p 30fps Falling Note MP4 video using direct rawvideo pipe to FFmpeg.
        """
        output_mp4_path.parent.mkdir(parents=True, exist_ok=True)
        notes = MidiGenerator.read_midi_notes(midi_path)
        if not notes:
            logger.warning("MIDI has no notes; rendering empty piano track.")

        # Determine total duration from audio or notes
        total_duration = 0.0
        if synth_audio_path.exists():
            try:
                import soundfile as sf
                info = sf.info(str(synth_audio_path))
                total_duration = info.duration
            except Exception:
                pass
        
        if total_duration <= 0.0 and notes:
            total_duration = max(n["end_time"] for n in notes) + 2.0
        if total_duration <= 0.0:
            total_duration = 5.0

        total_frames = int(total_duration * self.fps)
        logger.info(f"Rendering {total_frames} frames ({total_duration:.2f}s) at {self.fps}fps [{self.theme_key}]...")

        # FFmpeg command for direct stdin rawvideo stream
        ffmpeg_cmd = [
            settings.ffmpeg_bin,
            "-y",
            "-f", "rawvideo",
            "-vcodec", "rawvideo",
            "-s", f"{self.width}x{self.height}",
            "-pix_fmt", "bgr24",
            "-r", str(self.fps),
            "-i", "-",  # Read frames from stdin pipe
            "-i", str(synth_audio_path),
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "20",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "192k",
            "-shortest",
            "-movflags", "+faststart",
            str(output_mp4_path)
        ]

        proc = subprocess.Popen(
            ffmpeg_cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=10**7
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
        Renders a single frame at current_time with chosen theme aesthetic:
        - Deep gradient background
        - Rounded falling note bars with musical pitch badges
        - Glowing 88-key piano keyboard with octave indicators
        - Animated anime hands with soft drop shadows and finger kinematics
        - Elegant 'Ped.' indicator and neon strike bloom
        """
        # 1. Dark Gradient Background
        frame = np.zeros((self.height, self.width, 3), dtype=np.uint8)
        bg_t = self.palette["bg_top"]
        bg_b = self.palette["bg_bottom"]
        for y in range(self.keyboard_top):
            factor = y / float(self.keyboard_top)
            b = int(bg_t[0] + factor * (bg_b[0] - bg_t[0]))
            g = int(bg_t[1] + factor * (bg_b[1] - bg_t[1]))
            r = int(bg_t[2] + factor * (bg_b[2] - bg_t[2]))
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
        visible_notes.sort(key=lambda n: n["start_time"])

        right_col = self.palette["right_color"]
        right_glow = self.palette["right_glow"]
        left_col = self.palette["left_color"]
        left_glow = self.palette["left_glow"]

        for note in visible_notes:
            start_t = note["start_time"]
            end_t = note["end_time"]
            geom = self.key_geometry.get(note["pitch"])
            if not geom:
                continue

            y_bottom = self.strike_y - int(((start_t - current_time) / self.lookahead) * self.strike_y)
            y_top = self.strike_y - int(((end_t - current_time) / self.lookahead) * self.strike_y)

            y_bottom = min(self.strike_y, y_bottom)
            y_top = max(0, y_top)

            if y_bottom <= y_top:
                continue

            x_left = geom["x_left"] + 2
            x_right = geom["x_right"] - 2
            if x_right <= x_left:
                x_right = x_left + 2
            note_w = x_right - x_left
            radius = min(note_w // 2, 7)

            is_right = (note.get("hand") == "right")
            base_color = right_col if is_right else left_col
            glow_border = right_glow if is_right else left_glow

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
        self.hand_animator.draw_pedal_and_decorations(
            frame,
            has_pedal=True,
            pedal_color=self.palette.get("pedal_color", (255, 180, 80))
        )

        return frame

    def _render_keyboard(self, frame: np.ndarray, active_midi: Dict[int, Any]):
        """
        Renders the 88 piano keys (52 white keys, 36 black keys) with octave labels and active key illumination.
        """
        # Keyboard dark frame background
        cv2.rectangle(frame, (0, self.keyboard_top), (self.width, self.keyboard_bottom), (10, 10, 14), -1)

        right_col = self.palette["right_color"]
        left_col = self.palette["left_color"]

        # Draw White Keys first
        for key in self.white_keys:
            midi = key["midi"]
            is_active = midi in active_midi
            xl = key["x_left"]
            xr = key["x_right"]
            yt = key["top"]
            yb = key["bottom"]

            if is_active:
                note_obj = active_midi[midi]
                fill_color = right_col if note_obj.get("hand") == "right" else left_col
            else:
                fill_color = (242, 242, 244)  # Ivory white

            cv2.rectangle(frame, (xl + 1, yt), (xr - 1, yb), fill_color, -1)
            cv2.line(frame, (xl, yt), (xl, yb), (35, 35, 42), 1)

            # Draw octave label on C keys (C1, C2, C3, C4, C5, C6, C7, C8)
            c_label = HandAnimator.is_c_key(midi)
            if c_label:
                text_scale = 0.36
                text_size = cv2.getTextSize(c_label, cv2.FONT_HERSHEY_SIMPLEX, text_scale, 1)[0]
                label_x = int((xl + xr) / 2) - text_size[0] // 2
                label_y = yb - 8
                text_color = (60, 60, 70) if not is_active else (255, 255, 255)
                cv2.putText(frame, c_label, (label_x, label_y), cv2.FONT_HERSHEY_SIMPLEX, text_scale, text_color, 1, cv2.LINE_AA)

        # Draw Black Keys over white keys
        for key in self.black_keys:
            midi = key["midi"]
            is_active = midi in active_midi
            xl = key["x_left"]
            xr = key["x_right"]
            yt = key["top"]
            yb = key["bottom"]

            if is_active:
                note_obj = active_midi[midi]
                fill_color = right_col if note_obj.get("hand") == "right" else left_col
            else:
                fill_color = (18, 18, 22)  # Ebony black

            cv2.rectangle(frame, (xl, yt), (xr, yb), fill_color, -1)
            # Black key bevel highlight
            if not is_active:
                cv2.rectangle(frame, (xl + 1, yt), (xr - 1, yb - 4), (32, 32, 38), 1)
