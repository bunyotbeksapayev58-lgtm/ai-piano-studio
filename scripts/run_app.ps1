Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "       AI PIANO VIDEO GENERATOR - LAUNCH SCRIPT        " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

$rootDir = Split-Path -Parent $PSScriptRoot

Write-Host "[1/2] Starting Backend FastAPI Server (Port 8000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$rootDir\backend'; `$env:PYTHONPATH='.'; .\venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload"

Write-Host "[2/2] Starting Frontend Next.js Server (Port 3000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$rootDir\frontend'; npm run dev"

Write-Host ""
Write-Host "Application is launching!" -ForegroundColor Green
Write-Host "Web Interface:    http://localhost:3000" -ForegroundColor White
Write-Host "Backend API Docs: http://localhost:8000/docs" -ForegroundColor White
Write-Host ""
