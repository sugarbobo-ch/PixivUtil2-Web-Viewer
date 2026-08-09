# Development entry point. Starts FastAPI reload and Vite HMR in one terminal
# using the project-local runtime installed by install.bat.
& (Join-Path $PSScriptRoot "scripts\run.ps1") -Development
exit $LASTEXITCODE
