# AI Piano Studio — REST API Documentation

This document provides complete technical specifications for all REST endpoints exposed by the **AI Piano Studio** FastAPI backend.

- **Base URL**: `http://127.0.0.1:8000` (or `http://localhost:8000`)
- **API Prefix**: `/api`
- **Interactive Swagger Documentation**: `http://127.0.0.1:8000/docs`
- **ReDoc Reference**: `http://127.0.0.1:8000/redoc`

---

## 1. System Health & Infrastructure

### `GET /health`
Verifies backend status and presence of external rendering and synthesis binaries.

- **Authentication**: None (Public)
- **Response `200 OK`**:
```json
{
  "status": "healthy",
  "service": "AI Piano Studio",
  "version": "1.0.0",
  "ffmpeg": "C:\\path\\to\\ffmpeg.exe",
  "ffprobe": "C:\\path\\to\\ffprobe.exe",
  "fluidsynth": "C:\\path\\to\\fluidsynth.exe",
  "soundfont_present": true
}
```

---

## 2. Authentication & User Management

### `POST /api/auth/register`
Creates a new user account with hashed password and generates an initial JWT session token.

- **Request Body (`application/json`)**:
```json
{
  "email": "user@example.com",
  "username": "pianist42",
  "password": "secretpassword"
}
```
- **Responses**:
  - `200 OK`:
  ```json
  {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "bearer",
    "user": {
      "id": "c1f7a048-26f4-4e2b-bbd0-379f82638a14",
      "email": "user@example.com",
      "username": "pianist42",
      "is_active": true,
      "created_at": "2026-11-15T12:00:00"
    }
  }
  ```
  - `400 Bad Request`: Email or username already registered, or password shorter than 6 characters.

### `POST /api/auth/login`
Authenticates a user via email/username and password.

- **Request Body (`application/json`)**:
```json
{
  "login": "pianist42",
  "password": "secretpassword"
}
```
- **Responses**:
  - `200 OK`: Returns `TokenResponse` with JWT access token and user profile.
  - `401 Unauthorized`: Invalid credentials.

### `GET /api/auth/me`
Retrieves current user identity from the Bearer token.

- **Headers**: `Authorization: Bearer <token>`
- **Responses**:
  - `200 OK`: Returns `UserResponse`.
  - `401 Unauthorized`: Missing or invalid token.

### `POST /api/auth/logout`
Terminates the active session.

- **Response `200 OK`**: `{"message": "Logged out successfully"}`

---

## 3. Project Management & Upload

### `POST /api/projects/upload`
Uploads a music video file for processing. Performs format validation (MP4, MOV, MKV, WEBM) and audio extraction.

- **Headers**: Optional `Authorization: Bearer <token>`
- **Request (`multipart/form-data`)**:
  - `file`: Media file binary (Max 500 MB)
- **Validation**:
  - Max duration: 600 seconds (10 minutes)
  - Must contain valid audio and video streams
- **Response `201 Created`**:
```json
{
  "id": "e4f8e5c3-a309-4bf9-90d5-7b3c22cf7b02",
  "filename": "piano_performance.mp4",
  "file_size": 15420310,
  "duration_seconds": 124.5,
  "status": "UPLOADED",
  "progress_percent": 0.0,
  "current_step": 1,
  "status_message": "Video uploaded successfully. Ready for transcription.",
  "error_message": null,
  "note_count": 0,
  "tempo": 0.0,
  "quality_metrics": {},
  "created_at": "2026-11-15T12:05:00",
  "updated_at": "2026-11-15T12:05:00",
  "has_audio": true,
  "has_midi": false,
  "has_synth_audio": false,
  "has_rendered_video": false
}
```

