# Camino de Companion Explorer

Companion Explorer es el explorador de la familia Companion. Tiene que ser mejor que el Explorador de archivos de Windows para mirar, filtrar y abrir fotos, video y audio. La búsqueda con IA se suma encima de ese explorador, cuando listar y ver ya se sienten mejor que abrir el Explorador.

Este repositorio no continúa Smart Scan. Lo usa como referencia de producto: grilla de un árbol, filtros, colecciones, visor a tamaño real y, más adelante, búsqueda visual sobre el mismo catálogo.

## Familia

| Producto | Qué es | Dónde vive |
|---|---|---|
| Companion Explorer | Explorador de archivos locales | Este repositorio |
| Companion Extension | Extensión de Google | Otro repositorio |
| Companion Report | Informes | Todavía no existe |

Comparten el nombre y la marca. No comparten código en este repositorio. Juntarlos ahora frenaría al explorador.

## Sabores

El código se construye como Companion. Fanger es la compañía: el mismo programa, con otro preload y otro logo.

La marca vive en `brands/<id>/`. Hoy existen `companion` y `fanger`. Cada carpeta tiene `brand.json` y `logo.svg`. El núcleo lee `COMPANION_BRAND` (por defecto `companion`) y no tiene ramas `if (fanger)` en la lógica.

## Arquitectura

Next.js dibuja la interfaz. C# hace el trabajo de disco.

```
Ventana WebView2
    carga Next (dev: localhost:3000, release: exportación estática)
         |
         |  HTTP en 127.0.0.1
         v
CompanionExplorer.Api          contrato con el front
CompanionExplorer.Core         marca, y después catálogo y miniaturas
CompanionExplorer.Host         ventana Windows. Solo compila en Windows
```

El front no recorre el disco y no genera miniaturas. Le pide al API la lista, la miniatura y el archivo. Las miniaturas de la grilla tienen que salir del caché de Windows (`IShellItemImageFactory`), ya achicadas. El visor pide el archivo original aparte, para que una miniatura lenta no tape la foto.

Esa división es la que Smart Scan no tenía: la interfaz y Pillow compartían un servidor de un solo hilo, y la foto a tamaño real quedaba atrás de la grilla.

## Qué no entra desde Smart Scan

- pywebview, Bottle y el puente `window.pywebview.api`
- PyTorch, Transformers y el par `vectores.npy` / `datos.json`
- Audio y documentos que respondían éxito sin indexar
- Dos programas distintos para Ian y Fanger

## Fases

1. **Explorador, sin IA.** Elegir carpeta, grilla virtualizada, miniatura del sistema, clic y la foto a tamaño real. Miles de archivos sin cargar todo en memoria. Hasta que esto no se sienta mejor que el Explorador, no hay modelo.
2. **Catálogo.** SQLite con ruta, tamaño, fecha y tipo. Filtros, colecciones y línea de tiempo sobre esa tabla.
3. **Búsqueda visual.** Una interfaz `IEmbedder`: entra una imagen o un texto, sale un vector. La implementación puede ser ONNX con DirectML, o un proceso Python si SigLIP todavía no exporta. El índice guarda el id del modelo junto al vector. Si el modelo cambia, no se escribe encima de un índice viejo. Un video puede tener varios frames. La búsqueda muestra el archivo una sola vez.

## Contrato que el front ya puede usar

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/health` | El núcleo está en marcha |
| GET | `/brand` | Nombre, título de ventana, texto de preload y URL del logo |
| GET | `/brand/logo` | SVG de la marca activa |
| GET | `/roots` | Ubicaciones del sistema y unidades listas para explorar |
| GET | `/folders` | Subcarpetas, archivos multimedia (`path`, `kind`, `search`, `sort`, `desc`, `recursive`) y resumen |
| GET | `/thumb` | Miniatura achicada (`IShellItemImageFactory` en Windows + caché Zero-Touch). `204` si no hay miniatura |
| GET | `/file` | Archivo original a tamaño real con rangos HTTP (`206`) para video y audio |
| GET | `/libraries` | Bibliotecas catalogadas y si hay un escaneo en curso |
| POST | `/libraries` | Agrega una carpeta (`201` nueva, `200` ya existía, `409` si queda anidada) y encola el escaneo |
| POST | `/libraries/{id}/scan` | Vuelve a escanear (`202`) |
| DELETE | `/libraries/{id}` | Quita la biblioteca del catálogo. No toca el disco |
| GET | `/catalog/files` | Página del catálogo: `library`, `collection`, `kind`, `ext`, `search`, `from`, `to`, `sort`, `desc`, `offset`, `limit` |
| GET | `/catalog/summary` | Conteos por tipo y extensión, y la línea de tiempo por mes. La línea de tiempo ignora `from`/`to`; los conteos de tipo ignoran `kind` y `ext` |
| GET | `/collections` | Colecciones, con cantidad y portada |
| POST | `/collections` | Crea una colección |
| PATCH | `/collections/{id}` | La renombra |
| DELETE | `/collections/{id}` | La borra. Los archivos siguen en su carpeta |
| POST | `/collections/{id}/items` | Agrega rutas. Si el archivo no estaba catalogado, se ficha en el momento |
| POST | `/collections/{id}/items/remove` | Quita rutas de la colección |

El API escucha en `http://127.0.0.1:5080`. Next lee `NEXT_PUBLIC_API_URL`.

El catálogo es `catalog.db` en el directorio de datos: `COMPANION_DATA_DIR`, o `%LocalAppData%/CompanionExplorer` si no está definida. Ahí también queda `cache/thumbs`. El escaneo no escribe nada en las carpetas del usuario. `COMPANION_SCAN_ON_START=false` evita reescanear al arrancar.

## Cómo se corre hoy

En dos terminales, desde la raíz del repositorio:

```bash
dotnet run --project src/CompanionExplorer.Api
```

```bash
cd frontend
npm install
npm run dev
```

La ventana de WebView2 (`src/CompanionExplorer.Host`) carga `http://localhost:3000` en desarrollo o la exportación estática (`https://companion.local`) en release, sincroniza el título de la marca activa y abre el selector nativo de carpetas de Windows cuando recibe `pick-folder`.
