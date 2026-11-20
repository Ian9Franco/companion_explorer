param(
    [string]$OutputDir = "",
    [string]$Runtime = "win-x64",
    [string]$Version = "0.0.0",
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

$versionText = $Version.Trim().TrimStart("v", "V")
if ([string]::IsNullOrWhiteSpace($versionText)) { $versionText = "0.0.0" }

Write-Host "Publicando API en $apiStage"
dotnet publish $apiProject -c Release -r $Runtime --self-contained true -o $apiStage -p:Version=$versionText

Write-Host "Publicando ventana en $stage"
dotnet publish $hostProject -c Release -r $Runtime --self-contained true -o $stage -p:Version=$versionText

Set-Content -Path (Join-Path $stage "version.txt") -Value $versionText -NoNewline
Set-Content -Path (Join-Path $apiStage "version.txt") -Value $versionText -NoNewline

Write-Host "Copiando brands e interfaz"
Copy-Item -Recurse (Join-Path $repoRoot "brands") (Join-Path $stage "brands")
if (Test-Path (Join-Path $repoRoot "models")) {
    Copy-Item -Recurse (Join-Path $repoRoot "models") (Join-Path $stage "models")
}
Copy-Item -Recurse (Join-Path $repoRoot "frontend/out") (Join-Path $stage "out")

Write-Host ""
Write-Host "Listo: $stage"
Write-Host "Abrí CompanionExplorer.Host.exe (sin consola). El instalador arma el acceso directo."