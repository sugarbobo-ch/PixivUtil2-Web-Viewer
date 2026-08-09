[CmdletBinding()]
param(
    [ValidateRange(0, 3600)][int]$RunForSeconds = 0
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$RuntimeRoot = Join-Path $ProjectRoot ".runtime"
$NodeExe = Join-Path $RuntimeRoot "node\node.exe"
$BackendPython = Join-Path $RuntimeRoot "backend-venv\Scripts\python.exe"
$ViteEntry = Join-Path $ProjectRoot "frontend\node_modules\vite\bin\vite.js"
$LogRoot = Join-Path $RuntimeRoot "logs"
$backendProcess = $null
$frontendProcess = $null
$exitCode = 0

function Assert-Installed([string]$Path, [string]$Description) {
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "$Description is missing. Run install.bat first."
    }
}

function Show-LogTail([string]$Path, [string]$Label) {
    if (Test-Path -LiteralPath $Path) {
        Write-Host "`n--- $Label log ---" -ForegroundColor Yellow
        Get-Content -LiteralPath $Path -Tail 30
    }
}

try {
    Assert-Installed $NodeExe "The project-local Node.js runtime"
    Assert-Installed $BackendPython "The backend Python environment"
    Assert-Installed $ViteEntry "The frontend dependencies"

    New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backendStdout = Join-Path $LogRoot "backend-$stamp.log"
    $backendStderr = Join-Path $LogRoot "backend-$stamp.error.log"
    $frontendStdout = Join-Path $LogRoot "frontend-$stamp.log"
    $frontendStderr = Join-Path $LogRoot "frontend-$stamp.error.log"

    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host " PixivUtil2 Web Viewer" -ForegroundColor Cyan
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host "Starting API and web UI in this terminal..."

    $backendProcess = Start-Process -FilePath $BackendPython `
        -ArgumentList @("-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000") `
        -WorkingDirectory (Join-Path $ProjectRoot "backend") `
        -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $backendStdout -RedirectStandardError $backendStderr

    $quotedViteEntry = '"' + $ViteEntry + '"'
    $frontendProcess = Start-Process -FilePath $NodeExe `
        -ArgumentList @($quotedViteEntry, "--host", "127.0.0.1") `
        -WorkingDirectory (Join-Path $ProjectRoot "frontend") `
        -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $frontendStdout -RedirectStandardError $frontendStderr

    Start-Sleep -Seconds 2
    if ($backendProcess.HasExited) {
        throw "The backend exited during startup."
    }
    if ($frontendProcess.HasExited) {
        throw "The frontend exited during startup."
    }

    Write-Host "`nViewer: http://localhost:3000" -ForegroundColor Green
    Write-Host "API:    http://127.0.0.1:8000"
    Write-Host "Logs:   $LogRoot"
    Write-Host "`nPress Ctrl+C to stop both services."

    $startedAt = Get-Date
    while (-not $backendProcess.HasExited -and -not $frontendProcess.HasExited) {
        Start-Sleep -Milliseconds 500
        if ($RunForSeconds -gt 0 -and ((Get-Date) - $startedAt).TotalSeconds -ge $RunForSeconds) {
            Write-Host "`nSmoke-test duration reached; stopping both services."
            break
        }
    }

    if ($RunForSeconds -gt 0 -and -not $backendProcess.HasExited -and -not $frontendProcess.HasExited) {
        $exitCode = 0
    }
    elseif ($backendProcess.HasExited) {
        throw "The backend stopped unexpectedly with exit code $($backendProcess.ExitCode)."
    }
    else {
        throw "The frontend stopped unexpectedly with exit code $($frontendProcess.ExitCode)."
    }
}
catch [System.Management.Automation.PipelineStoppedException] {
    Write-Host "`nStopping viewer..."
}
catch {
    $exitCode = 1
    Write-Host "`n$($_.Exception.Message)" -ForegroundColor Red
    if ($backendStderr) { Show-LogTail $backendStderr "Backend error" }
    if ($frontendStderr) { Show-LogTail $frontendStderr "Frontend error" }
}
finally {
    foreach ($process in @($frontendProcess, $backendProcess)) {
        if ($process -and -not $process.HasExited) {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
            $process.WaitForExit(3000) | Out-Null
        }
    }
}

exit $exitCode
