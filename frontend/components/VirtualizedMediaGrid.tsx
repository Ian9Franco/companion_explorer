"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MediaFileEntry,
  formatBytes,
  formatShortDate,
  getThumbUrl
} from "../lib/api";

export type GridDensity = "compact" | "medium" | "large";

type VirtualizedMediaGridProps = {
  files: MediaFileEntry[];
  density: GridDensity;
  selectedIndex: number;
  activeAudioPath: string | null;
  onSelectIndex: (index: number) => void;
  onOpenFile: (file: MediaFileEntry, index: number) => void;
};

const DENSITY_CONFIG: Record<
  GridDensity,
  { minColWidth: number; rowHeight: number; thumbSize: number }
> = {
  compact: { minColWidth: 165, rowHeight: 195, thumbSize: 240 },
  medium: { minColWidth: 225, rowHeight: 255, thumbSize: 320 },
  large: { minColWidth: 300, rowHeight: 330, thumbSize: 420 }
};

const GAP = 14;
const OVERSCAN_ROWS = 3;

export function VirtualizedMediaGrid({
  files,
  density,
  selectedIndex,
  activeAudioPath,
  onSelectIndex,
  onOpenFile
}: VirtualizedMediaGridProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ width: 1200, height: 720, scrollTop: 0 });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const updateMeasure = () => {
      setViewport((prev) => ({
        width: el.clientWidth || 1200,
        height: el.clientHeight || 720,
        scrollTop: prev.scrollTop
      }));
    };

    updateMeasure();
    const observer = new ResizeObserver(updateMeasure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const config = DENSITY_CONFIG[density];

  const { columns, totalRows, totalHeight, startRow, endRow } = useMemo(() => {
    const usableWidth = Math.max(300, viewport.width - 32);
    const cols = Math.max(1, Math.floor((usableWidth + GAP) / (config.minColWidth + GAP)));
    const rows = Math.ceil(files.length / cols);
    const height = rows > 0 ? rows * config.rowHeight + (rows - 1) * GAP : 0;
    const rowStride = config.rowHeight + GAP;

    const firstVisible = Math.max(0, Math.floor(viewport.scrollTop / rowStride) - OVERSCAN_ROWS);
    const lastVisible = Math.min(
      Math.max(0, rows - 1),
      Math.ceil((viewport.scrollTop + viewport.height) / rowStride) + OVERSCAN_ROWS
    );

    return {
      columns: cols,
      totalRows: rows,
      totalHeight: height,
      startRow: firstVisible,
      endRow: lastVisible
    };
  }, [viewport.width, viewport.height, viewport.scrollTop, files.length, config]);

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = event.currentTarget.scrollTop;
    setViewport((prev) => (prev.scrollTop === scrollTop ? prev : { ...prev, scrollTop }));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (files.length === 0) return;

    let nextIndex = selectedIndex < 0 ? 0 : selectedIndex;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      nextIndex = Math.min(files.length - 1, nextIndex + 1);
      onSelectIndex(nextIndex);
      scrollIndexIntoView(nextIndex);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      nextIndex = Math.max(0, nextIndex - 1);
      onSelectIndex(nextIndex);
      scrollIndexIntoView(nextIndex);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      nextIndex = Math.min(files.length - 1, nextIndex + columns);
      onSelectIndex(nextIndex);
      scrollIndexIntoView(nextIndex);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      nextIndex = Math.max(0, nextIndex - columns);
      onSelectIndex(nextIndex);
      scrollIndexIntoView(nextIndex);
    } else if (event.key === "Enter" || event.key === " ") {
      if (selectedIndex >= 0 && selectedIndex < files.length) {
        event.preventDefault();
        onOpenFile(files[selectedIndex], selectedIndex);
      }
    }
  };

  const scrollIndexIntoView = (index: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const row = Math.floor(index / columns);
    const rowStride = config.rowHeight + GAP;
    const rowTop = row * rowStride;
    const rowBottom = rowTop + config.rowHeight;

    if (rowTop < el.scrollTop) {
      el.scrollTop = rowTop;
    } else if (rowBottom > el.scrollTop + el.clientHeight) {
      el.scrollTop = rowBottom - el.clientHeight + 24;
    }
  };

  const visibleRows = useMemo(() => {
    if (totalRows === 0) return [];
    const list: number[] = [];
    for (let r = startRow; r <= endRow; r++) {
      list.push(r);
    }
    return list;
  }, [totalRows, startRow, endRow]);

  return (
    <div
      ref={scrollRef}
      className="virtual-grid-scroll"
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      aria-label="Grilla de archivos multimedia"
    >
      <div
        className="virtual-grid-Stage"
        style={{
          height: `${totalHeight}px`,
          position: "relative"
        }}
      >
        {visibleRows.map((rowIndex) => {
          const top = rowIndex * (config.rowHeight + GAP);
          const startIdx = rowIndex * columns;
          const rowItems = files.slice(startIdx, startIdx + columns);

          return (
            <div
              key={rowIndex}
              className="virtual-grid-row"
              style={{
                position: "absolute",
                top: `${top}px`,
                left: 0,
                right: 0,
                height: `${config.rowHeight}px`,
                display: "grid",
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gap: `${GAP}px`
              }}
            >
              {rowItems.map((file, offset) => {
                const index = startIdx + offset;
                const isSelected = index === selectedIndex;
                const isPlayingAudio = activeAudioPath === file.path;

                return (
                  <MediaGridCard
                    key={file.path}
                    file={file}
                    thumbSize={config.thumbSize}
                    isSelected={isSelected}
                    isPlayingAudio={isPlayingAudio}
                    onClick={() => {
                      onSelectIndex(index);
                      onOpenFile(file, index);
                    }}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type MediaGridCardProps = {
  file: MediaFileEntry;
  thumbSize: number;
  isSelected: boolean;
  isPlayingAudio: boolean;
  onClick: () => void;
};

function MediaGridCard({
  file,
  thumbSize,
  isSelected,
  isPlayingAudio,
  onClick
}: MediaGridCardProps) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const [thumbLoaded, setThumbLoaded] = useState(false);

  const showImageThumb = file.kind !== "audio" && !thumbFailed;
  const extLabel = file.extension.replace(/^\./, "").toUpperCase();

  return (
    <button
      type="button"
      className={`media-card ${isSelected ? "selected" : ""} ${isPlayingAudio ? "playing" : ""}`}
      onClick={onClick}
      title={`${file.name} (${formatBytes(file.sizeBytes)})`}
    >
      <div className="media-card-preview">
        {showImageThumb ? (
          <img
            src={getThumbUrl(file.path, thumbSize)}
            alt={file.name}
            loading="lazy"
            decoding="async"
            className={`media-card-img ${thumbLoaded ? "loaded" : ""}`}
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth === 0) {
                setThumbFailed(true);
              } else {
                setThumbLoaded(true);
              }
            }}
            onError={() => setThumbFailed(true)}
          />
        ) : null}

        {(!showImageThumb || !thumbLoaded) ? (
          <div className={`media-card-placeholder kind-${file.kind}`}>
            <span className="media-placeholder-glyph">
              {file.kind === "video" ? "▶" : file.kind === "audio" ? "♫" : "▣"}
            </span>
            <span className="media-placeholder-ext">{extLabel}</span>
          </div>
        ) : null}

        <span className={`media-kind-badge kind-${file.kind}`}>
          {file.kind === "video" ? `▶ ${extLabel}` : file.kind === "audio" ? `♪ ${extLabel}` : extLabel}
        </span>

        {isPlayingAudio ? (
          <span className="media-playing-pill">Reproduciendo</span>
        ) : null}
      </div>

      <div className="media-card-meta">
        <div className="media-card-title">{file.name}</div>
        <div className="media-card-sub">
          <span>{formatBytes(file.sizeBytes)}</span>
          <span>·</span>
          <span>{formatShortDate(file.modifiedUtc)}</span>
        </div>
      </div>
    </button>
  );
}
