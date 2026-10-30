"use client";

import { useEffect, useState } from "react";
import {
  MediaFileEntry,
  formatBytes,
  formatFullDateTime,
  getFileUrl,
  getThumbUrl
} from "../lib/api";

type MediaViewerModalProps = {
  files: MediaFileEntry[];
  currentIndex: number | null;
  onChangeIndex: (newIndex: number) => void;
  onClose: () => void;
};

export function MediaViewerModal({
  files,
  currentIndex,
  onChangeIndex,
  onClose
}: MediaViewerModalProps) {
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState<boolean>(false);
  const [dragOrigin, setDragOrigin] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showInfo, setShowInfo] = useState<boolean>(false);
  const [compareFile, setCompareFile] = useState<MediaFileEntry | null>(null);
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null);
  const [copiedPath, setCopiedPath] = useState<boolean>(false);

  const file =
    currentIndex !== null && currentIndex >= 0 && currentIndex < files.length
      ? files[currentIndex]
      : null;

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setDimensions(null);
    setCopiedPath(false);
  }, [currentIndex]);

  useEffect(() => {
    if (file === null || currentIndex === null) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        if (currentIndex < files.length - 1) {
          onChangeIndex(currentIndex + 1);
        }
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (currentIndex > 0) {
          onChangeIndex(currentIndex - 1);
        }
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setZoom((z) => Math.min(4, Number((z + 0.5).toFixed(2))));
      } else if (event.key === "-") {
        event.preventDefault();
        setZoom((z) => {
          const next = Math.max(1, Number((z - 0.5).toFixed(2)));
          if (next === 1) setPan({ x: 0, y: 0 });
          return next;
        });
      } else if (event.key === "0") {
        event.preventDefault();
        setZoom(1);
        setPan({ x: 0, y: 0 });
      } else if (event.key === "i" || event.key === "I") {
        event.preventDefault();
        setShowInfo((v) => !v);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [file, currentIndex, files.length, onChangeIndex, onClose]);

  // Preload adjacent full-resolution images for instant stepping
  useEffect(() => {
    if (currentIndex === null) return;
    const neighbors = [files[currentIndex - 1], files[currentIndex + 1]];
    neighbors.forEach((neighbor) => {
      if (neighbor && neighbor.kind === "image") {
        const preloader = new window.Image();
        preloader.src = getFileUrl(neighbor.path);
      }
    });
  }, [currentIndex, files]);

  if (!file || currentIndex === null) return null;

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < files.length - 1;
  const imageFiles = files.filter((f) => f.kind === "image" && f.path !== file.path);

  const handleWheel = (event: React.WheelEvent) => {
    if (file.kind !== "image") return;
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.25 : -0.25;
    setZoom((prev) => {
      const next = Math.min(4, Math.max(1, Number((prev + delta).toFixed(2))));
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  const handleMouseDown = (event: React.MouseEvent) => {
    if (zoom <= 1) return;
    event.preventDefault();
    setDragging(true);
    setDragOrigin({ x: event.clientX - pan.x, y: event.clientY - pan.y });
  };

  const handleMouseMove = (event: React.MouseEvent) => {
    if (!dragging) return;
    setPan({
      x: event.clientX - dragOrigin.x,
      y: event.clientY - dragOrigin.y
    });
  };

  const handleMouseUp = () => {
    setDragging(false);
  };

  const handleCopyPath = async () => {
    try {
      await navigator.clipboard.writeText(file.path);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 1800);
    } catch {
      // Clipboard API unavailable
    }
  };

  return (
    <div
      className="viewer-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Visor: ${file.name}`}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <header className="viewer-topbar">
        <div className="viewer-title-group">
          <span className="viewer-counter">
            {currentIndex + 1} / {files.length}
          </span>
          <strong className="viewer-filename">{file.name}</strong>
          <span className="viewer-meta-inline">
            {formatBytes(file.sizeBytes)}
            {dimensions ? ` · ${dimensions.w} × ${dimensions.h} px` : ""}
          </span>
        </div>

        <div className="viewer-controls">
          {file.kind === "image" ? (
            <>
              <div className="viewer-zoom-group">
                <button
                  type="button"
                  className="btn-chip"
                  onClick={() => {
                    const next = Math.max(1, Number((zoom - 0.5).toFixed(2)));
                    setZoom(next);
                    if (next === 1) setPan({ x: 0, y: 0 });
                  }}
                  title="Alejar (-)"
                >
                  −
                </button>
                <button
                  type="button"
                  className="btn-chip"
                  onClick={() => {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }}
                  title="Restablecer zoom (0)"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  className="btn-chip"
                  onClick={() => setZoom((z) => Math.min(4, Number((z + 0.5).toFixed(2))))}
                  title="Acercar (+)"
                >
                  +
                </button>
              </div>

              {imageFiles.length > 0 ? (
                <button
                  type="button"
                  className={`btn-chip ${compareFile ? "active" : ""}`}
                  onClick={() =>
                    setCompareFile((prev) => (prev ? null : imageFiles[0] ?? null))
                  }
                >
                  {compareFile ? "Salir de comparar" : "Comparar"}
                </button>
              ) : null}
            </>
          ) : null}

          <button
            type="button"
            className={`btn-chip ${showInfo ? "active" : ""}`}
            onClick={() => setShowInfo((v) => !v)}
            title="Detalles del archivo (I)"
          >
            Detalles
          </button>

          <a
            href={getFileUrl(file.path)}
            target="_blank"
            rel="noreferrer"
            className="btn-chip"
          >
            Original ↗
          </a>

          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            aria-label="Cerrar visor (Esc)"
          >
            ✕
          </button>
        </div>
      </header>

      <div className="viewer-body">
        {hasPrev ? (
          <button
            type="button"
            className="viewer-nav-btn prev"
            onClick={() => onChangeIndex(currentIndex - 1)}
            aria-label="Archivo anterior"
          >
            ‹
          </button>
        ) : null}

        <div
          className={`viewer-stage ${compareFile ? "split" : ""}`}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
        >
          <div className="viewer-pane">
            {file.kind === "image" ? (
              <img
                key={file.path}
                src={getFileUrl(file.path)}
                alt={file.name}
                className="viewer-full-image"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  cursor: zoom > 1 ? (dragging ? "grabbing" : "grab") : "zoom-in"
                }}
                onDoubleClick={() => {
                  if (zoom > 1) {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  } else {
                    setZoom(2);
                  }
                }}
                onLoad={(e) => {
                  setDimensions({
                    w: e.currentTarget.naturalWidth,
                    h: e.currentTarget.naturalHeight
                  });
                }}
                draggable={false}
              />
            ) : file.kind === "video" ? (
              <video
                key={file.path}
                src={getFileUrl(file.path)}
                controls
                autoPlay
                className="viewer-full-video"
              />
            ) : (
              <div className="viewer-audio-card">
                <div className="viewer-audio-icon">♫</div>
                <h3>{file.name}</h3>
                <p>{formatBytes(file.sizeBytes)} · {file.extension.toUpperCase()}</p>
                <audio
                  key={file.path}
                  src={getFileUrl(file.path)}
                  controls
                  autoPlay
                  className="viewer-audio-element"
                />
              </div>
            )}
          </div>

          {compareFile && file.kind === "image" ? (
            <div className="viewer-pane compare-pane">
              <div className="compare-selector-bar">
                <span>Comparando con:</span>
                <select
                  value={compareFile.path}
                  onChange={(e) => {
                    const match = imageFiles.find((f) => f.path === e.target.value);
                    if (match) setCompareFile(match);
                  }}
                >
                  {imageFiles.map((candidate) => (
                    <option key={candidate.path} value={candidate.path}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
              </div>
              <img
                key={compareFile.path}
                src={getFileUrl(compareFile.path)}
                alt={compareFile.name}
                className="viewer-full-image"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`
                }}
                draggable={false}
              />
            </div>
          ) : null}
        </div>

        {hasNext ? (
          <button
            type="button"
            className="viewer-nav-btn next"
            onClick={() => onChangeIndex(currentIndex + 1)}
            aria-label="Archivo siguiente"
          >
            ›
          </button>
        ) : null}

        {showInfo ? (
          <aside className="viewer-inspector">
            <h3>Detalles del archivo</h3>
            <dl className="inspector-list">
              <div>
                <dt>Nombre</dt>
                <dd>{file.name}</dd>
              </div>
              <div>
                <dt>Tipo</dt>
                <dd>{file.kind.toUpperCase()} ({file.extension})</dd>
              </div>
              <div>
                <dt>Tamaño</dt>
                <dd>{formatBytes(file.sizeBytes)} ({file.sizeBytes.toLocaleString("es-AR")} bytes)</dd>
              </div>
              {dimensions ? (
                <div>
                  <dt>Dimensiones</dt>
                  <dd>{dimensions.w} × {dimensions.h} px</dd>
                </div>
              ) : null}
              <div>
                <dt>Modificado</dt>
                <dd>{formatFullDateTime(file.modifiedUtc)}</dd>
              </div>
              <div>
                <dt>Ruta relativa</dt>
                <dd><code>{file.relativePath}</code></dd>
              </div>
              <div>
                <dt>Ruta completa</dt>
                <dd><code>{file.path}</code></dd>
              </div>
            </dl>
            <button type="button" className="btn btn-secondary" onClick={handleCopyPath}>
              {copiedPath ? "Ruta copiada ✓" : "Copiar ruta completa"}
            </button>
          </aside>
        ) : null}
      </div>

      <footer className="viewer-filmstrip">
        {files
          .slice(Math.max(0, currentIndex - 6), Math.min(files.length, currentIndex + 7))
          .map((item) => {
            const idx = files.indexOf(item);
            const active = idx === currentIndex;
            return (
              <button
                key={item.path}
                type="button"
                className={`filmstrip-item ${active ? "active" : ""}`}
                onClick={() => onChangeIndex(idx)}
                title={item.name}
              >
                {item.kind === "image" ? (
                  <img src={getThumbUrl(item.path, 120)} alt="" />
                ) : (
                  <span>{item.kind === "video" ? "▶" : "♪"}</span>
                )}
              </button>
            );
          })}
      </footer>
    </div>
  );
}
