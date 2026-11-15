import os
import shutil
from pathlib import Path
from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parent.parent.parent
PROJECT_ROOT = BASE_DIR.parent

class Settings(BaseSettings):
    PROJECT_NAME: str = "AI Piano Video Generator"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api"
    
    # Storage Directories
    UPLOAD_DIR: Path = BASE_DIR / "uploads"
    OUTPUT_DIR: Path = BASE_DIR / "outputs"
    TEMP_DIR: Path = BASE_DIR / "temp"
    SOUNDFONT_DIR: Path = PROJECT_ROOT / "soundfonts"
    MODELS_DIR: Path = PROJECT_ROOT / "models"
    
    # SoundFont config
    DEFAULT_SOUNDFONT: Path = SOUNDFONT_DIR / "SalC5Light2.sf2"
    
    # Constraints
    MAX_VIDEO_DURATION_SECONDS: float = 600.0  # 10 minutes maximum
    MAX_UPLOAD_SIZE_MB: int = 500  # 500 MB
    ALLOWED_EXTENSIONS: set = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"}
    
    # Rendering config
    RENDER_WIDTH: int = 1280
    RENDER_HEIGHT: int = 720
    RENDER_FPS: int = 30
    RENDER_VIDEO_CODEC: str = "libx264"
    RENDER_AUDIO_CODEC: str = "aac"
    RENDER_AUDIO_BITRATE: str = "192k"
    
    # Database
    DATABASE_URL: str = f"sqlite:///{BASE_DIR / 'piano_generator.db'}"

    # External Tools Resolution
    @property
    def ffmpeg_bin(self) -> str:
        # Check standard PATH first
        ff = shutil.which("ffmpeg")
        if ff:
            return ff
        # Check known Winget install path on Windows
        winget_ff = Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "WinGet" / "Packages"
        for p in winget_ff.glob("**/ffmpeg.exe"):
            return str(p)
        return "ffmpeg"

    @property
    def ffprobe_bin(self) -> str:
        ff = shutil.which("ffprobe")
        if ff:
            return ff
        winget_ff = Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "WinGet" / "Packages"
        for p in winget_ff.glob("**/ffprobe.exe"):
            return str(p)
        return "ffprobe"

    @property
    def fluidsynth_bin(self) -> str:
        fs = shutil.which("fluidsynth")
        if fs:
            return fs
        # Check local custom directory if installed
        custom_fs = Path("C:/Users/user/fluidsynth")
        for p in custom_fs.glob("**/fluidsynth.exe"):
            return str(p)
        return "fluidsynth"

    class Config:
        env_file = ".env"
        extra = "allow"

settings = Settings()

# Ensure directories exist
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
settings.OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
settings.TEMP_DIR.mkdir(parents=True, exist_ok=True)
settings.SOUNDFONT_DIR.mkdir(parents=True, exist_ok=True)
settings.MODELS_DIR.mkdir(parents=True, exist_ok=True)
