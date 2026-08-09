[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$NodeVersion = "22.14.0"
$PnpmVersion = "11.18.0"
$UvVersion = "0.11.16"
$PythonVersion = "3.12"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$RuntimeRoot = Join-Path $ProjectRoot ".runtime"
$NodeRoot = Join-Path $RuntimeRoot "node"
$UvRoot = Join-Path $RuntimeRoot "uv"
$PnpmRoot = Join-Path $RuntimeRoot "pnpm"
$PythonRoot = Join-Path $RuntimeRoot "python"
$UvCacheRoot = Join-Path $RuntimeRoot "uv-cache"
$BackendEnvironment = Join-Path $RuntimeRoot "backend-venv"
$BackupRoot = Join-Path $RuntimeRoot "backups"

function Write-Step([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [string]$WorkingDirectory = $ProjectRoot
    )

    Push-Location $WorkingDirectory
    try {
        & $FilePath @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "Command failed with exit code $LASTEXITCODE`: $FilePath $($Arguments -join ' ')"
        }
    }
    finally {
        Pop-Location
    }
}

function Move-DirectoryWithBackup {
    param(
        [Parameter(Mandatory = $true)][string]$StagedPath,
        [Parameter(Mandatory = $true)][string]$TargetPath,
        [Parameter(Mandatory = $true)][string]$Label
    )

    $backupPath = $null
    if (Test-Path -LiteralPath $TargetPath) {
        New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
        $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $backupPath = Join-Path $BackupRoot "$Label-$stamp"
        Move-Item -LiteralPath $TargetPath -Destination $backupPath
        Write-Host "Preserved previous $Label runtime at $backupPath"
    }

    try {
        Move-Item -LiteralPath $StagedPath -Destination $TargetPath
    }
    catch {
        if ($backupPath -and -not (Test-Path -LiteralPath $TargetPath)) {
            Move-Item -LiteralPath $backupPath -Destination $TargetPath
        }
        throw
    }
}

function Get-NativeArchitecture {
    $architecture = $env:PROCESSOR_ARCHITEW6432
    if (-not $architecture) {
        $architecture = $env:PROCESSOR_ARCHITECTURE
    }

    switch ($architecture.ToUpperInvariant()) {
        "AMD64" { return @{ Node = "win-x64"; Uv = "x86_64-pc-windows-msvc" } }
        "ARM64" { return @{ Node = "win-arm64"; Uv = "aarch64-pc-windows-msvc" } }
        default { throw "Unsupported Windows architecture: $architecture. Use 64-bit Windows on x64 or ARM64." }
    }
}

function Get-CommandOutput([string]$FilePath, [string[]]$Arguments) {
    if (-not (Test-Path -LiteralPath $FilePath)) {
        return $null
    }

    $output = & $FilePath @Arguments 2>$null
    if ($LASTEXITCODE -ne 0) {
        return $null
    }
    return ($output | Select-Object -First 1).ToString().Trim()
}

