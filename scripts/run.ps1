[CmdletBinding()]
param(
    [ValidateRange(0, 3600)][int]$RunForSeconds = 0,
    [switch]$Development
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
$viewerJob = $null
$exitCode = 0

function New-ViewerProcessJob {
    if (-not ("ViewerProcessJob" -as [type])) {
        Add-Type -TypeDefinition @"
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;

public sealed class ViewerProcessJob : IDisposable
{
    private const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;
    private const int JobObjectExtendedLimitInformation = 9;
    private IntPtr handle;

    [StructLayout(LayoutKind.Sequential)]
    private struct IO_COUNTERS
    {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_BASIC_LIMIT_INFORMATION
    {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateJobObject(IntPtr jobAttributes, string name);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(
        IntPtr job,
        int informationClass,
        ref JOBOBJECT_EXTENDED_LIMIT_INFORMATION information,
        uint informationLength
    );

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr handle);

    public ViewerProcessJob()
    {
        handle = CreateJobObject(IntPtr.Zero, null);
        if (handle == IntPtr.Zero)
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to create the Viewer process job.");
        }

        var information = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
        information.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        if (!SetInformationJobObject(
            handle,
            JobObjectExtendedLimitInformation,
            ref information,
            (uint)Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION))))
        {
            int error = Marshal.GetLastWin32Error();
            CloseHandle(handle);
            handle = IntPtr.Zero;
            throw new Win32Exception(error, "Unable to configure the Viewer process job.");
        }
    }

    public void Add(Process process)
    {
        if (handle == IntPtr.Zero)
        {
            throw new ObjectDisposedException("ViewerProcessJob");
        }
        if (!AssignProcessToJobObject(handle, process.Handle))
        {
            throw new Win32Exception(
                Marshal.GetLastWin32Error(),
                "Unable to attach process " + process.Id + " to the Viewer process job."
            );
        }
    }

    public void Dispose()
    {
        if (handle == IntPtr.Zero)
        {
            return;
        }
        CloseHandle(handle);
        handle = IntPtr.Zero;
        GC.SuppressFinalize(this);
    }

    ~ViewerProcessJob()
    {
        Dispose();
    }
}
"@
    }

    return New-Object ViewerProcessJob
}

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

function Assert-PortAvailable([int]$Port, [string]$ServiceName) {
    $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $listener) {
        return
    }

    $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
    $processLabel = if ($process) { "$($process.ProcessName) (PID $($process.Id))" } else { "PID $($listener.OwningProcess)" }
    throw "$ServiceName cannot start because port $Port is already used by $processLabel. Close the existing viewer or process, then run this launcher again."
}

function Test-ProjectProcess([int]$ProcessId) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
    return [bool](
        $process -and
        $process.CommandLine -and
        $process.CommandLine.IndexOf($ProjectRoot, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
    )
}

function Test-ViewerAlreadyRunning {
    $apiListener = Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue |
        Select-Object -First 1
    $webListener = Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $apiListener -or -not $webListener) {
        return $false
    }
    if (-not (Test-ProjectProcess ([int]$apiListener.OwningProcess)) -or
        -not (Test-ProjectProcess ([int]$webListener.OwningProcess))) {
        return $false
    }

    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:8000/api/system/session" -TimeoutSec 2
        return $response.StatusCode -eq 200
    }
    catch {
        return $false
    }
}

function Stop-ProcessTree([int]$ProcessId) {
    $children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $ProcessId" -ErrorAction SilentlyContinue
    foreach ($child in $children) {
        Stop-ProcessTree -ProcessId ([int]$child.ProcessId)
    }

    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

try {
    Assert-Installed $NodeExe "The project-local Node.js runtime"
    Assert-Installed $BackendPython "The backend Python environment"
    Assert-Installed $ViteEntry "The frontend dependencies"
    if (Test-ViewerAlreadyRunning) {
        Write-Host "PixivUtil2 Web Viewer is already running." -ForegroundColor Green
        Write-Host "Viewer: http://localhost:3000"
        Write-Host "Close its existing terminal window before starting a new instance."
        exit 0
    }
    Assert-PortAvailable 8000 "The API"
    Assert-PortAvailable 3000 "The web UI"
    $viewerJob = New-ViewerProcessJob

    New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backendStdout = Join-Path $LogRoot "backend-$stamp.log"
    $backendStderr = Join-Path $LogRoot "backend-$stamp.error.log"
    $frontendStdout = Join-Path $LogRoot "frontend-$stamp.log"
    $frontendStderr = Join-Path $LogRoot "frontend-$stamp.error.log"

    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host " PixivUtil2 Web Viewer" -ForegroundColor Cyan
    Write-Host "=========================================" -ForegroundColor Cyan
    if ($Development) {
        Write-Host "Starting development API and web UI with automatic reload..."
    }
    else {
        Write-Host "Starting API and web UI in this terminal..."
    }

    $backendArguments = @("-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000")
    if ($Development) {
        $backendArguments += "--reload"
    }

    $backendProcess = Start-Process -FilePath $BackendPython `
        -ArgumentList $backendArguments `
        -WorkingDirectory (Join-Path $ProjectRoot "backend") `
        -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $backendStdout -RedirectStandardError $backendStderr
    $viewerJob.Add($backendProcess)

    $quotedViteEntry = '"' + $ViteEntry + '"'
    $frontendProcess = Start-Process -FilePath $NodeExe `
        -ArgumentList @($quotedViteEntry, "--host", "127.0.0.1") `
        -WorkingDirectory (Join-Path $ProjectRoot "frontend") `
        -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $frontendStdout -RedirectStandardError $frontendStderr
    $viewerJob.Add($frontendProcess)

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
    if ($Development) {
        Write-Host "Reload: frontend HMR + backend file watcher" -ForegroundColor Green
    }
    Write-Host "`nPress Ctrl+C or close this terminal window to stop both services."

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
            Stop-ProcessTree -ProcessId $process.Id
        }
    }
    if ($viewerJob) {
        $viewerJob.Dispose()
    }
}

exit $exitCode
