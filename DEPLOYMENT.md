# AI Piano Studio — Deployment & Operations Guide

This guide covers production deployment of **AI Piano Studio** on **Linux (Ubuntu/Debian)**, **Docker & Docker Compose**, and **Windows**.

---

## 1. System Requirements

- **Operating System**: Linux (Ubuntu 22.04 LTS / 24.04 LTS recommended) or Windows 10/11 x64
- **CPU**: 4+ cores recommended (AVX2 support for TensorFlow & Basic Pitch inference)
- **RAM**: Minimum 4 GB, Recommended 8 GB+
- **GPU**: Optional (CUDA-enabled NVIDIA GPU accelerates TensorFlow transcription, but CPU is fully supported)
- **Storage**: SSD with at least 10 GB free space for SoundFonts, temporary WAV extraction, and MP4 rendering
- **Network**: Port 80/443 (Reverse Proxy), 3000 (Next.js frontend), 8000 (FastAPI backend)

---

## 2. Docker & Container Deployment (Recommended)

### A. Docker Compose Configuration (`docker-compose.yml`)

```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: piano_backend
    restart: always
    environment:
      - APP_ENV=production
      - HOST=0.0.0.0
      - PORT=8000
      - SOUNDFONT_PATH=/app/soundfonts/SalC5Light2.sf2
      - MAX_UPLOAD_SIZE_MB=500
      - MAX_DURATION_SECONDS=600
    volumes:
      - piano_data:/app/outputs
      - piano_uploads:/app/uploads
      - ./backend/soundfonts:/app/soundfonts
    ports:
      - "8000:8000"

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: piano_frontend
    restart: always
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_API_BASE=http://backend:8000
    ports:
      - "3000:3000"
    depends_on:
      - backend

volumes:
  piano_data:
  piano_uploads:
```

### B. Backend Dockerfile (`backend/Dockerfile`)

```dockerfile
FROM python:3.11-slim

# Install system utilities, FFmpeg, and FluidSynth
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    fluidsynth \
    fluid-soundfont-gm \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Ensure storage directories exist
RUN mkdir -p uploads outputs soundfonts

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### C. Frontend Dockerfile (`frontend/Dockerfile`)

```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000
CMD ["npm", "start", "--", "-p", "3000"]
```

---

## 3. Linux Native Production Setup (Ubuntu 22.04 / 24.04)

### Step 1: System Packages & Dependencies
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3.11 python3.11-venv python3-pip ffmpeg fluidsynth fluid-soundfont-gm nodejs npm nginx
```

### Step 2: Clone & Directory Permissions
```bash
git clone https://github.com/your-org/ai-piano-studio.git /opt/ai-piano-studio
cd /opt/ai-piano-studio
sudo chown -R $USER:$USER /opt/ai-piano-studio
```

### Step 3: Backend Python Environment
```bash
python3.11 -m venv backend/venv
source backend/venv/bin/activate
pip install --upgrade pip
pip install -r backend/requirements.txt
```

### Step 4: SoundFont Setup
```bash
mkdir -p backend/soundfonts
# Download Salamander Grand Piano C5 Light (25 MB)
curl -L -o backend/soundfonts/SalC5Light2.sf2 https://freepats.zenvoid.org/Piano/SalamanderGrandPiano/SalC5Light2.sf2
```

### Step 5: Frontend Production Build
```bash
cd frontend
npm ci
npm run build
cd ..
```

---

## 4. Systemd Service Configuration

### Backend Service: `/etc/systemd/system/piano-backend.service`
```ini
[Unit]
Description=AI Piano Studio FastAPI Backend
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/opt/ai-piano-studio/backend
Environment="PATH=/opt/ai-piano-studio/backend/venv/bin:/usr/local/bin:/usr/bin"
Environment="PYTHONPATH=/opt/ai-piano-studio/backend"
ExecStart=/opt/ai-piano-studio/backend/venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000 --workers 2
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### Frontend Service: `/etc/systemd/system/piano-frontend.service`
```ini
[Unit]
Description=AI Piano Studio Next.js Frontend
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/opt/ai-piano-studio/frontend
Environment="NODE_ENV=production"
Environment="PORT=3000"
ExecStart=/usr/bin/npm start -- -p 3000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable and start services:
```bash
sudo systemctl daemon-reload
sudo systemctl enable piano-backend piano-frontend
sudo systemctl start piano-backend piano-frontend
```

---

## 5. Nginx Reverse Proxy Configuration

Create `/etc/nginx/sites-available/ai-piano-studio`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Maximum upload size for video files (500 MB)
    client_max_body_size 500M;
    client_body_timeout 300s;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml+rss text/javascript image/svg+xml;

    # Frontend routes
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API endpoints
    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }

    # Backend Health check
    location /health {
        proxy_pass http://127.0.0.1:8000/health;
    }
}
```

Enable the site and reload Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/ai-piano-studio /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## 6. Windows Development & Local Production

1. **Python 3.11**:
   ```powershell
   winget install Python.Python.3.11
   ```
2. **FFmpeg & FFprobe**:
   ```powershell
   winget install Gyan.FFmpeg
   ```
3. **FluidSynth**:
   - Extract `fluidsynth-v2.6.2-win10-x64-cpp11` to `C:\Users\user\fluidsynth\`
   - Add `bin` to User `PATH`.
4. **Run Backend**:
   ```powershell
   .\backend\venv\Scripts\python.exe -m uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000
   ```
5. **Run Frontend**:
   ```powershell
   npm --prefix frontend run build
   npm --prefix frontend run start -- -p 3000
   ```
