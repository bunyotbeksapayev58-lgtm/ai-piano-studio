from typing import List, Dict, Any
from app.transcription.base import DetectedNote

class HandAssigner:
    """
    Intelligent heuristic for partitioning piano notes into Left Hand (bass/accompaniment)
    and Right Hand (melody/treble).
    
    Limitation:
    Music transcription cannot visually see the pianist's physical hands. This heuristic uses
    pitch registers, simultaneous chord voicing, interval spans, and voice-leading continuity.
    Piece with complex cross-hand passages or voice crossings may require manual adjustment
    in the downloaded MIDI.
    """

    @staticmethod
    def assign_hands(notes: List[DetectedNote]) -> List[DetectedNote]:
        if not notes:
            return notes

        # Sort chronologically by start_time, then ascending pitch
        sorted_notes = sorted(notes, key=lambda n: (n.start_time, n.pitch))

        # Time clustering window (e.g. notes starting within 50ms are considered simultaneous/chord)
        time_tolerance = 0.05
        time_clusters: List[List[DetectedNote]] = []
        
        current_cluster: List[DetectedNote] = []
        cluster_start = -1.0

        for note in sorted_notes:
            if not current_cluster:
                current_cluster.append(note)
                cluster_start = note.start_time
            elif abs(note.start_time - cluster_start) <= time_tolerance:
                current_cluster.append(note)
            else:
                time_clusters.append(current_cluster)
                current_cluster = [note]
                cluster_start = note.start_time

        if current_cluster:
            time_clusters.append(current_cluster)

        # Track recent hand state
        last_lh_pitch = 48  # C3
        last_rh_pitch = 72  # C5

        for cluster in time_clusters:
            if len(cluster) == 1:
                note = cluster[0]
                pitch = note.pitch
                if pitch < 53:  # Below F3 -> Left Hand
                    note.hand = "left"
                    note.channel = 1
                    last_lh_pitch = pitch
                elif pitch > 65:  # Above F4 -> Right Hand
                    note.hand = "right"
                    note.channel = 0
                    last_rh_pitch = pitch
                else:
                    # Ambiguous middle register (F3 to F4, MIDI 53..65)
                    # Decide by proximity to previous hand positions
                    dist_to_lh = abs(pitch - last_lh_pitch)
                    dist_to_rh = abs(pitch - last_rh_pitch)
                    if dist_to_lh < dist_to_rh and pitch <= 60:
                        note.hand = "left"
                        note.channel = 1
                        last_lh_pitch = pitch
                    else:
                        note.hand = "right"
                        note.channel = 0
                        last_rh_pitch = pitch
            else:
                # Multi-note chord or simultaneous polyphony
                # Sort cluster pitches ascending
                cluster.sort(key=lambda n: n.pitch)
                pitches = [n.pitch for n in cluster]
                min_p = pitches[0]
                max_p = pitches[-1]

                # If spread across hands (> 12 semitones or spans middle C)
                split_idx = 1
                best_gap = -1

                # Find the most natural gap between hands around middle C (MIDI 55..65)
                for i in range(len(pitches) - 1):
                    gap = pitches[i+1] - pitches[i]
                    p_mid = (pitches[i] + pitches[i+1]) / 2.0
                    # Bias gap towards middle register (around 58-62)
                    bias = 1.0 - (abs(p_mid - 60.0) / 40.0)
                    score = gap * max(0.2, bias)
                    if score > best_gap:
                        best_gap = score
                        split_idx = i + 1

                # If all notes are very high (> 64), entire chord is likely right hand
                if min_p >= 64:
                    for n in cluster:
                        n.hand = "right"
                        n.channel = 0
                    last_rh_pitch = sum(pitches) / len(pitches)
                # If all notes are very low (< 52), entire chord is likely left hand
                elif max_p <= 52:
                    for n in cluster:
                        n.hand = "left"
                        n.channel = 1
                    last_lh_pitch = sum(pitches) / len(pitches)
                else:
                    # Split into Left Hand (lower) and Right Hand (upper)
                    for i, n in enumerate(cluster):
                        if i < split_idx and n.pitch <= 65:
                            n.hand = "left"
                            n.channel = 1
                        else:
                            n.hand = "right"
                            n.channel = 0
                    
                    lh_notes = [n.pitch for n in cluster if n.hand == "left"]
                    rh_notes = [n.pitch for n in cluster if n.hand == "right"]
                    if lh_notes:
                        last_lh_pitch = sum(lh_notes) / len(lh_notes)
                    if rh_notes:
                        last_rh_pitch = sum(rh_notes) / len(rh_notes)

        return sorted_notes

    @staticmethod
    def generate_quality_report(notes: List[DetectedNote], duration: float, estimated_tempo: float) -> Dict[str, Any]:
        if not notes:
            return {
                "transcription_quality": "No notes detected",
                "confidence_score": 0.0,
                "note_count": 0,
                "notes_per_second": 0.0,
                "estimated_tempo": estimated_tempo,
                "pitch_range": {"min_midi": 0, "max_midi": 0, "min_note": "N/A", "max_note": "N/A"},
                "hand_distribution": {"right_hand_notes": 0, "left_hand_notes": 0, "right_hand_pct": 0, "left_hand_pct": 0},
                "polyphony": {"max_simultaneous": 0, "average_simultaneous": 0.0},
                "hand_assignment_method": "Polyphonic register and voice-continuity heuristic",
                "limitation_notice": "Hand separation is an algorithmic estimate based on pitch register and voice leading."
            }

        pitches = [n.pitch for n in notes]
        right_notes = sum(1 for n in notes if n.hand == "right")
        left_notes = sum(1 for n in notes if n.hand == "left")

        # Note name mapping (MIDI 21 = A0, 60 = C4, 108 = C8)
        note_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
        def midi_to_name(m: int) -> str:
            octave = (m // 12) - 1
            name = note_names[m % 12]
            return f"{name}{octave}"

        # Polyphony evaluation
        times = []
        for n in notes:
            times.append((n.start_time, 1))
            times.append((n.end_time, -1))
        times.sort(key=lambda x: (x[0], -x[1]))

        curr_poly = 0
        max_poly = 0
        poly_samples = []
        for t, change in times:
            curr_poly += change
            max_poly = max(max_poly, curr_poly)
            if change > 0:
                poly_samples.append(curr_poly)

        avg_poly = sum(poly_samples) / max(1, len(poly_samples))
        avg_confidence = sum(n.confidence for n in notes) / len(notes)

        # Quality tier
        if len(notes) > 10 and avg_poly >= 1.0:
            quality_label = "High Precision Polyphonic"
        elif len(notes) > 0:
            quality_label = "Monophonic / Melodic"
        else:
            quality_label = "Low Confidence"

        return {
            "transcription_quality": quality_label,
            "confidence_score": round(avg_confidence, 2),
            "note_count": len(notes),
            "notes_per_second": round(len(notes) / max(0.1, duration), 2),
            "estimated_tempo": round(estimated_tempo, 1),
            "pitch_range": {
                "min_midi": min(pitches),
                "max_midi": max(pitches),
                "min_note": midi_to_name(min(pitches)),
                "max_note": midi_to_name(max(pitches))
            },
            "hand_distribution": {
                "right_hand_notes": right_notes,
                "left_hand_notes": left_notes,
                "right_hand_pct": round(right_notes / len(notes) * 100, 1),
                "left_hand_pct": round(left_notes / len(notes) * 100, 1)
            },
            "polyphony": {
                "max_simultaneous": max_poly,
                "average_simultaneous": round(avg_poly, 1)
            },
            "hand_assignment_method": "Polyphonic register, simultaneous interval spacing, and voice-continuity heuristic",
            "limitation_notice": "Hand separation is an algorithmic estimate based on pitch register and voice leading. Complex cross-hand pieces may require manual adjustment in the exported MIDI."
        }
