param(
    [string]$OutputDir = "",
    [string]$Runtime = "win-x64",
    [switch]$SkipFrontendInstall
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$bundleName = if ($OutputDir) { Split-Path $OutputDir -Leaf } else { "CompanionExplorer-$Runtime" }
$stage = if ($OutputDir) {
    Join-Path $repoRoot ($OutputDir -replace '/', '\')
} else {
    Join-Path $repoRoot "dist" $bundleName
}

$frontendDir = Join-Path $repoRoot "frontend"
$apiProject = Join-Path $repoRoot "src/CompanionExplorer.Api/CompanionExplorer.Api.csproj"
$hostProject = Join-Path $repoRoot "src/CompanionExplorer.Host/CompanionExplorer.Host.csproj"

Push-Location $frontendDir
try {
    if (-not $SkipFrontendInstall) {
        npm ci
        npm run lint
    }
    npm run build
    if (-not (Test-Path (Join-Path $frontendDir "out/index.html"))) {
        throw "No se generó frontend/out. Revisá npm run build."
    }
} finally {
    Pop-Location
}

if (Test-Path $stage) {
    Remove-Item -Recurse -Force $stage
}
New-Item -ItemType Directory -Path $stage | Out-Null
$apiStage = Join-Path $stage "api"
New-Item -ItemType Directory -Path $apiStage | Out-Null

Write-Host "Publicando API en $apiStage"
dotnet publish $apiProject -c Release -r $Runtime --self-contained true -o $apiStage

Write-Host "Publicando ventana en $stage"
dotnet publish $hostProject -c Release -r $Runtime --self-contained true -o $stage

Write-Host "Copiando brands, interfaz y launcher"
Copy-Item -Recurse (Join-Path $repoRoot "brands") (Join-Path $stage "brands")
Copy-Item -Recurse (Join-Path $repoRoot "frontend/out") (Join-Path $stage "out")
Copy-Item (Join-Path $PSScriptRoot "Start-Companion.ps1") (Join-Path $stage "Start-Companion.ps1")
Copy-Item (Join-Path $PSScriptRoot "Start-Companion.bat") (Join-Path $stage "Start-Companion.bat")

Write-Host ""
Write-Host "Listo: $stage"
Write-Host "Para probar: Start-Companion.bat"