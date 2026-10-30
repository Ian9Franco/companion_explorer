# Companion Explorer

Explorador de archivos locales de la familia Companion. La interfaz es Next.js. El núcleo es C# y .NET 9.

Sin IA tiene que ser mejor que el Explorador de Windows para mirar y abrir fotos, video y audio. Hoy ya cataloga: filtros, colecciones y línea de tiempo salen de un SQLite, y la búsqueda visual se agrega después sobre esa misma tabla. El camino y el mapa del código están en [docs/CAMINO.md](docs/CAMINO.md).

Fanger es un sabor: otro preload y otro logo, en `brands/fanger`. El código no se bifurca.

## Desarrollo

Hace falta .NET 9 y Node 22.

```bash
dotnet test
dotnet run --project src/CompanionExplorer.Api
```

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

El API queda en `http://127.0.0.1:5080`. Next, en `http://localhost:3000`.

`COMPANION_BRAND=fanger` cambia la marca que sirve el API. El valor por defecto es `companion`.

El catálogo SQLite y las miniaturas viven en `COMPANION_DATA_DIR` (si no, en `%LocalAppData%/CompanionExplorer`). Las carpetas del usuario no se modifican.

La ventana nativa (`src/CompanionExplorer.Host`) usa WebView2 y solo compila en Windows.
