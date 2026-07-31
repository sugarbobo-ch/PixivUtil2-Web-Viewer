@echo off
echo =========================================
echo  Starting PixivUtil2 Web Viewer & API...
echo =========================================

cd /d "%~dp0backend"
start "PixivUtil2 FastAPI Backend" uv run uvicorn main:app --port 8000 --reload

cd /d "%~dp0frontend"
cmd /c pnpm dev
