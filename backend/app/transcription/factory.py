import logging
from app.transcription.base import BaseTranscriber
from app.transcription.basic_pitch_transcriber import BasicPitchTranscriber
from app.transcription.spectral_transcriber import SpectralTranscriber

logger = logging.getLogger(__name__)

def get_transcriber(engine_type: str = "basic_pitch") -> BaseTranscriber:
    """
    Modular factory returning the requested transcription engine.
    Defaults to Spotify Basic Pitch, falls back gracefully to Spectral if needed.
    """
    if engine_type == "spectral":
        return SpectralTranscriber()
    
    try:
        return BasicPitchTranscriber()
    except Exception as e:
        logger.warning(f"Basic Pitch initialization failed ({e}), falling back to Spectral Transcriber.")
        return SpectralTranscriber()
