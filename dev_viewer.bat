@echo off
setlocal
cd /d "%~dp0"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev_viewer.ps1"
set "DEV_EXIT=%ERRORLEVEL%"

if not "%DEV_EXIT%"=="0" (
  echo.
  echo The development viewer stopped with an error. Review the message above.
  pause
)
exit /b %DEV_EXIT%
