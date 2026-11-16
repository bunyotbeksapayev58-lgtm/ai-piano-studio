import cv2
import numpy as np
from typing import List, Dict, Any, Optional, Tuple

class HandAnimator:
    """
    Renders articulated anime/cyber hands playing the piano keys:
    - 5 curved articulated fingers per hand (Thumb, Index, Middle, Ring, Pinky).
    - Dynamic PIP/DIP knuckle articulation when pressing active notes.
    - Perspective-angled wrists tilted naturally towards the center of the keyboard.
    - Soft Gaussian drop shadow projected onto the white & black keys.
    - Supports multiple hand styles: 'anime', 'cyber_glow', and 'off'.
    """

    NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

    def __init__(
        self,
        width: int = 1280,
        height: int = 720,
        keyboard_top: int = 540,
        keyboard_bottom: int = 710,
        hands_style: str = "anime"
    ):
        self.width = width
        self.height = height
        self.kb_top = keyboard_top
        self.kb_bottom = keyboard_bottom
        self.strike_y = self.kb_top - 2
        self.hands_style = hands_style

        # Hand horizontal positions (smoothed via spring kinematics)
        self.lh_x = 380.0
        self.rh_x = 900.0

        # Finger press state (0.0=resting, 1.0=fully pressed down)
        self.lh_press = [0.0] * 5
        self.rh_press = [0.0] * 5

        # Color palette for anime hands
        self.skin_base = (196, 214, 247)       # #F7D6C4 Anime warm peach
        self.skin_shadow = (145, 162, 215)     # #D7A291 Natural shadow tone
        self.skin_highlight = (235, 243, 255)  # Light sheen
        self.outline = (62, 66, 110)           # #6E423E Soft dark contour
        self.nail_color = (220, 230, 253)      # Subtle pearl nail highlight

        # Color palette for cyber glow hands
        self.cyber_base = (45, 38, 40)
        self.cyber_outline = (255, 210, 60)    # Electric cyan
        self.cyber_pad = (230, 80, 240)        # Neon pink

    @staticmethod
    def get_note_name(pitch: int) -> str:
        return HandAnimator.NOTE_NAMES[pitch % 12]

    @staticmethod
    def is_c_key(pitch: int) -> Optional[str]:
        if pitch % 12 == 0:
            octave = (pitch // 12) - 1
            if 1 <= octave <= 8:
                return f"C{octave}"
        return None

    def update_positions(self, active_notes: List[Dict[str, Any]], key_geometry: Dict[int, Any], dt: float = 0.033):
        """
        Updates hand positions and finger presses based on active notes.
        Uses spring kinematics for natural organic movement.
        """
        lh_notes = [n for n in active_notes if n.get("hand") == "left"]
        rh_notes = [n for n in active_notes if n.get("hand") == "right"]

        # --- LEFT HAND UPDATE ---
        if lh_notes:
            xs = [key_geometry[n["pitch"]]["x_center"] for n in lh_notes if n["pitch"] in key_geometry]
            target_lh_x = float(np.mean(xs)) if xs else self.lh_x
            self.lh_press = [0.0] * 5
            for n in lh_notes:
                p = n["pitch"]
                geom = key_geometry.get(p)
                if not geom: continue
                diff = geom["x_center"] - self.lh_x
                if diff > 24:
                    self.lh_press[0] = 1.0  # Thumb
                elif diff > 8:
                    self.lh_press[1] = 1.0  # Index
                elif diff > -8:
                    self.lh_press[2] = 1.0  # Middle
                elif diff > -24:
                    self.lh_press[3] = 1.0  # Ring
                else:
                    self.lh_press[4] = 1.0  # Pinky
        else:
            target_lh_x = 380.0
            self.lh_press = [max(0.0, p - dt * 4.5) for p in self.lh_press]

        # --- RIGHT HAND UPDATE ---
        if rh_notes:
            xs = [key_geometry[n["pitch"]]["x_center"] for n in rh_notes if n["pitch"] in key_geometry]
            target_rh_x = float(np.mean(xs)) if xs else self.rh_x
            self.rh_press = [0.0] * 5
            for n in rh_notes:
                p = n["pitch"]
                geom = key_geometry.get(p)
                if not geom: continue
                diff = geom["x_center"] - self.rh_x
                if diff < -24:
                    self.rh_press[0] = 1.0  # Thumb
                elif diff < -8:
                    self.rh_press[1] = 1.0  # Index
                elif diff < 8:
                    self.rh_press[2] = 1.0  # Middle
                elif diff < 24:
                    self.rh_press[3] = 1.0  # Ring
                else:
                    self.rh_press[4] = 1.0  # Pinky
        else:
            target_rh_x = 900.0
            self.rh_press = [max(0.0, p - dt * 4.5) for p in self.rh_press]

        # Smooth position tracking (exponential spring)
        alpha = min(1.0, dt * 14.0)
        self.lh_x += (target_lh_x - self.lh_x) * alpha
        self.rh_x += (target_rh_x - self.rh_x) * alpha

        # Clamp positions within keyboard
        self.lh_x = max(110.0, min(self.width - 110.0, self.lh_x))
        self.rh_x = max(110.0, min(self.width - 110.0, self.rh_x))

    def draw_hands(self, frame: np.ndarray):
        """
        Draws left and right animated hands with soft blurred drop shadows.
        """
        if self.hands_style == "off":
            return

        # 1. Project soft drop shadow on keys
        shadow_layer = np.zeros((self.height, self.width), dtype=np.uint8)
        self._render_single_hand(shadow_layer, int(self.lh_x), is_left=True, is_shadow=True, press=self.lh_press)
        self._render_single_hand(shadow_layer, int(self.rh_x), is_left=False, is_shadow=True, press=self.rh_press)

        blurred_shadow = cv2.GaussianBlur(shadow_layer, (35, 35), 14)
        shadow_factor = (blurred_shadow.astype(np.float32) / 255.0) * 0.46

        # Blend shadow onto the keyboard
        for c in range(3):
            frame[:, :, c] = (frame[:, :, c] * (1.0 - shadow_factor)).astype(np.uint8)

        # 2. Draw actual stylized hand bodies
        self._render_single_hand(frame, int(self.lh_x), is_left=True, is_shadow=False, press=self.lh_press)
        self._render_single_hand(frame, int(self.rh_x), is_left=False, is_shadow=False, press=self.rh_press)

    def draw_pedal_and_decorations(self, frame: np.ndarray, has_pedal: bool = True, pedal_color: Tuple[int, int, int] = (255, 180, 80)):
        """
        Draws glowing strike beam and neon 'Ped.' indicator.
        """
        # Neon strike line bloom (cyan/white glow)
        glow_color = (255, 230, 180)
        cv2.line(frame, (0, self.strike_y), (self.width, self.strike_y), (255, 255, 255), 2, cv2.LINE_AA)
        cv2.line(frame, (0, self.strike_y - 1), (self.width, self.strike_y - 1), glow_color, 1, cv2.LINE_AA)
        cv2.line(frame, (0, self.strike_y + 1), (self.width, self.strike_y + 1), glow_color, 1, cv2.LINE_AA)

        if has_pedal:
            cv2.putText(
                frame, "Ped.", (28, self.kb_bottom - 22),
                cv2.FONT_HERSHEY_COMPLEX_SMALL, 1.3, (40, 30, 60), 4, cv2.LINE_AA
            )
            cv2.putText(
                frame, "Ped.", (28, self.kb_bottom - 22),
                cv2.FONT_HERSHEY_COMPLEX_SMALL, 1.3, pedal_color, 2, cv2.LINE_AA
            )

    def _render_single_hand(
        self,
        dest: np.ndarray,
        cx: int,
        is_left: bool,
        is_shadow: bool,
        press: List[float]
    ):
        """
        Draws palm and 5 curved fingers with natural perspective tilt.
        """
        is_cyber = (self.hands_style == "cyber_glow")
        fill_color = 255 if is_shadow else (self.cyber_base if is_cyber else self.skin_base)
        outline_color = 255 if is_shadow else (self.cyber_outline if is_cyber else self.outline)

        # Natural perspective tilt: wrists tilt slightly inwards towards the piano center
        tilt_deg = 11.0 if is_left else -11.0
        tilt_rad = np.radians(tilt_deg)
        cos_t, sin_t = np.cos(tilt_rad), np.sin(tilt_rad)

        wrist_y = self.height + 40
        palm_center_y = self.kb_bottom + 12

        # Shadow offset upward and slightly blurred onto keys
        y_shift = -30 if is_shadow else 0
        x_shift = -8 if (is_shadow and is_left) else (8 if is_shadow else 0)

        # 5 Fingers: [Thumb, Index, Middle, Ring, Pinky]
        finger_specs = [
            {"base_dx": 38 if is_left else -38, "base_dy": 20, "length": 52, "w": 12, "pip": 0.50},
            {"base_dx": 18 if is_left else -18, "base_dy": -10, "length": 68, "w": 11, "pip": 0.58},
            {"base_dx": 0,                      "base_dy": -14, "length": 76, "w": 11.5, "pip": 0.60},
            {"base_dx": -18 if is_left else 18, "base_dy": -10, "length": 70, "w": 10.5, "pip": 0.58},
            {"base_dx": -36 if is_left else 36, "base_dy": 6,   "length": 56, "w": 9.5, "pip": 0.54},
        ]

        # Draw fingers from Pinky to Thumb
        draw_order = [4, 3, 2, 1, 0] if is_left else [4, 3, 2, 1, 0]

        for f_idx in draw_order:
            spec = finger_specs[f_idx]
            p_val = press[f_idx]

            # Knuckle root on palm
            kx = cx + spec["base_dx"] * cos_t - spec["base_dy"] * sin_t + x_shift
            ky = palm_center_y + spec["base_dx"] * sin_t + spec["base_dy"] * cos_t + y_shift

            # Fingertip reaching towards keys (pressing extends forward and down)
            f_len = spec["length"] + (p_val * 7.0)
            pip_len = f_len * spec["pip"]

            # Tip extends upward towards keys
            tip_y = ky - f_len + (p_val * 4.0)
            pip_y = ky - pip_len + (p_val * 2.0)

            fx_offset = (spec["base_dx"] * 0.45)
            tip_x = kx + (fx_offset * 0.7)
            pip_x = kx + (fx_offset * 0.4)

            w = spec["w"]
            f_pts = np.array([
                [kx - w * 0.55, ky],
                [pip_x - w * 0.50, pip_y],
                [tip_x - w * 0.42, tip_y],
                [tip_x + w * 0.42, tip_y],
                [pip_x + w * 0.50, pip_y],
                [kx + w * 0.55, ky]
            ], dtype=np.int32)

            if is_shadow:
                cv2.fillPoly(dest, [f_pts], 255)
            else:
                cv2.fillPoly(dest, [f_pts], fill_color)
                cv2.polylines(dest, [f_pts], True, outline_color, 1, cv2.LINE_AA)

                if is_cyber:
                    # Neon fingertip pad
                    cv2.circle(dest, (int(tip_x), int(tip_y + 4)), int(w * 0.35), self.cyber_pad, -1)
                else:
                    # Pearl nail highlight on fingertip
                    nail_pts = np.array([
                        [tip_x - w * 0.30, tip_y + 2],
                        [tip_x + w * 0.30, tip_y + 2],
                        [tip_x + w * 0.22, tip_y + 9],
                        [tip_x - w * 0.22, tip_y + 9],
                    ], dtype=np.int32)
                    cv2.fillPoly(dest, [nail_pts], self.nail_color)

                    # Subtle knuckle joint crease
                    cv2.line(dest, (int(pip_x - w * 0.35), int(pip_y)), (int(pip_x + w * 0.35), int(pip_y)), self.skin_shadow, 1, cv2.LINE_AA)

        # Draw Palm body
        palm_w = 48.0
        palm_pts = np.array([
            [cx - palm_w * cos_t + x_shift, palm_center_y - 10 + y_shift],
            [cx + palm_w * cos_t + x_shift, palm_center_y - 10 + y_shift],
            [cx + (palm_w * 0.75) * cos_t + x_shift, wrist_y + y_shift],
            [cx - (palm_w * 0.75) * cos_t + x_shift, wrist_y + y_shift]
        ], dtype=np.int32)

        if is_shadow:
            cv2.fillPoly(dest, [palm_pts], 255)
        else:
            cv2.fillPoly(dest, [palm_pts], fill_color)
            cv2.polylines(dest, [palm_pts], True, outline_color, 1, cv2.LINE_AA)
            if not is_cyber:
                # Soft inner contour
                cv2.circle(dest, (int(cx + (12 if is_left else -12)), int(palm_center_y + 14)), 22, self.skin_shadow, 1, cv2.LINE_AA)
