from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List, Dict, Any

@dataclass
class DetectedNote:
    pitch: int            # MIDI pitch 21 (A0) to 108 (C8)
    start_time: float     # In seconds
    end_time: float       # In seconds
    duration: float       # In seconds
    velocity: int = 80    # 1 to 127
    confidence: float = 1.0
    hand: str = "right"   # "right" or "left"
    channel: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "pitch": self.pitch,
            "start_time": round(self.start_time, 3),
            "end_time": round(self.end_time, 3),
            "duration": round(self.duration, 3),
            "velocity": self.velocity,
            "confidence": round(self.confidence, 3),
            "hand": self.hand,
            "channel": self.channel
        }

@dataclass
class TranscriptionResult:
    notes: List[DetectedNote] = field(default_factory=list)
    tempo: float = 120.0
    duration: float = 0.0
    quality_report: Dict[str, Any] = field(default_factory=dict)

    @property
    def note_count(self) -> int:
        return len(self.notes)

class BaseTranscriber(ABC):
    @abstractmethod
    def transcribe(self, audio_path: str) -> TranscriptionResult:
        """
        Transcribes the given audio file into detected musical notes with timing.
        """
        pass
