# Inicia el núcleo API y abre la ventana. Pensado para la carpeta empaquetada del release.
$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$apiDir = Join-Path $root "api"
$apiExe = Join-Path $apiDir "CompanionExplorer.Api.exe"
$hostExe = Join-Path $root "CompanionExplorer.Host.exe"
$logPath = Join-Path $root "companion-api.log"

if (-not (Test-Path $apiExe)) {
    throw "No se encontró $apiExe. Ejecutá este script desde la carpeta del release."
}
if (-not (Test-Path $hostExe)) {
    throw "No se encontró $hostExe. Ejecutá este script desde la carpeta del release."
}

$api = $null
try {
    if (Test-Path $logPath) {
        Remove-Item $logPath -Force
    }

    Write-Host "Iniciando núcleo…"
    $api = Start-Process `
        -FilePath $apiExe `
        -WorkingDirectory $apiDir `
        -PassThru `
        -WindowStyle Hidden `
        -RedirectStandardOutput $logPath `
        -RedirectStandardError $logPath

    $deadline = (Get-Date).AddSeconds(45)
    $ready = $false
    while ((Get-Date) -lt $deadline) {
        if ($api.HasExited) {
            $tail = ""
            if (Test-Path $logPath) {
                $tail = (Get-Content $logPath -Tail 12) -join [Environment]::NewLine
            }
            throw "El núcleo se cerró antes de responder (código $($api.ExitCode)). Detalle en companion-api.log:`n$tail"
        }

        try {
            $response = Invoke-WebRequest -Uri "http://127.0.0.1:5080/health" -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) {
                $ready = $true
                break
            }
        } catch {
            # El API todavía está levantando.
        }
        Start-Sleep -Milliseconds 250
    }

    if (-not $ready) {
        throw "El núcleo no respondió en 127.0.0.1:5080. Revisá companion-api.log en esta carpeta."
    }

    Write-Host "Abriendo Companion…"
    $hostProcess = Start-Process -FilePath $hostExe -WorkingDirectory $root -PassThru -Wait
    exit $hostProcess.ExitCode
} catch {
    Write-Host ""
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    if ($api -and -not $api.HasExited) {
        Stop-Process -Id $api.Id -Force -ErrorAction SilentlyContinue
    }
}