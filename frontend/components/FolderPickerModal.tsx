"use client";

import { useEffect, useState } from "react";
import {
  BreadcrumbEntry,
  FolderEntry,
  RootEntry,
  fetchFolderListing,
  fetchRoots
} from "../lib/api";

type FolderPickerModalProps = {
  isOpen: boolean;
  initialPath?: string | null;
  recentFolders: string[];
  onSelectFolder: (path: string) => void;
  onClose: () => void;
};

export function FolderPickerModal({
  isOpen,
  initialPath,
  recentFolders,
  onSelectFolder,
  onClose
}: FolderPickerModalProps) {
  const [roots, setRoots] = useState<RootEntry[]>([]);
  const [browsingPath, setBrowsingPath] = useState<string>("");
  const [manualInput, setManualInput] = useState<string>("");
  const [subfolders, setSubfolders] = useState<FolderEntry[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbEntry[]>([]);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [mediaCount, setMediaCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasNativePicker, setHasNativePicker] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const w = window as unknown as {
        chrome?: { webview?: { postMessage?: (msg: string) => void } };
      };
      setHasNativePicker(Boolean(w.chrome?.webview?.postMessage));
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    fetchRoots()
      .then((list) => {
        if (!active) return;
        setRoots(list);
        const start = initialPath || recentFolders[0] || list[0]?.path || "";
        if (start) {
          setBrowsingPath(start);
          setManualInput(start);
        }
      })
      .catch(() => {
        if (!active) return;
      });

    return () => {
      active = false;
    };
  }, [isOpen, initialPath, recentFolders]);

  useEffect(() => {
    if (!isOpen || !browsingPath) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchFolderListing({
      path: browsingPath,
      signal: controller.signal
    })
      .then((listing) => {
        setSubfolders(listing.folders);
        setBreadcrumbs(listing.breadcrumbs);
        setParentPath(listing.parentPath);
        setMediaCount(listing.summary.totalCount);
        setManualInput(listing.path);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "No se pudo leer la carpeta.");
        setLoading(false);
      });

    return () => controller.abort();
  }, [isOpen, browsingPath]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleManualSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = manualInput.trim();
    if (!trimmed) return;
    setBrowsingPath(trimmed);
  };

  const handleOpenNativeDialog = () => {
    const w = window as unknown as {
      chrome?: { webview?: { postMessage?: (msg: string) => void } };
    };
    w.chrome?.webview?.postMessage?.("pick-folder");
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Elegir carpeta">
      <div className="picker-modal" onClick={(e) => e.stopPropagation()}>
        <header className="picker-header">
          <div>
            <h2>Elegir carpeta</h2>
            <p className="picker-subtitle">
              Navegá por tus unidades o pegá una ruta directa. Companion no modifica ni escribe archivos en tus carpetas.
            </p>
          </div>
          <div className="picker-header-actions">
            {hasNativePicker ? (
              <button type="button" className="btn btn-secondary" onClick={handleOpenNativeDialog}>
                Diálogo de Windows…
              </button>
            ) : null}
            <button type="button" className="btn-icon" onClick={onClose} aria-label="Cerrar">
              ✕
            </button>
          </div>
        </header>

        <form className="picker-path-form" onSubmit={handleManualSubmit}>
          <input
            type="text"
            className="picker-path-input"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder="Pegá una ruta (ej. C:\Usuarios\Fotos o /ruta/a/carpeta)"
            aria-label="Ruta de carpeta"
          />
          <button type="submit" className="btn btn-secondary">
            Ir a ruta
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!manualInput.trim()}
            onClick={() => onSelectFolder(manualInput.trim())}
          >
            Abrir en el explorador
          </button>
        </form>

        <div className="picker-body">
          <aside className="picker-sidebar">
            <div className="picker-section-title">Ubicaciones del sistema</div>
            <div className="picker-root-list">
              {roots.map((root) => (
                <button
                  key={root.path}
                  type="button"
                  className={`picker-root-item ${browsingPath === root.path ? "active" : ""}`}
                  onClick={() => setBrowsingPath(root.path)}
                >
                  <span className="picker-root-icon">{getRootIcon(root.kind)}</span>
                  <span className="picker-root-text">
                    <strong>{root.name}</strong>
                    <small>{root.path}</small>
                  </span>
                </button>
              ))}
            </div>

            {recentFolders.length > 0 ? (
              <>
                <div className="picker-section-title" style={{ marginTop: "1rem" }}>
                  Recientes
                </div>
                <div className="picker-root-list">
                  {recentFolders.map((recent) => (
                    <button
                      key={recent}
                      type="button"
                      className={`picker-root-item ${browsingPath === recent ? "active" : ""}`}
                      onClick={() => setBrowsingPath(recent)}
                    >
                      <span className="picker-root-icon">↺</span>
                      <span className="picker-root-text">
                        <strong>{recent.split(/[/\\]/).filter(Boolean).pop() || recent}</strong>
                        <small>{recent}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </aside>

          <section className="picker-browser">
            <div className="picker-breadcrumbs-bar">
              {parentPath ? (
                <button
                  type="button"
                  className="btn-chip"
                  onClick={() => setBrowsingPath(parentPath)}
                  title="Subir a carpeta superior"
                >
                  ↑ Subir
                </button>
              ) : null}
              <div className="picker-breadcrumbs">
                {breadcrumbs.map((crumb, idx) => (
                  <span key={crumb.path} className="crumb-wrap">
                    {idx > 0 ? <span className="crumb-sep">/</span> : null}
                    <button
                      type="button"
                      className="crumb-btn"
                      onClick={() => setBrowsingPath(crumb.path)}
                    >
                      {crumb.name}
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {error ? <div className="picker-error">{error}</div> : null}

            <div className="picker-folder-list">
              {loading ? (
                <div className="picker-empty">Cargando subcarpetas…</div>
              ) : subfolders.length === 0 ? (
                <div className="picker-empty">
                  Esta carpeta no tiene subcarpetas internas.
                  {mediaCount > 0 ? ` Contiene ${mediaCount} archivos multimedia directos.` : ""}
                </div>
              ) : (
                subfolders.map((folder) => (
                  <div key={folder.path} className="picker-folder-row">
                    <button
                      type="button"
                      className="picker-folder-enter"
                      onClick={() => setBrowsingPath(folder.path)}
                    >
                      <span className="folder-glyph">▸</span>
                      <span className="folder-row-name">{folder.name}</span>
                    </button>
                    <button
                      type="button"
                      className="btn-chip"
                      onClick={() => onSelectFolder(folder.path)}
                    >
                      Elegir
                    </button>
                  </div>
                ))
              )}
            </div>

            <footer className="picker-footer">
              <div className="picker-current-meta">
                <span>Carpeta seleccionada:</span>
                <code>{browsingPath || "Ninguna"}</code>
                {!loading && !error ? (
                  <span className="badge-pill">{mediaCount} archivos directos</span>
                ) : null}
              </div>
              <div className="picker-footer-actions">
                <button type="button" className="btn btn-secondary" onClick={onClose}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!browsingPath}
                  onClick={() => onSelectFolder(browsingPath)}
                >
                  Explorar esta carpeta
                </button>
              </div>
            </footer>
          </section>
        </div>
      </div>
    </div>
  );
}

function getRootIcon(kind: string): string {
  switch (kind) {
    case "pictures":
      return "▣";
    case "videos":
      return "▶";
    case "music":
      return "♪";
    case "downloads":
      return "↓";
    case "desktop":
      return "⊞";
    case "drive":
      return "▤";
    default:
      return "⌂";
  }
}
