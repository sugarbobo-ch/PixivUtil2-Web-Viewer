# PixivUtil2 Web Viewer Launcher
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " Starting PixivUtil2 Web Viewer & API..." -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

Set-Location -Path "$PSScriptRoot\backend"
Start-Process -FilePath "uv" -ArgumentList "run uvicorn main:app --port 8000 --reload" -WindowStyle Normal

Set-Location -Path "$PSScriptRoot\frontend"
Start-Sleep -Seconds 2
Start-Process "http://localhost:3000"
cmd /c pnpm dev
