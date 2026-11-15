from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import engine, Base
from app.api.auth import router as auth_router
from app.api.projects import router as projects_router

# Initialize all database tables (users and projects)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="AI Piano Studio API",
    version=settings.VERSION,
    description="Professional AI Piano Video Generator: Audio-to-MIDI transcription, piano sound synthesis, interactive MIDI editing, and 720p MP4 rendering."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api")
app.include_router(projects_router, prefix="/api")

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "AI Piano Studio",
        "version": settings.VERSION,
        "ffmpeg": settings.ffmpeg_bin,
        "ffprobe": settings.ffprobe_bin,
        "fluidsynth": settings.fluidsynth_bin,
        "soundfont_present": settings.DEFAULT_SOUNDFONT.exists()
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
