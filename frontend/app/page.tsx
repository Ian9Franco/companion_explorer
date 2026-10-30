"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  API_URL,
  Brand,
  FolderListing,
  MediaFileEntry,
  MediaKind,
  RootEntry,
  fetchBrand,
  fetchFolderListing,
  fetchRoots,
  formatBytes
} from "../lib/api";
import { FolderPickerModal } from "../components/FolderPickerModal";
import { GridDensity, VirtualizedMediaGrid } from "../components/VirtualizedMediaGrid";
import { MediaViewerModal } from "../components/MediaViewerModal";
import { AudioMiniPlayer } from "../components/AudioMiniPlayer";

const RECENT_STORAGE_KEY = "companion.recentFolders.v1";

export default function CompanionExplorerPage() {
  const [brand, setBrand] = useState<Brand | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [roots, setRoots] = useState<RootEntry[]>([]);
  const [recentFolders, setRecentFolders] = useState<string[]>([]);

  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [listing, setListing] = useState<FolderListing | null>(null);
  const [loadingFolder, setLoadingFolder] = useState<boolean>(false);
  const [folderError, setFolderError] = useState<string | null>(null);

  const [kindFilter, setKindFilter] = useState<"all" | MediaKind>("all");
  const [searchInput, setSearchInput] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [sortBy, setSortBy] = useState<"date" | "name" | "size" | "type">("date");
  const [sortDesc, setSortDesc] = useState<boolean>(true);
  const [recursive, setRecursive] = useState<boolean>(false);
  const [density, setDensity] = useState<GridDensity>("medium");

  const [pickerOpen, setPickerOpen] = useState<boolean>(false);
  const [quickPathInput, setQuickPathInput] = useState<string>("");
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [activeAudioTrack, setActiveAudioTrack] = useState<MediaFileEntry | null>(null);

  // Load recent folders from localStorage
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RECENT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed)) {
          setRecentFolders(parsed.filter((item) => typeof item === "string" && item.length > 0));
        }
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  const rememberFolder = useCallback((folderPath: string) => {
    setRecentFolders((prev) => {
      const next = [folderPath, ...prev.filter((p) => p !== folderPath)].slice(0, 8);
      try {
        window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, []);

  const openFolder = useCallback((folderPath: string) => {
    const trimmed = folderPath.trim();
    if (!trimmed) return;
    setCurrentPath(trimmed);
    setPickerOpen(false);
    setSelectedIndex(-1);
    setViewerIndex(null);
  }, []);

  // Listen for native WebView2 folder selection messages
  useEffect(() => {
    const w = window as unknown as {
      chrome?: {
        webview?: {
          addEventListener?: (type: string, listener: (event: { data: unknown }) => void) => void;
          removeEventListener?: (type: string, listener: (event: { data: unknown }) => void) => void;
        };
      };
    };

    const webview = w.chrome?.webview;
    if (!webview?.addEventListener) return;

    const handler = (event: { data: unknown }) => {
      try {
        const payload =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (payload && typeof payload === "object" && "type" in payload && payload.type === "folder-picked") {
          const picked = (payload as { path?: string }).path;
          if (picked) {
            openFolder(picked);
          }
        }
      } catch {
        // Ignore malformed host messages
      }
    };

    webview.addEventListener("message", handler);
    return () => webview.removeEventListener?.("message", handler);
  }, [openFolder]);

  // Connect to API (/brand and /roots)
  useEffect(() => {
    const controller = new AbortController();

    Promise.all([fetchBrand(controller.signal), fetchRoots(controller.signal)])
      .then(([brandData, rootsData]) => {
        setBrand(brandData);
        setRoots(rootsData);
        setApiError(null);
        document.title = brandData.windowTitle;
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setApiError("No llega el núcleo. Levantá CompanionExplorer.Api en el puerto 5080.");
        }
      });

    return () => controller.abort();
  }, []);

  // Debounce search input
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 140);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  // Fetch folder contents whenever path or query changes
  useEffect(() => {
    if (!currentPath) return;

    const controller = new AbortController();
    setLoadingFolder(true);
    setFolderError(null);

    fetchFolderListing({
      path: currentPath,
      kind: kindFilter,
      search: debouncedSearch,
      sort: sortBy,
      desc: sortDesc,
      recursive,
      signal: controller.signal
    })
      .then((data) => {
        setListing(data);
        setLoadingFolder(false);
        rememberFolder(data.path);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setFolderError(err instanceof Error ? err.message : "No se pudo abrir la carpeta.");
        setLoadingFolder(false);
      });

    return () => controller.abort();
  }, [currentPath, kindFilter, debouncedSearch, sortBy, sortDesc, recursive, rememberFolder]);

  const title = brand?.preloadTitle ?? "Companion";
  const logo = brand ? `${API_URL}${brand.logoUrl}` : null;

  const audioTracks = useMemo(
    () => (listing?.files ?? []).filter((f) => f.kind === "audio"),
    [listing?.files]
  );

  const handleOpenFile = useCallback((file: MediaFileEntry, index: number) => {
    if (file.kind === "audio") {
      setActiveAudioTrack(file);
    } else {
      setViewerIndex(index);
    }
  }, []);

  const handleInspectTrack = useCallback(
    (track: MediaFileEntry) => {
      if (!listing) return;
      const idx = listing.files.findIndex((f) => f.path === track.path);
      if (idx >= 0) {
        setViewerIndex(idx);
      }
    },
    [listing]
  );

  // Welcome / Preload view when no folder is open yet
  if (!currentPath) {
    return (
      <main className="preload-screen">
        <div className="preload-hero">
          {logo ? <img src={logo} alt="" className="preload-logo" /> : null}
          <h1>{title}</h1>
          <p className="preload-lead">
            {apiError ??
              (brand
                ? `${brand.productName}. El explorador empieza cuando elijas una carpeta.`
                : "Conectando con el núcleo…")}
          </p>

          {!apiError && brand ? (
            <div className="preload-actions">
              <button
                type="button"
                className="btn btn-primary btn-large"
                onClick={() => setPickerOpen(true)}
              >
                Elegir carpeta…
              </button>

              <form
                className="preload-quick-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (quickPathInput.trim()) {
                    openFolder(quickPathInput.trim());
                  }
                }}
              >
                <input
                  type="text"
                  value={quickPathInput}
                  onChange={(e) => setQuickPathInput(e.target.value)}
                  placeholder="O pegá una ruta directa (ej. C:\Fotos o /workspace)"
                  aria-label="Ruta directa"
                />
                <button
                  type="submit"
                  className="btn btn-secondary"
                  disabled={!quickPathInput.trim()}
                >
                  Abrir
                </button>
              </form>
            </div>
          ) : null}

          {!apiError && (roots.length > 0 || recentFolders.length > 0) ? (
            <div className="preload-locations">
              {recentFolders.length > 0 ? (
                <div className="preload-group">
                  <span className="preload-group-label">Recientes</span>
                  <div className="preload-chip-row">
                    {recentFolders.slice(0, 4).map((folder) => (
                      <button
                        key={folder}
                        type="button"
                        className="location-pill"
                        onClick={() => openFolder(folder)}
                      >
                        <span>↺</span>
                        <strong>{folder.split(/[/\\]/).filter(Boolean).pop() || folder}</strong>
                        <small>{folder}</small>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {roots.length > 0 ? (
                <div className="preload-group">
                  <span className="preload-group-label">Ubicaciones del sistema</span>
                  <div className="preload-chip-row">
                    {roots.map((root) => (
                      <button
                        key={root.path}
                        type="button"
                        className="location-pill"
                        onClick={() => openFolder(root.path)}
                      >
                        <strong>{root.name}</strong>
                        <small>{root.path}</small>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <FolderPickerModal
          isOpen={pickerOpen}
          initialPath={currentPath}
          recentFolders={recentFolders}
          onSelectFolder={openFolder}
          onClose={() => setPickerOpen(false)}
        />
      </main>
    );
  }

  const summary = listing?.summary ?? {
    totalCount: 0,
    imageCount: 0,
    videoCount: 0,
    audioCount: 0,
    totalBytes: 0
  };

  return (
    <div className={`explorer-shell ${activeAudioTrack ? "has-miniplayer" : ""}`}>
      <header className="explorer-topbar">
        <div className="topbar-brand" onClick={() => setCurrentPath(null)} role="button" tabIndex={0}>
          {logo ? <img src={logo} alt="" className="topbar-logo" /> : null}
          <span className="topbar-brand-name">{brand?.productName ?? title}</span>
        </div>

        <div className="topbar-nav">
          <button
            type="button"
            className="btn-chip"
            disabled={!listing?.parentPath}
            onClick={() => listing?.parentPath && openFolder(listing.parentPath)}
            title="Subir a la carpeta superior"
          >
            ↑ Subir
          </button>

          <nav className="breadcrumbs-trail" aria-label="Ruta actual">
            {(listing?.breadcrumbs ?? []).map((crumb, idx) => (
              <span key={crumb.path} className="crumb-wrap">
                {idx > 0 ? <span className="crumb-sep">/</span> : null}
                <button
                  type="button"
                  className={`crumb-btn ${idx === (listing?.breadcrumbs.length ?? 0) - 1 ? "current" : ""}`}
                  onClick={() => openFolder(crumb.path)}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </nav>
        </div>

        <div className="topbar-actions">
          <div className="search-box">
            <span className="search-icon">⌕</span>
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Filtrar por nombre o subcarpeta…"
              aria-label="Filtrar archivos por nombre"
            />
            {searchInput ? (
              <button
                type="button"
                className="search-clear"
                onClick={() => setSearchInput("")}
                aria-label="Limpiar búsqueda"
              >
                ✕
              </button>
            ) : null}
          </div>

          <button
            type="button"
            className={`btn-chip ${recursive ? "active" : ""}`}
            onClick={() => setRecursive((v) => !v)}
            title="Incluir archivos de todas las subcarpetas (aplanar árbol)"
          >
            {recursive ? "Árbol aplanado ✓" : "Aplanar subcarpetas"}
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setPickerOpen(true)}
          >
            Cambiar carpeta…
          </button>
        </div>
      </header>

      <section className="explorer-toolbar">
        <div className="filter-tabs" role="tablist" aria-label="Filtro por tipo de archivo">
          <button
            type="button"
            role="tab"
            aria-selected={kindFilter === "all"}
            className={`filter-tab ${kindFilter === "all" ? "active" : ""}`}
            onClick={() => setKindFilter("all")}
          >
            Todo <span className="tab-count">{summary.totalCount}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={kindFilter === "image"}
            className={`filter-tab ${kindFilter === "image" ? "active" : ""}`}
            onClick={() => setKindFilter("image")}
          >
            Fotos <span className="tab-count">{summary.imageCount}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={kindFilter === "video"}
            className={`filter-tab ${kindFilter === "video" ? "active" : ""}`}
            onClick={() => setKindFilter("video")}
          >
            Video <span className="tab-count">{summary.videoCount}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={kindFilter === "audio"}
            className={`filter-tab ${kindFilter === "audio" ? "active" : ""}`}
            onClick={() => setKindFilter("audio")}
          >
            Audio <span className="tab-count">{summary.audioCount}</span>
          </button>
        </div>

        <div className="toolbar-right">
          <span className="summary-bytes">{formatBytes(summary.totalBytes)}</span>

          <div className="sort-controls">
            <label htmlFor="sort-select" className="sr-only">
              Ordenar por
            </label>
            <select
              id="sort-select"
              value={sortBy}
              onChange={(e) => {
                const next = e.target.value as "date" | "name" | "size" | "type";
                setSortBy(next);
                setSortDesc(next === "date" || next === "size");
              }}
              className="toolbar-select"
            >
              <option value="date">Fecha</option>
              <option value="name">Nombre</option>
              <option value="size">Tamaño</option>
              <option value="type">Tipo</option>
            </select>
            <button
              type="button"
              className="btn-chip"
              onClick={() => setSortDesc((v) => !v)}
              title={sortDesc ? "Orden descendente" : "Orden ascendente"}
            >
              {sortDesc ? "↓ Desc" : "↑ Asc"}
            </button>
          </div>

          <div className="density-controls" role="group" aria-label="Tamaño de grilla">
            <button
              type="button"
              className={`btn-chip ${density === "compact" ? "active" : ""}`}
              onClick={() => setDensity("compact")}
            >
              Compacta
            </button>
            <button
              type="button"
              className={`btn-chip ${density === "medium" ? "active" : ""}`}
              onClick={() => setDensity("medium")}
            >
              Media
            </button>
            <button
              type="button"
              className={`btn-chip ${density === "large" ? "active" : ""}`}
              onClick={() => setDensity("large")}
            >
              Grande
            </button>
          </div>
        </div>
      </section>

      {listing && listing.folders.length > 0 && !recursive ? (
        <section className="subfolders-strip" aria-label="Subcarpetas">
          <span className="subfolders-label">Subcarpetas ({listing.folders.length})</span>
          <div className="subfolders-list">
            {listing.folders.map((sub) => (
              <button
                key={sub.path}
                type="button"
                className="subfolder-chip"
                onClick={() => openFolder(sub.path)}
              >
                <span className="folder-glyph">▸</span>
                <span>{sub.name}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <main className="explorer-stage">
        {folderError ? (
          <div className="stage-status error">
            <p>{folderError}</p>
            <button type="button" className="btn btn-secondary" onClick={() => setPickerOpen(true)}>
              Elegir otra carpeta
            </button>
          </div>
        ) : loadingFolder && !listing ? (
          <div className="stage-status">Leyendo carpeta…</div>
        ) : listing && listing.files.length === 0 ? (
          <div className="stage-status">
            <p>
              No hay archivos multimedia que coincidan en esta carpeta.
              {listing.folders.length > 0 && !recursive
                ? " Probá entrar a una subcarpeta o activar «Aplanar subcarpetas»."
                : ""}
            </p>
            {listing.folders.length > 0 && !recursive ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setRecursive(true)}
              >
                Aplanar subcarpetas ({listing.folders.length})
              </button>
            ) : null}
          </div>
        ) : listing ? (
          <VirtualizedMediaGrid
            files={listing.files}
            density={density}
            selectedIndex={selectedIndex}
            activeAudioPath={activeAudioTrack?.path ?? null}
            onSelectIndex={setSelectedIndex}
            onOpenFile={handleOpenFile}
          />
        ) : null}
      </main>

      <FolderPickerModal
        isOpen={pickerOpen}
        initialPath={currentPath}
        recentFolders={recentFolders}
        onSelectFolder={openFolder}
        onClose={() => setPickerOpen(false)}
      />

      <MediaViewerModal
        files={listing?.files ?? []}
        currentIndex={viewerIndex}
        onChangeIndex={(nextIdx) => {
          setSelectedIndex(nextIdx);
          setViewerIndex(nextIdx);
        }}
        onClose={() => setViewerIndex(null)}
      />

      <AudioMiniPlayer
        track={activeAudioTrack}
        audioTracks={audioTracks}
        onSelectTrack={(track) => setActiveAudioTrack(track)}
        onInspectTrack={handleInspectTrack}
        onClose={() => setActiveAudioTrack(null)}
      />
    </div>
  );
}
