import cv2
import numpy as np
from typing import List, Dict, Any, Tuple, Optional

class HandAnimator:
    """
    Renders realistic, arched anime hands (Left and Right) playing the piano keyboard,
    with organic finger kinematics, inward tilt, key pressing, soft drop shadows, and fluid tracking.
    Also handles octave labels, note badges, and pedal indicator.
    """
    NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

    def __init__(self, width: int = 1280, height: int = 720, keyboard_top: int = 540, keyboard_bottom: int = 710):
        self.width = width
        self.height = height
        self.kb_top = keyboard_top
        self.kb_bottom = keyboard_bottom
        self.strike_y = keyboard_top - 2

        # Default resting positions
        self.lh_x = 380.0
        self.rh_x = 820.0

        # Finger press states (0.0 = relaxed, 1.0 = fully depressed)
        # Order: [Thumb, Index, Middle, Ring, Pinky]
        self.lh_press = [0.0] * 5
        self.rh_press = [0.0] * 5

        # Colors in BGR (OpenCV format) - Cell-shaded Anime Skin
        self.skin_base = (196, 214, 247)       # #F7D6C4 Anime warm peach
        self.skin_shadow = (145, 162, 215)     # #D7A291 Natural shadow tone
        self.skin_highlight = (235, 243, 255)  # Light sheen
        self.outline = (62, 66, 110)           # #6E423E Soft dark contour
        self.nail_color = (220, 230, 253)      # Subtle pearl nail highlight

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
            # Left Hand: Thumb is Right (+), Pinky is Left (-)
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
            # Right Hand: Thumb is Left (-), Pinky is Right (+)
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
            target_rh_x = 820.0
            self.rh_press = [max(0.0, p - dt * 4.5) for p in self.rh_press]

        # Fluid spring smoothing
        smooth = min(1.0, dt * 14.0)
        self.lh_x += (target_lh_x - self.lh_x) * smooth
        self.rh_x += (target_rh_x - self.rh_x) * smooth

        self.lh_x = float(np.clip(self.lh_x, 80, self.width - 80))
        self.rh_x = float(np.clip(self.rh_x, 80, self.width - 80))

    def draw_hands(self, frame: np.ndarray):
        """
        Draws soft drop shadows on keys followed by angled, arched anime hands.
        """
        # 1. Soft blurred drop shadow layer
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

    def draw_pedal_and_decorations(self, frame: np.ndarray, has_pedal: bool = True):
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
                cv2.FONT_HERSHEY_COMPLEX_SMALL, 1.3, (180, 100, 30), 4, cv2.LINE_AA
            )
            cv2.putText(
                frame, "Ped.", (28, self.kb_bottom - 22),
                cv2.FONT_HERSHEY_COMPLEX_SMALL, 1.3, (255, 220, 120), 2, cv2.LINE_AA
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
        Draws an arched anime hand with natural perspective angle:
        Left hand tilts inwards (+12 deg), Right hand tilts inwards (-12 deg).
        """
        # Inward angle (radians)
        angle = np.radians(11.0 if is_left else -11.0)
        cos_a = np.cos(angle)
        sin_a = np.sin(angle)

        def transform_pt(x: float, y: float) -> Tuple[int, int]:
            # Rotate around (cx, y_pivot)
            y_pivot = float(self.kb_top + 115)
            rel_x = x - cx
            rel_y = y - y_pivot
            rx = rel_x * cos_a - rel_y * sin_a + cx
            ry = rel_x * sin_a + rel_y * cos_a + y_pivot
            if is_shadow:
                # Shadow offset: upwards onto the keys
                ry -= 28.0
                rx += (5.0 if is_left else -5.0)
            return (int(np.clip(rx, 0, self.width - 1)), int(np.clip(ry, 0, self.height - 1)))

        color = 255 if is_shadow else self.skin_base
        shadow_c = 255 if is_shadow else self.skin_shadow
        line_c = 255 if is_shadow else self.outline

        y_wrist = self.height + 30
        y_knuckle = self.kb_top + 106

        # Palm points
        half_palm = 40.0
        wrist_w = 32.0

        palm_raw = [
            (cx - wrist_w - 4, y_wrist),
            (cx - half_palm - 6, y_knuckle + 18),
            (cx - half_palm, y_knuckle + 8),
            (cx, y_knuckle - 2),
            (cx + half_palm, y_knuckle + 8),
            (cx + half_palm + 6, y_knuckle + 18),
            (cx + wrist_w + 4, y_wrist)
        ]
        palm_poly = np.array([transform_pt(px, py) for px, py in palm_raw], dtype=np.int32)
        cv2.fillPoly(dest, [palm_poly], color)
        if not is_shadow:
            cv2.polylines(dest, [palm_poly], False, line_c, 2, cv2.LINE_AA)

        # Finger definitions:
        # Order: 0=Thumb, 1=Index, 2=Middle, 3=Ring, 4=Pinky
        # Thumb rests lower down (natural piano thumb pose), Middle reaches deepest
        finger_offsets = [
            -6 + press[0] * 12,   # Thumb: rests lower down on white keys
            -42 + press[1] * 14,  # Index
            -50 + press[2] * 16,  # Middle (longest)
            -40 + press[3] * 14,  # Ring
            -26 + press[4] * 12   # Pinky
        ]

        if is_left:
            # Left Hand: Thumb right (+), Pinky left (-)
            kx = [cx + 28, cx + 18, cx - 1, cx - 18, cx - 34]
            tx = [cx + 44, cx + 22, cx - 1, cx - 21, cx - 39]
            bends = [8.0, 2.5, 0.0, -2.5, -6.0]
        else:
            # Right Hand: Thumb left (-), Pinky right (+)
            kx = [cx - 28, cx - 18, cx + 1, cx + 18, cx + 34]
            tx = [cx - 44, cx - 22, cx + 1, cx + 21, cx + 39]
            bends = [-8.0, -2.5, 0.0, 2.5, 6.0]

        # Draw fingers
        for i in range(5):
            base_x = kx[i]
            base_y = y_knuckle + 6
            tip_x = tx[i]
            tip_y = self.kb_top + 68 + finger_offsets[i]

            w_b = 9.0 if i != 0 else 11.5
            w_t = 7.0 if i != 0 else 8.5
            bend = bends[i]

            dx = tip_x - base_x
            dy = tip_y - base_y
            len_f = np.hypot(dx, dy)
            if len_f == 0: continue
            ux, uy = dx / len_f, dy / len_f
            px, py = -uy, ux

            # 7-point curved finger profile
            raw_pts = [
                (base_x - px * w_b, base_y - py * w_b),
                (base_x + dx * 0.45 - px * (w_b * 0.9) + px * bend, base_y + dy * 0.45 - py * (w_b * 0.9) + py * bend),
                (tip_x - px * w_t, tip_y - py * w_t),
                (tip_x + ux * (w_t * 0.6), tip_y + uy * (w_t * 0.6)),
                (tip_x + px * w_t, tip_y + py * w_t),
                (base_x + dx * 0.45 + px * (w_b * 0.9) + px * bend, base_y + dy * 0.45 + py * (w_b * 0.9) + py * bend),
                (base_x + px * w_b, base_y + py * w_b),
            ]
            finger_poly = np.array([transform_pt(rx, ry) for rx, ry in raw_pts], dtype=np.int32)
            cv2.fillPoly(dest, [finger_poly], color)

            if not is_shadow:
                # Joint creases
                mid_x = (base_x + tip_x) / 2.0 + px * bend * 0.5
                mid_y = (base_y + tip_y) / 2.0 + py * bend * 0.5
                p1 = transform_pt(mid_x - px * (w_b * 0.6), mid_y - py * (w_b * 0.6))
                p2 = transform_pt(mid_x + px * (w_b * 0.6), mid_y + py * (w_b * 0.6))
                cv2.line(dest, p1, p2, shadow_c, 1, cv2.LINE_AA)

                # Fingernail
                nail_raw = [
                    (tip_x - px * 3.5, tip_y - py * 3.5 + 3),
                    (tip_x + ux * 2, tip_y + uy * 2),
                    (tip_x + px * 3.5, tip_y + py * 3.5 + 3),
                    (tip_x, tip_y + 5)
                ]
                nail_poly = np.array([transform_pt(nx, ny) for nx, ny in nail_raw], dtype=np.int32)
                cv2.fillPoly(dest, [nail_poly], self.nail_color)

                cv2.polylines(dest, [finger_poly], True, line_c, 2, cv2.LINE_AA)

        # Palm crease line
        if not is_shadow:
            crease_raw = [
                (cx - 14 if is_left else cx + 14, y_knuckle + 22),
                (cx - 3 if is_left else cx + 3, y_knuckle + 46),
                (cx + 10 if is_left else cx - 10, y_knuckle + 70)
            ]
            crease_poly = np.array([transform_pt(px, py) for px, py in crease_raw], dtype=np.int32)
            cv2.polylines(dest, [crease_poly], False, shadow_c, 1, cv2.LINE_AA)
