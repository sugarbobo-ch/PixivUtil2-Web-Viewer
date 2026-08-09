@echo off
setlocal
cd /d "%~dp0"

echo =========================================
echo  PixivUtil2 Web Viewer - One-click setup
echo =========================================
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1"
set "INSTALL_EXIT=%ERRORLEVEL%"

echo.
if not "%INSTALL_EXIT%"=="0" (
  echo Setup failed. Review the message above, then try again.
) else (
  echo Setup completed. Double-click run_viewer.bat to start.
)
echo.
pause
exit /b %INSTALL_EXIT%
