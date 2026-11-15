# AI Piano Studio (AI Piano Video Generator)

An end-to-end web application that converts music videos into synchronized, 720p 30FPS falling-note piano animation videos with synthesized acoustic grand piano audio, an interactive MIDI Piano Roll editor, and downloadable multi-track MIDI.

Inspired by the workflow of Falling Note, architected with an original dark-themed interface, polyphonic neural transcription, realistic SoundFont synthesis, and a memory-efficient video rendering pipeline.

---

## 🌟 Key Features

### 1. Video Upload & Media Inspection
- Accepts **MP4, MOV, MKV, and WEBM** video containers up to **10 minutes (600 seconds)** and 500 MB.
- Deep media inspection via **FFprobe**: validates actual container integrity, verifies video/audio stream presence, and enforces duration limits.
- High-fidelity **44.1 kHz 16-bit PCM stereo WAV** extraction via **FFmpeg**.

### 2. AI Music Transcription (Spotify Basic Pitch)
- Integrates Spotify's open-source polyphonic convolutional neural network (ICASSP 2022 architecture).
- Accurately detects simultaneous piano pitches (A0 to C8, MIDI 21–108), note onsets, offsets, and velocities without paid external APIs.
- Modular architecture (`BaseTranscriber`) allows swapping transcription models or using the built-in spectral CQT harmonic fallback.

### 3. Intelligent Hand Separation Heuristic
- Automatically partitions notes into **Right Hand (Melody/Treble - Electric Blue)** and **Left Hand (Bass/Accompaniment - Vivid Violet)**.
- Leverages simultaneous chord clustering, octave register thresholds (Middle C = 60), interval spans, and temporal voice leading.
- Computes comprehensive transcription quality metrics (polyphony density, note count, BPM estimation, and pitch distribution).

### 4. Interactive MIDI Piano Roll Editor
- Full visual piano roll timeline displaying notes across all 88 keys.
- Real-time note inspector: view and edit pitch name, octave, start time, duration, velocity, and hand assignment.
- Drag-and-drop time & pitch adjustments, note insertion, and note deletion.
- **Save & Resynthesize**: Persists edited notes via `PUT /api/projects/{id}/midi` and instantly re-renders the acoustic piano audio track via FluidSynth.
- **One-Click Re-render**: Triggers 720p 30FPS video re-rendering with edited notes.

### 5. Acoustic Grand Piano Synthesis (FluidSynth)
- Synthesizes concert grand piano audio from the transcribed MIDI using **FluidSynth v2.6.2** and the high-fidelity **Salamander Grand Piano C5** SoundFont (CC-BY 3.0).
- Dynamic peak normalization to -1.0 dBFS with soft-clipping prevention and natural acoustic decay tails.
- Built-in additive physical model synthesizer fallback.

### 6. Interactive 3D WebGL Canvas (Three.js)
- Real-time 88-key 3D piano keyboard (52 ivory white keys, 36 ebony black keys).
- 3D falling note blocks descending towards the strike line with neon glow and strike-line blooms.
- Dynamic key depression and key illumination when notes contact the keyboard.
- Full playback controls: play/pause, scrub slider, speed adjustments (0.5x to 1.5x), restart, and volume control.

### 7. 720p 30FPS MP4 Video Rendering Engine
- Renders 1280 × 720 resolution H.264 video synchronized with AAC stereo piano audio.
- **Stream-to-FFmpeg Architecture**: Frames are generated in Python and piped directly to FFmpeg `stdin`. Constant memory consumption (< 50MB RAM), enabling deterministic rendering of 10-minute videos (18,000 frames) with zero out-of-memory risks.
- The original video is never present in the final export—only the animated piano visualization and synthesized piano audio.

### 8. Complete Multi-Page Website & User Management
- **Global Navigation**: Seamless switching between Dashboard, New Project, My Projects, Piano Studio, Settings, and Documentation.
- **User Authentication**: Secure PBKDF2 password hashing, JWT session tokens, and a guest mode fallback allowing instant use without forced login.
- **Dashboard**: Real-time project metrics, completed exports count, active queue monitor, and disk storage usage tracker.
- **Settings**: Color theme presets (Electric Blue, Violet Glow, Cyberpunk Neon, Emerald Aura, Silver Glass), note lookahead speed (1.5s to 5.0s), and SoundFont selection.
- **Help & FAQ**: Complete guide, 10-stage pipeline overview, and audio recording best practices.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Three.js, Lucide Icons |
| **Backend** | Python 3.11, FastAPI, Pydantic v2, SQLAlchemy, Uvicorn |
| **AI Transcription** | Spotify Basic Pitch (TensorFlow / ONNX / Librosa), Spectral CQT Engine |
| **Audio Engine** | FluidSynth 2.6.2, Salamander Grand Piano C5 SoundFont (`.sf2`), PrettyMIDI, Mido |
| **Video Engine** | FFmpeg 9.0 (Gyan full build with `libx264` and `aac`), OpenCV Headless, NumPy |
| **Database** | SQLite + SQLAlchemy ORM |
| **Security** | PBKDF2-HMAC-SHA256, HMAC-SHA256 JWT tokens |

---

## 📂 Project Structure

