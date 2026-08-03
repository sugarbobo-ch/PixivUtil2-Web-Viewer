# PixivUtil2 Web Viewer Launcher
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " Starting PixivUtil2 Web Viewer & API..." -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

$webConfigPath = Join-Path $PSScriptRoot "web_config.json"
$autoOpenBrowser = $true
if (Test-Path -LiteralPath $webConfigPath) {
    try {
        $webConfig = Get-Content -LiteralPath $webConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($null -ne $webConfig.autoOpenBrowser) {
            $autoOpenBrowser = if ($webConfig.autoOpenBrowser -is [string]) {
                $webConfig.autoOpenBrowser -notmatch '^(false|0|no)$'
            } else {
                [bool]$webConfig.autoOpenBrowser
            }
        }
    } catch {
        Write-Warning "Unable to read web_config.json; using automatic browser launch by default."
    }
}

Set-Location -Path "$PSScriptRoot\backend"
Start-Process -FilePath "uv" -ArgumentList "run uvicorn main:app --port 8000 --reload" -WindowStyle Normal

$frontendPath = Join-Path $PSScriptRoot "frontend"
$frontendProcess = Start-Process -FilePath "cmd.exe" -ArgumentList @('/c', 'pnpm dev') -WorkingDirectory $frontendPath -WindowStyle Normal -PassThru
Start-Sleep -Seconds 2
if ($autoOpenBrowser) {
    Start-Process "http://localhost:3000"
}
Wait-Process -Id $frontendProcess.Id
