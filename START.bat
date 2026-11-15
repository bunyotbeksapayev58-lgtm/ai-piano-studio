@echo off
title AI Piano Studio - Launcher
color 0B
echo ================================================================
echo               AI PIANO STUDIO (FALLING NOTE)
echo       Polyphonic AI Audio Transcription & 3D Video Studio
echo ================================================================
echo.

cd /d "%~dp0"

echo [1/3] Backend server ishga tushirilmoqda (FastAPI, Port 8000)...
start "AI Piano Studio - Backend" cmd /k "cd backend && .\venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000"

echo [2/3] Frontend server ishga tushirilmoqda (Next.js, Port 3000)...
start "AI Piano Studio - Frontend" cmd /k "cd frontend && npm start -- -p 3000"

echo [3/3] Brauzer ochilmoqda...
timeout /t 3 /nobreak >nul
start http://localhost:3000

echo.
echo ================================================================
echo   Tizim muvaffaqiyatli ishga tushdi!
echo.
echo   * Sayt manzili:    http://localhost:3000
echo   * API hujjatlari:  http://127.0.0.1:8000/docs
echo.
echo   Ilovani to'xtatish uchun ochilgan konsol oynalarini yoping.
echo ================================================================
echo.
pause