```
falling-note/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth.py           # Register, login, logout, me endpoints
│   │   │   └── projects.py       # REST API (upload, status, preview, midi, render, stream)
│   │   ├── core/
│   │   │   ├── config.py         # App settings & tool resolvers (ffmpeg, fluidsynth)
│   │   │   ├── database.py       # SQLAlchemy session & SQLite engine
│   │   │   └── security.py       # PBKDF2 password hashing & JWT token management
│   │   ├── midi/
│   │   │   ├── hand_assigner.py  # Chord clustering & register hand separation heuristic
│   │   │   └── midi_generator.py # Type 1 multi-track MIDI generation & parser
│   │   ├── models/
│   │   │   ├── project.py        # Project SQLAlchemy model and DTO schemas
│   │   │   └── user.py           # User SQLAlchemy model and auth schemas
│   │   ├── piano/
│   │   │   └── synthesizer.py    # FluidSynth Yamaha C5 soundfont synthesis engine
│   │   ├── rendering/
│   │   │   └── video_renderer.py # 88-key geometry, frame rendering & FFmpeg pipe stream
│   │   ├── services/
│   │   │   ├── job_queue.py      # Asynchronous 10-stage background pipeline
│   │   │   └── video_service.py  # FFprobe validation & FFmpeg WAV extraction
│   │   └── transcription/
│   │       ├── base.py           # BaseTranscriber interface & DetectedNote dataclass
│   │       ├── basic_pitch_transcriber.py # Spotify Basic Pitch neural model
│   │       ├── factory.py        # Model selector factory
│   │       └── spectral_transcriber.py    # Constant-Q Transform fallback
│   ├── main.py                   # FastAPI application initialization & routes
│   └── requirements.txt          # Pinned Python dependencies
├── frontend/
│   ├── app/
│   │   ├── layout.tsx            # Root HTML layout with Google Font & dark theme
│   │   └── page.tsx              # Main application orchestrator & view state machine
│   ├── components/
│   │   ├── AuthModal.tsx         # Sign in, registration, and guest mode modal
│   │   ├── DashboardView.tsx     # Metrics dashboard, storage counter & project grid
│   │   ├── DocsView.tsx          # Architectural specifications & engine docs
│   │   ├── ExportView.tsx        # Final MP4 preview & multi-format download hub
│   │   ├── HelpView.tsx          # 10-stage pipeline overview & FAQ accordion
│   │   ├── HomeView.tsx          # Hero section & drag-and-drop video upload zone
│   │   ├── MidiEditor.tsx        # Interactive 2D visual Piano Roll editor
│   │   ├── Navbar.tsx            # Global navigation, health pill & user profile
│   │   ├── PianoPreview.tsx      # Interactive 3D WebGL Three.js visualizer
│   │   ├── ProcessingView.tsx    # Real-time 10-stage pipeline progress monitor
│   │   └── SettingsView.tsx      # Themes, lookahead speeds & SoundFont preferences
│   └── services/
│       └── api.ts                # TypeScript API client & authentication helpers
├── tests/
│   └── test_components.py        # 12 automated unit and integration tests
├── scripts/
│   ├── generate_demo.py          # Standalone demo video generator script
│   └── seed_demo_project.py      # Database seeder for instant testing
├── API_DOCUMENTATION.md          # Complete REST API reference
├── DEPLOYMENT.md                 # Linux / Docker / Windows deployment guide
├── DEVELOPMENT_STATUS.md         # Implementation checklist & verification tracker
└── PROJECT_PLAN.md               # Architecture design & system blueprint
```

---

## 🚀 Quick Start (Development & Testing)

### Prerequisites
- **Python 3.11**
- **Node.js 18+** & npm
- **FFmpeg 9.0+** with `libx264` and `aac` on PATH
- **FluidSynth 2.6.2** on PATH

### 1. Start the FastAPI Backend
```powershell
# From the project root
.\backend\venv\Scripts\python.exe -m uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000
```
- API Base: `http://127.0.0.1:8000`
- API Health Check: `http://127.0.0.1:8000/health`
- Swagger Docs: `http://127.0.0.1:8000/docs`

### 2. Start the Next.js Frontend
```powershell
# From the project root
npm --prefix frontend run start -- -p 3000
# Or for live hot-reloading development:
npm --prefix frontend run dev
```
- Web Application: `http://localhost:3000`

### 3. Run Automated Tests
```powershell
$env:PYTHONPATH="backend"
.\backend\venv\Scripts\python.exe -m pytest -v tests\test_components.py
```
Expected output:
```
tests/test_components.py::test_media_inspection_and_validation PASSED
tests/test_components.py::test_audio_extraction PASSED
tests/test_components.py::test_duration_exceeded_rejection PASSED
tests/test_components.py::test_ai_transcription_engine PASSED
tests/test_components.py::test_midi_generation_and_hands PASSED
tests/test_components.py::test_piano_sound_generation PASSED
tests/test_components.py::test_note_to_key_mapping PASSED
tests/test_components.py::test_render_pipeline_mp4_generation PASSED
tests/test_components.py::test_security_password_and_token PASSED
tests/test_components.py::test_auth_api_register_login PASSED
tests/test_components.py::test_interactive_midi_update_and_resynthesis PASSED
tests/test_components.py::test_dashboard_stats_and_patch PASSED
====================== 12 passed in 17.31s =======================
```

---

## 🎬 Pre-Rendered Demonstration

A pre-rendered demonstration video showing falling piano notes, dynamic key depression, illumination glow, and synthesized audio is generated and validated at:
```
backend/outputs/demo_piano_video.mp4
```
- **Resolution**: 1280 × 720 (720p HD)
- **Frame Rate**: 30 FPS
- **Video Codec**: H.264 (High Profile)
- **Audio Codec**: AAC Stereo (44.1 kHz, 192 kbps)
- **Duration**: 7.0 seconds

---

## 📄 License & Attribution

- **AI Piano Studio**: Built with Spotify Basic Pitch (Apache 2.0).
- **SoundFont**: Salamander Grand Piano C5 Light by Alexander Holm (Creative Commons Attribution 3.0 Unported).
- **FluidSynth**: LGPL 2.1.
- **FFmpeg**: GPL 3.0 / LGPL 2.1.
