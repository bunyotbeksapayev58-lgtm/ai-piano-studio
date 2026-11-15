@echo off
echo ========================================================
echo        AI PIANO VIDEO GENERATOR - LAUNCH SCRIPT
echo ========================================================
echo.

cd /d "%~dp0\.."

echo [1/2] Starting Backend FastAPI Server (Port 8000)...
start "AI Piano - Backend" cmd /k "cd backend && .\venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload"

echo [2/2] Starting Frontend Next.js Server (Port 3000)...
start "AI Piano - Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo Application starting!
echo Web Interface: http://localhost:3000
echo Backend API Docs: http://localhost:8000/docs
echo.
pause
