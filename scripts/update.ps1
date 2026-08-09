[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

function Invoke-Git([string[]]$Arguments) {
    & git -C $ProjectRoot @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Git command failed: git $($Arguments -join ' ')"
    }
}

try {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        throw "Git is required for updates. Install Git for Windows, then run update.bat again."
    }

    & git -C $ProjectRoot rev-parse --is-inside-work-tree *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "This folder is not a Git checkout. Download or clone the project again to use update.bat."
    }

    $currentBranch = (& git -C $ProjectRoot branch --show-current).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $currentBranch) {
        throw "The checkout is not on a branch. Switch to a branch before using update.bat."
    }

    $remote = (& git -C $ProjectRoot config --get "branch.$currentBranch.remote")
    $mergeRef = (& git -C $ProjectRoot config --get "branch.$currentBranch.merge")
    if (-not $remote -or -not $mergeRef) {
        throw "The current branch has no upstream remote. Configure one before using update.bat."
    }
    $upstream = "$remote/$($mergeRef -replace '^refs/heads/', '')"

    Write-Host "Pulling $upstream with fast-forward only..." -ForegroundColor Cyan
    Invoke-Git @("pull", "--ff-only")

    Write-Host "`nRefreshing the project-local runtime and dependencies..." -ForegroundColor Cyan
    & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "install.ps1")
    if ($LASTEXITCODE -ne 0) {
        throw "Dependency setup failed after the Git update."
    }

    exit 0
}
catch {
    Write-Host "`nUpdate failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "No reset, clean, stash, or force operation was performed."
    exit 1
}