### `GET /api/projects`
Lists all projects accessible to the caller (user's projects or all projects if unauthenticated guest).

- **Headers**: Optional `Authorization: Bearer <token>`
- **Response `200 OK`**: Array of `ProjectResponse` objects.

### `GET /api/projects/stats`
Aggregates platform usage metrics, project statuses, and disk space usage.

- **Headers**: Optional `Authorization: Bearer <token>`
- **Response `200 OK`**:
```json
{
  "total_projects": 12,
  "completed_projects": 10,
  "processing_projects": 1,
  "failed_projects": 1,
  "total_storage_mb": 42.15,
  "storage_limit_mb": 5000.0
}
```

### `GET /api/projects/{id}/status`
Polls the real-time processing status of a project across the 10 pipeline stages.

- **Path Parameter**: `id` (Project UUID)
- **Response `200 OK`**: Full `ProjectResponse` including `status`, `progress_percent`, `current_step` (1–10), and `status_message`.

### `PATCH /api/projects/{id}`
Updates project title or visual settings.

- **Request Body (`application/json`)**:
```json
{
  "title": "Chopin Nocturne in C# Minor",
  "visual_settings": {
    "theme": "violet",
    "lookahead_seconds": 3.0,
    "bloom": true
  }
}
```
- **Response `200 OK`**: Updated `ProjectResponse`.

### `DELETE /api/projects/{id}`
Permanently deletes the project and associated disk artifacts (`.mp4`, `.wav`, `.mid`).

- **Response `200 OK`**: `{"message": "Project deleted successfully", "project_id": "..."}`

---

## 4. Processing & Pipeline Triggers

### `POST /api/projects/{id}/analyze`
Initiates the asynchronous 10-stage processing pipeline.

- **Query Parameters**:
  - `auto_render` (bool, default: `true`): Automatically proceeds to 720p 30fps video rendering after audio synthesis.
- **Pipeline Stages**:
  1. `UPLOADED` (0%)
  2. `INSPECTING_MEDIA` (12%)
  3. `EXTRACTING_AUDIO` (25%)
  4. `PREPARING_AUDIO` (37%)
  5. `ANALYZING_MUSIC` (50%)
  6. `DETECTING_NOTES` (62%)
  7. `GENERATING_MIDI` (75%)
  8. `SYNTHESIZING_AUDIO` (85%)
  9. `RENDERING_ANIMATION` (95%)
  10. `COMPLETE` (100%)
- **Response `200 OK`**: Updated `ProjectResponse` with initial processing status.

### `POST /api/projects/{id}/render`
Triggers only the video rendering stage (useful after manual MIDI note edits).

- **Response `200 OK`**: `ProjectResponse` with rendering job queued.

---

## 5. Preview & Interactive MIDI Editor

### `GET /api/projects/{id}/preview`
Retrieves note geometry and timing for the Three.js 3D Visualizer and 2D MIDI Piano Roll.

- **Response `200 OK`**:
```json
{
  "project_id": "demo-piano-sample",
  "duration_seconds": 7.0,
  "tempo": 120.0,
  "note_count": 8,
  "notes": [
    {
      "pitch": 60,
      "start_time": 0.5,
      "end_time": 1.5,
      "duration": 1.0,
      "velocity": 90,
      "hand": "right",
      "channel": 0
    },
    {
      "pitch": 48,
      "start_time": 0.5,
      "end_time": 2.0,
      "duration": 1.5,
      "velocity": 85,
      "hand": "left",
      "channel": 1
    }
  ],
  "audio_url": "/api/projects/demo-piano-sample/audio",
  "visual_settings": {}
}
```

### `PUT /api/projects/{id}/midi`
Saves user-edited notes from the MIDI Piano Roll back into the project MIDI file, resynthesizes piano audio, and optionally triggers video re-render.

- **Request Body (`application/json`)**:
```json
{
  "notes": [
    {
      "pitch": 62,
      "start_time": 0.5,
      "end_time": 1.5,
      "duration": 1.0,
      "velocity": 95,
      "hand": "right",
      "channel": 0
    }
  ],
  "tempo": 120.0,
  "auto_resynthesize": true,
  "auto_rerender": false
}
```
- **Response `200 OK`**: `ProjectResponse` with refreshed note count and resynthesized audio track.

---

## 6. Media Streaming & Downloads

### `GET /api/projects/{id}/video`
Streams the rendered 1280x720 30fps MP4 video file (`Content-Type: video/mp4`).

### `GET /api/projects/{id}/audio`
Streams the FluidSynth synthesized Grand Piano audio track (`Content-Type: audio/wav`).

### `GET /api/projects/{id}/midi`
Downloads the multi-track standard Type 1 MIDI file (`Content-Type: audio/midi`).

### `GET /api/projects/{id}/download`
Downloads the finalized MP4 animation video with an attachment Content-Disposition header.
