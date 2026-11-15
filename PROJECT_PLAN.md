# AI PIANO STUDIO — COMPREHENSIVE IMPLEMENTATION PLAN (V2)

## 1. Executive Summary & Repository Audit

### Current Working Baseline
- **Backend Architecture**: FastAPI application with SQLite database and SQLAlchemy ORM.
- **AI Audio Transcription**: Spotify Basic Pitch (ICASSP 2022) neural polyphonic model integrated with modular `BaseTranscriber` interface and Spectral CQT fallback.
- **Audio Synthesis**: FluidSynth 2.6.2 with Salamander Grand Piano C5 SoundFont (`SalC5Light2.sf2`, 25MB CC-BY 3.0) and internal harmonic model fallback.
- **Video Rendering**: Deterministic 1280x720 30FPS H.264 / AAC MP4 streaming frame pipeline via FFmpeg stdin pipe (constant memory footprint < 50MB RAM).
- **Frontend Architecture**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Three.js 3D 88-key piano player.
- **Demonstration**: Pre-rendered demonstration video validated (`demo_piano_video.mp4`, 282 KB, 7s duration, H.264/AAC).
- **Test Suite**: 10 unit and integration tests passing.

### Deficiencies & V2 Scope
1. **User Authentication & Authorization**: Missing user registration, login, logout, password hashing, and user-isolated projects. Must support both registered users and seamless guest development mode.
2. **Interactive MIDI Editor**: Needed a full piano roll editor allowing users to select, move, resize duration, delete, add, and reassign notes, with a `PUT /api/projects/{id}/midi` persistence endpoint and one-click re-render.
3. **10 Real Backend Processing Stages**: Expanding pipeline status from 8 to the 10 distinct verified stages required by Section 3.D.
4. **Expanded Multi-Page Site Navigation**:
   - Landing Page (Hero, Showcase, Features, How it Works, FAQ, Footer)
   - Dashboard (Overview stats, storage usage, quick actions, recent project cards)
   - New Project Page (Upload dropzone, duration check, size validation, cancellation)
   - Project Processing Page (10 real-time stages with log details & error view)
   - Piano Studio (Interactive 3D Three.js Visualizer + 2D Interactive MIDI Piano Roll Editor)
   - Export Hub (MP4 player, multi-format download center, quality report)
   - Project Settings (Visual themes, color schemes, lookahead timing, camera perspective)
   - Help & Documentation (Specifications, troubleshooting, FAQ)
5. **Project Management Endpoints**: `GET /api/projects/stats`, `GET /api/projects/{id}`, `PATCH /api/projects/{id}` (rename & settings), `PUT /api/projects/{id}/midi`.
6. **Production Artifacts**: `PROJECT_PLAN.md`, `DEVELOPMENT_STATUS.md`, `API_DOCUMENTATION.md`, `DEPLOYMENT.md`, extended automated test suite.

---

## 2. Technical Architecture & Component Design

### A. Authentication & User Model
- **Security**: PBKDF2-SHA256 password hashing with salt (cryptographically secure, zero fragile C-extension compilation dependencies on Windows/Linux).
- **Session Tokens**: Cryptographically signed HMAC-SHA256 session tokens.
- **Guest Support**: Automatic fallback to guest session when unauthenticated, so local testing and development work seamlessly out-of-the-box.

### B. Interactive MIDI Editor & Synchronization
- **Backend**:
  - `PUT /api/projects/{id}/midi`: Validates incoming note array, rewrites the project's standard Type 1 MIDI file via `pretty_midi`, triggers instant FluidSynth re-synthesis of the piano audio track, and updates project note count, tempo, and polyphony metrics.
- **Frontend Piano Roll Editor**:
  - Full 88-key visual timeline.
  - Interactive note selection, dragging (time/pitch), duration resizing, and note deletion.
  - Track color coding (Electric Blue for Right Hand / Treble, Vivid Violet for Left Hand / Bass).
  - One-click "Save & Resynthesize Audio" and "Re-render 720p Video".

### C. 10 Verified Backend Stages
1. **Uploading Video**: File stream reception, size check, safe filesystem storage.
2. **Inspecting Media**: FFprobe container format validation, audio stream detection, $\le 600$s duration verification.
3. **Extracting Audio**: FFmpeg extraction to normalized 44.1 kHz 16-bit PCM WAV.
4. **Preparing Audio**: Spectrogram generation and frequency band pre-filtering.
5. **AI Music Transcription**: Spotify Basic Pitch polyphonic neural inference.
6. **MIDI Generation**: Polyphonic note parsing and intelligent hand assignment heuristic.
7. **Piano Audio Synthesis**: FluidSynth concert grand piano soundfont rendering to stereo WAV.
8. **Piano Animation Rendering**: 1280x720 30fps frame-by-frame Falling Note generation.
9. **MP4 Encoding**: Streaming raw video into FFmpeg `libx264` + `aac` container.
10. **Final Output Validation**: FFprobe verification of audio/video streams, file size, and duration.

---

## 3. Phased Execution Roadmap

- **Phase 1**: Architecture & Plan Documentation (`PROJECT_PLAN.md`, `DEVELOPMENT_STATUS.md`)
- **Phase 2**: Backend Authentication & User Project Isolation (`User` model, Auth API, token auth, guest mode)
- **Phase 3**: Enhanced Project APIs (`GET /stats`, `PATCH /projects/{id}`, `PUT /projects/{id}/midi`, 10-stage `JobQueue`)
- **Phase 4**: Frontend Navigation, Design System, & Multi-Page Views (Landing, Dashboard, New Project, Processing, Studio, Export, Settings, Help)
- **Phase 5**: Interactive MIDI Piano Roll Editor in Piano Studio
- **Phase 6**: Customization Settings (Color themes, note speed, camera)
- **Phase 7**: Comprehensive Automated Testing (Auth, MIDI editing, stats, rendering)
- **Phase 8**: Production Documentation (`API_DOCUMENTATION.md`, `DEPLOYMENT.md`, updated `README.md`)