try {
    if ($PSVersionTable.PSVersion.Major -lt 5) {
        throw "PowerShell 5.1 or newer is required."
    }

    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    New-Item -ItemType Directory -Force -Path $RuntimeRoot | Out-Null
    $architecture = Get-NativeArchitecture
    $tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("pixiv-viewer-setup-" + [Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $tempRoot | Out-Null

    try {
        $nodeExe = Join-Path $NodeRoot "node.exe"
        $installedNodeVersion = Get-CommandOutput $nodeExe @("--version")
        if ($installedNodeVersion -ne "v$NodeVersion") {
            Write-Step "Downloading portable Node.js $NodeVersion"
            $nodeArchive = Join-Path $tempRoot "node.zip"
            $nodeUrl = "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-$($architecture.Node).zip"
            Invoke-WebRequest -UseBasicParsing -Uri $nodeUrl -OutFile $nodeArchive

            $nodeExtractRoot = Join-Path $tempRoot "node-extracted"
            Expand-Archive -LiteralPath $nodeArchive -DestinationPath $nodeExtractRoot
            $nodeStagedPath = (Get-ChildItem -LiteralPath $nodeExtractRoot -Directory | Select-Object -First 1).FullName
            Move-DirectoryWithBackup $nodeStagedPath $NodeRoot "node"
        }
        else {
            Write-Step "Portable Node.js $NodeVersion is already installed"
        }

        $uvExe = Join-Path $UvRoot "uv.exe"
        $installedUvVersion = Get-CommandOutput $uvExe @("--version")
        if ($installedUvVersion -notmatch "^uv $([regex]::Escape($UvVersion))( |$)") {
            Write-Step "Downloading uv $UvVersion"
            $uvArchive = Join-Path $tempRoot "uv.zip"
            $uvUrl = "https://github.com/astral-sh/uv/releases/download/$UvVersion/uv-$($architecture.Uv).zip"
            Invoke-WebRequest -UseBasicParsing -Uri $uvUrl -OutFile $uvArchive

            $uvStagedPath = Join-Path $tempRoot "uv-extracted"
            Expand-Archive -LiteralPath $uvArchive -DestinationPath $uvStagedPath
            Move-DirectoryWithBackup $uvStagedPath $UvRoot "uv"
        }
        else {
            Write-Step "uv $UvVersion is already installed"
        }
    }
    finally {
        $systemTempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
        $resolvedTempRoot = [IO.Path]::GetFullPath($tempRoot)
        if ($resolvedTempRoot.StartsWith($systemTempRoot, [StringComparison]::OrdinalIgnoreCase) -and
            (Split-Path -Leaf $resolvedTempRoot).StartsWith("pixiv-viewer-setup-")) {
            Remove-Item -LiteralPath $resolvedTempRoot -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    $nodeExe = Join-Path $NodeRoot "node.exe"
    $npmCmd = Join-Path $NodeRoot "npm.cmd"
    $uvExe = Join-Path $UvRoot "uv.exe"
    $pnpmCmd = Join-Path $PnpmRoot "pnpm.cmd"
    $env:PATH = "$NodeRoot;$PnpmRoot;$UvRoot;$env:PATH"
    $env:UV_PYTHON_INSTALL_DIR = $PythonRoot
    $env:UV_CACHE_DIR = $UvCacheRoot
    $env:UV_MANAGED_PYTHON = "1"
    $env:UV_PROJECT_ENVIRONMENT = $BackendEnvironment

    $installedPnpmVersion = Get-CommandOutput $pnpmCmd @("--version")
    if ($installedPnpmVersion -ne $PnpmVersion) {
        Write-Step "Installing project-local pnpm $PnpmVersion"
        Invoke-Checked $npmCmd @("install", "--global", "--prefix", $PnpmRoot, "pnpm@$PnpmVersion")
    }
    else {
        Write-Step "Project-local pnpm $PnpmVersion is already installed"
    }

    Write-Step "Installing project-local Python $PythonVersion"
    Invoke-Checked $uvExe @("python", "install", $PythonVersion, "--no-bin", "--no-registry")

    Write-Step "Synchronizing backend dependencies"
    Invoke-Checked $uvExe @("sync", "--project", (Join-Path $ProjectRoot "backend"), "--python", $PythonVersion, "--locked")

    Write-Step "Synchronizing frontend dependencies"
    Invoke-Checked $pnpmCmd @("install", "--frozen-lockfile") (Join-Path $ProjectRoot "frontend")

    $configPath = Join-Path $ProjectRoot "web_config.json"
    $exampleConfigPath = Join-Path $ProjectRoot "web_config.example.json"
    if (-not (Test-Path -LiteralPath $configPath)) {
        Copy-Item -LiteralPath $exampleConfigPath -Destination $configPath
        Write-Step "Created local web_config.json from the example"
    }

    Write-Host "`nSetup is ready." -ForegroundColor Green
    Write-Host "Node, pnpm, uv, and Python are isolated under: $RuntimeRoot"
    Write-Host "Run the app with run_viewer.bat."
    exit 0
}
catch {
    Write-Host "`nSetup failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
