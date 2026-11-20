# Release de Companion Explorer (Windows)

Distribución **portable** para Windows: un ZIP con el núcleo API, la ventana WebView2 y la interfaz estática. No hace falta clonar el repositorio ni tener Node instalado para **usar** el release; solo para **armarlo**.

## Requisitos en la PC del usuario

- Windows 10 u 11 (64 bits).
- [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (en muchas PCs ya viene con Edge).
- No hace falta instalar .NET por separado: el release se publica **self-contained**.

Los datos (`catalog.db`, miniaturas) van a `%LocalAppData%\CompanionExplorer`. Las preferencias de cerebro van en `brain.settings.json`; la **API key del proveedor** (si la configurás) en `brain.provider.key`, cifrada con **DPAPI** del usuario de Windows — no hace falta volver a pegarla en cada apertura. La variable `COMPANION_BRAIN_PROVIDER_API_KEY` sigue pudiendo usarse como override puntual. Los **modelos ONNX** van en la carpeta **`models/`** al lado del ZIP (misma raíz que `Start-Companion.bat`). Companion los verifica al arrancar y, cuando el manifest tenga URLs, los **descarga solo** ahí; el usuario no busca archivos por el disco. El pipeline de release puede **prefetch** los `.onnx` en el build para entregar el ZIP ya completo.

## Instalar

1. Descargá **`CompanionExplorer-Setup.exe`** desde [GitHub Releases](https://github.com/Ian9Franco/companion_explorer/releases).
2. Ejecutalo (no pide administrador). Instala en `%LocalAppData%\Programs\Companion Explorer`.
3. Abrí **Companion Explorer** desde el escritorio o el menú Inicio.

No hace falta el `.bat`. `CompanionExplorer.Host.exe` es una ventana: muestra **«Abriendo Companion»**, levanta el núcleo sin consola y abre la app. Al cerrar, detiene el núcleo.

Si hay una release más nueva, el panel izquierdo muestra **Actualizar**. Descarga el instalador, lo ejecuta y cierra la app para poder reemplazar los archivos.

Contenido de la carpeta:

| Ruta | Qué es |
|------|--------|
| `Start-Companion.bat` | Entrada recomendada |
| `CompanionExplorer.Host.exe` | Ventana (WebView2) |
| `api/CompanionExplorer.Api.exe` | Núcleo HTTP |
| `out/` | Interfaz exportada de Next.js |
| `brands/` | Marca activa (`companion` por defecto) |
| `models/` | Manifest ONNX (`image.onnx`, `text.onnx`, `vocab.json`, `merges.txt`) junto al programa |

Variables opcionales (mismas que en desarrollo):

- `COMPANION_BRAND` — `companion` o `fanger`
- `COMPANION_DATA_DIR` — carpeta de `catalog.db` y caché
- `COMPANION_INSTALL_DIR` — raíz del ZIP (override de dónde está `models/`)
- `COMPANION_BRAIN_PROVIDER_API_KEY` — solo si en el futuro usás embedder «proveedor» con tu cuenta (Companion no la incluye)
- `COMPANION_WEB_URL` — URL de la interfaz (solo si no usás `out/`)

## Armar el release a mano

En Windows, con **.NET 9 SDK** y **Node 22**:

```powershell
./scripts/build-release.ps1
```

La salida queda en `dist/CompanionExplorer-win-x64/` (nombre por defecto). Probá con:

```powershell
./dist/CompanionExplorer-win-x64/Start-Companion.bat
```

Parámetros útiles:

```powershell
./scripts/build-release.ps1 -OutputDir "dist/v0.1.0-win-x64"
./scripts/build-release.ps1 -SkipFrontendInstall   # si ya corriste npm ci
```

## Release automático en GitHub

Al pushear un tag `v*` (por ejemplo `v0.1.0`), el workflow [`.github/workflows/release.yml`](../.github/workflows/release.yml) corre en `windows-latest`, ejecuta `build-release.ps1`, genera el ZIP y publica un **GitHub Release** con el asset.

```bash
git tag v0.1.0
git push origin v0.1.0
```

## Qué no incluye (todavía)

- Instalador MSI/Inno Setup.
- Un solo ejecutable que no dependa de la carpeta `api/`.
- Builds para Linux o macOS (el Host es `net9.0-windows`).