@echo off
setlocal
cd /d "%~dp0"

echo =========================================
echo  PixivUtil2 Web Viewer - Update
echo =========================================
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update.ps1"
set "UPDATE_EXIT=%ERRORLEVEL%"

echo.
if not "%UPDATE_EXIT%"=="0" (
  echo Update stopped. No local changes were discarded.
) else (
  echo Update completed. Double-click run_viewer.bat to start.
)
echo.
pause
exit /b %UPDATE_EXIT%
