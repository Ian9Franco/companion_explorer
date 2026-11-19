# Inicia el núcleo API y abre la ventana. Pensado para la carpeta empaquetada del release.
$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$apiDir = Join-Path $root "api"
$apiExe = Join-Path $apiDir "CompanionExplorer.Api.exe"
$hostExe = Join-Path $root "CompanionExplorer.Host.exe"

if (-not (Test-Path $apiExe)) {
    throw "No se encontró $apiExe. Ejecutá este script desde la carpeta del release."
}
if (-not (Test-Path $hostExe)) {
    throw "No se encontró $hostExe. Ejecutá este script desde la carpeta del release."
}

$api = $null
try {
    $api = Start-Process -FilePath $apiExe -WorkingDirectory $apiDir -PassThru -WindowStyle Hidden
    $deadline = (Get-Date).AddSeconds(45)
    $ready = $false
    while ((Get-Date) -lt $deadline) {
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
        throw "El núcleo no respondió en 127.0.0.1:5080 a tiempo."
    }

    $hostProcess = Start-Process -FilePath $hostExe -WorkingDirectory $root -PassThru -Wait
    exit $hostProcess.ExitCode
} finally {
    if ($api -and -not $api.HasExited) {
        Stop-Process -Id $api.Id -Force -ErrorAction SilentlyContinue
    }
}