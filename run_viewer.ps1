# Compatibility entry point. The implementation lives in scripts/run.ps1 so the
# BAT and PowerShell launchers always use the same single-terminal behavior.
& (Join-Path $PSScriptRoot "scripts\run.ps1")
exit $LASTEXITCODE
