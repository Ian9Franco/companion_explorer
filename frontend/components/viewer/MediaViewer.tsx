"use client";

/**
 * El visor no anima el layout. Mide la tarjeta y la foto, y pasa de una
 * a la otra con un transform y un recorte. Al cerrar, la salida lee
 * `exitOrigin`: la tarjeta se busca antes de desmontar, porque durante
 * la animación de salida este árbol ya no está. Si la tarjeta no se ve,
 * o la foto está con zoom, cierra con un fade.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, Variants } from "motion/react";
import {
  BookmarkPlus,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Info,
  Music,
  SquareSplitHorizontal,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { MediaItem, fileUrl, thumbUrl } from "../../lib/api";
import { formatBytes, formatFullDate } from "../../lib/format";
import { ease, spring } from "../../lib/motion";
import { MediaSource } from "../../lib/sources";

export type ViewerOrigin = { rect: DOMRect; aspect: number | null };

/** Finds the card the viewer opens from, or returns to, when it is on screen. */
export function findCardOrigin(path: string): ViewerOrigin | null {
  if (typeof document === "undefined") return null;
  const card = document.querySelector<HTMLElement>(`[data-card-path="${CSS.escape(path)}"]`);
  const preview = card?.querySelector<HTMLElement>(".media-preview");
  if (!preview) return null;

  const rect = preview.getBoundingClientRect();
  const scroller = card?.closest<HTMLElement>("[data-grid-root]")?.getBoundingClientRect();
  if (scroller && (rect.bottom < scroller.top || rect.top > scroller.bottom)) return null;

  const thumb = preview.querySelector<HTMLImageElement>("img.media-thumb.is-ready");
  const aspect = thumb && thumb.naturalWidth > 0 ? thumb.naturalWidth / thumb.naturalHeight : null;
  return { rect, aspect };
}

type Box = { left: number; top: number; width: number; height: number };

const TOPBAR = 64;
const FILMSTRIP = 92;
const SIDE = 84;
const INFO_WIDTH = 340;
const AUDIO_BOX = { width: 440, height: 300 };

function fit(aspect: number, area: Box): Box {
  let width = area.width;
  let height = width / aspect;
  if (height > area.height) {
    height = area.height;
    width = height * aspect;
  }
  return {
    left: area.left + (area.width - width) / 2,
    top: area.top + (area.height - height) / 2,
    width,
    height
  };
}

function fromCard(target: Box, origin: DOMRect) {
  const scale = Math.max(origin.width / target.width, origin.height / target.height);
  const insetX = Math.max(0, (target.width * scale - origin.width) / 2 / scale);
  const insetY = Math.max(0, (target.height * scale - origin.height) / 2 / scale);
  return {
    x: origin.left + origin.width / 2 - (target.left + target.width / 2),
    y: origin.top + origin.height / 2 - (target.top + target.height / 2),
    scale,
    opacity: 1,
    clipPath: `inset(${insetY}px ${insetX}px ${insetY}px ${insetX}px round ${12 / scale}px)`
  };
}

const RESTING = { x: 0, y: 0, scale: 1, opacity: 1, clipPath: "inset(0px 0px 0px 0px round 8px)" };

const slide: Variants = {
  enter: (direction: number) => ({ x: direction * 90, opacity: 0, scale: 0.98 }),
  center: { x: 0, opacity: 1, scale: 1, transition: { ...spring, opacity: { duration: 0.2 } } },
  exit: (direction: number) => ({ x: direction * -90, opacity: 0, scale: 0.98, transition: { duration: 0.2, ease } })
};

type MediaViewerProps = {
  source: MediaSource;
  index: number;
  keyboardEnabled: boolean;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onAddToCollection: (paths: string[]) => void;
  onCopy: (text: string, label: string) => void;
};

export function MediaViewer({
  source,
  index,
  keyboardEnabled,
  onIndexChange,
  onClose,
  onAddToCollection,
  onCopy
}: MediaViewerProps) {
  const item = source.getItem(index);
  const [viewport, setViewport] = useState({ width: 1400, height: 900 });
  const [infoOpen, setInfoOpen] = useState(false);
  const [aspects, setAspects] = useState<Record<string, number>>({});
  const [direction, setDirection] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [compareIndex, setCompareIndex] = useState<number | null>(null);
  const [fullReady, setFullReady] = useState<Record<string, boolean>>({});
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const origin = useRef<ViewerOrigin | null>(item ? findCardOrigin(item.path) : null);
  const firstPath = useRef(item?.path);
  // Read by the exit variant after the viewer has already left the tree.
  const exitOrigin = useRef<ViewerOrigin | null>(null);

  useEffect(() => {
    const measure = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const { ensureRange } = source;
  useEffect(() => {
    ensureRange(Math.max(0, index - 12), index + 12);
  }, [ensureRange, index]);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [index]);

  const rememberAspect = useCallback((path: string, aspect: number) => {
    if (!Number.isFinite(aspect) || aspect <= 0) return;
    setAspects((prev) => (Math.abs((prev[path] ?? 0) - aspect) < 0.001 ? prev : { ...prev, [path]: aspect }));
  }, []);

  const area: Box = useMemo(() => {
    const width = viewport.width - (infoOpen ? INFO_WIDTH : 0);
    return {
      left: SIDE,
      top: TOPBAR + 12,
      width: Math.max(200, width - SIDE * 2),
      height: Math.max(200, viewport.height - TOPBAR - FILMSTRIP - 24)
    };
  }, [viewport, infoOpen]);

  const aspect =
    (item && aspects[item.path]) ??
    (item?.path === firstPath.current ? origin.current?.aspect : null) ??
    (item?.kind === "video" ? 16 / 9 : 3 / 2);

  const target: Box = useMemo(() => {
    if (item?.kind === "audio") {
      return {
        left: area.left + (area.width - AUDIO_BOX.width) / 2,
        top: area.top + (area.height - AUDIO_BOX.height) / 2,
        ...AUDIO_BOX
      };
    }
    return fit(aspect, area);
  }, [area, aspect, item?.kind]);

  const targetRef = useRef(target);
  targetRef.current = target;

  const initial = useRef(
    origin.current ? { ...target, ...fromCard(target, origin.current.rect) } : { ...target, opacity: 0, scale: 0.94 }
  );

  const frameVariants: Variants = {
    exit: () =>
      exitOrigin.current
        ? { ...fromCard(targetRef.current, exitOrigin.current.rect), transition: spring }
        : { opacity: 0, scale: 0.94, transition: { duration: 0.2, ease } }
  };

  const close = useCallback(() => {
    exitOrigin.current = item && zoom === 1 ? findCardOrigin(item.path) : null;
    onClose();
  }, [item, onClose, zoom]);

  const go = useCallback(
    (next: number) => {
      if (next < 0 || next >= source.total || next === index) return;
      setDirection(next > index ? 1 : -1);
      onIndexChange(next);
    },
    [index, onIndexChange, source.total]
  );

  const changeZoom = useCallback((next: number, focus?: { x: number; y: number }) => {
    setZoom((current) => {
      const clamped = Math.min(5, Math.max(1, Number(next.toFixed(2))));
      setPan((p) => {
        if (clamped === 1) return { x: 0, y: 0 };
        if (!focus) return p;
        const ratio = clamped / current;
        return { x: focus.x - (focus.x - p.x) * ratio, y: focus.y - (focus.y - p.y) * ratio };
      });
      return clamped;
    });
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || item?.kind !== "image" || compareIndex !== null) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = frame.getBoundingClientRect();
      const focus = {
        x: event.clientX - (rect.left + rect.width / 2),
        y: event.clientY - (rect.top + rect.height / 2)
      };
      changeZoom(zoom * (event.deltaY < 0 ? 1.18 : 1 / 1.18), focus);
    };
    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => frame.removeEventListener("wheel", onWheel);
  }, [changeZoom, compareIndex, item?.kind, zoom]);

  useEffect(() => {
    if (!keyboardEnabled) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.closest("input, textarea, select")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (compareIndex !== null) setCompareIndex(null);
        else if (zoom > 1) changeZoom(1);
        else close();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        go(index + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        go(index - 1);
      } else if (event.key === "+" || event.key === "=") {
        changeZoom(zoom * 1.4);
      } else if (event.key === "-") {
        changeZoom(zoom / 1.4);
      } else if (event.key === "0") {
        changeZoom(1);
      } else if (event.key.toLowerCase() === "i") {
        setInfoOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [changeZoom, close, compareIndex, go, index, keyboardEnabled, zoom]);

  useEffect(() => {
    for (const neighbor of [source.getItem(index + 1), source.getItem(index - 1)]) {
      if (neighbor?.kind === "image") new window.Image().src = fileUrl(neighbor.path);
    }
  }, [index, source]);

  if (!item) return null;

  const compareItem = compareIndex !== null ? source.getItem(compareIndex) : undefined;

  const startDrag = (event: React.PointerEvent) => {
    if (zoom <= 1 || event.button !== 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
    setDragging(true);
  };

  const moveDrag = (event: React.PointerEvent) => {
    const start = dragRef.current;
    if (!start) return;
    setPan({ x: start.panX + event.clientX - start.x, y: start.panY + event.clientY - start.y });
  };

  const endDrag = () => {
    dragRef.current = null;
    setDragging(false);
  };

  const filmstrip: { index: number; item: MediaItem }[] = [];
  for (let i = Math.max(0, index - 10); i <= Math.min(source.total - 1, index + 10); i++) {
    const entry = source.getItem(i);
    if (entry) filmstrip.push({ index: i, item: entry });
  }

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={item.name}>
      <motion.div
        className="viewer-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.28, ease } }}
        transition={{ duration: 0.32, ease }}
        onClick={close}
      />

      <motion.header
        className="viewer-topbar"
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -14, transition: { duration: 0.16 } }}
        transition={{ duration: 0.32, ease, delay: 0.06 }}
      >
        <div className="viewer-title">
          <span className="viewer-counter">
            {index + 1} / {source.total}
          </span>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={item.path}
              className="viewer-name"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease }}
            >
              <strong>{item.name}</strong>
              <span>
                {formatBytes(item.sizeBytes)} · {formatFullDate(item.modifiedUtc)}
              </span>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="viewer-actions">
          {item.kind === "image" ? (
            <div className="segmented">
              <button type="button" className="icon-button" onClick={() => changeZoom(zoom / 1.4)} aria-label="Alejar">
                <ZoomOut size={16} />
              </button>
              <button type="button" className="zoom-readout" onClick={() => changeZoom(1)} aria-label="Restablecer zoom">
                {Math.round(zoom * 100)}%
              </button>
              <button type="button" className="icon-button" onClick={() => changeZoom(zoom * 1.4)} aria-label="Acercar">
                <ZoomIn size={16} />
              </button>
            </div>
          ) : null}

          {item.kind === "image" ? (
            <button
              type="button"
              className={`chip ${compareIndex !== null ? "is-active" : ""}`}
              onClick={() => setCompareIndex((current) => (current !== null ? null : nextImageIndex(source, index)))}
            >
              <SquareSplitHorizontal size={15} />
              {compareIndex !== null ? "Salir de comparar" : "Comparar"}
            </button>
          ) : null}

          <button type="button" className="chip" onClick={() => onAddToCollection([item.path])}>
            <BookmarkPlus size={15} />
            Colección
          </button>
          <button
            type="button"
            className={`icon-button ${infoOpen ? "is-active" : ""}`}
            onClick={() => setInfoOpen((v) => !v)}
            aria-label="Detalles (I)"
          >
            <Info size={17} />
          </button>
          <a className="icon-button" href={fileUrl(item.path)} target="_blank" rel="noreferrer" aria-label="Abrir original">
            <ExternalLink size={16} />
          </a>
          <button type="button" className="icon-button" onClick={close} aria-label="Cerrar (Esc)">
            <X size={18} />
          </button>
        </div>
      </motion.header>

      <AnimatePresence propagate>
        {index > 0 ? (
          <motion.button
            key="prev"
            type="button"
            className="viewer-nav is-prev"
            onClick={() => go(index - 1)}
            aria-label="Anterior"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2, ease }}
          >
            <ChevronLeft size={26} />
          </motion.button>
        ) : null}
        {index < source.total - 1 ? (
          <motion.button
            key="next"
            type="button"
            className="viewer-nav is-next"
            style={{ right: (infoOpen ? INFO_WIDTH : 0) + 18 }}
            onClick={() => go(index + 1)}
            aria-label="Siguiente"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.2, ease }}
          >
            <ChevronRight size={26} />
          </motion.button>
        ) : null}
      </AnimatePresence>

      <AnimatePresence mode="wait" initial={false} propagate>
        {compareItem ? (
          <motion.div
            key="compare"
            className="viewer-compare"
            style={{ left: area.left, top: area.top, width: area.width, height: area.height }}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.25, ease }}
          >
            <ComparePane item={item} label="Actual" />
            <ComparePane item={compareItem} label="Comparando" />
          </motion.div>
        ) : (
          <motion.div
            key="frame"
            ref={frameRef}
            className={`viewer-frame kind-${item.kind} ${zoom > 1 ? (dragging ? "is-dragging" : "is-zoomed") : ""}`}
            variants={frameVariants}
            initial={initial.current}
            animate={{ ...target, ...RESTING }}
            exit="exit"
            transition={spring}
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onDoubleClick={(event) => {
              if (item.kind !== "image") return;
              const rect = event.currentTarget.getBoundingClientRect();
              changeZoom(zoom > 1 ? 1 : 2.5, {
                x: event.clientX - (rect.left + rect.width / 2),
                y: event.clientY - (rect.top + rect.height / 2)
              });
            }}
          >
            <AnimatePresence initial={false} custom={direction} mode="popLayout">
              <motion.div
                key={item.path}
                className="viewer-slide"
                custom={direction}
                variants={slide}
                initial="enter"
                animate="center"
                exit="exit"
              >
                <motion.div
                  className="viewer-zoom"
                  animate={{ scale: zoom, x: pan.x, y: pan.y }}
                  transition={dragging ? { duration: 0 } : spring}
                >
                  <MediaContent
                    item={item}
                    fullReady={fullReady[item.path] ?? false}
                    onFullReady={() => setFullReady((prev) => ({ ...prev, [item.path]: true }))}
                    onAspect={(value) => rememberAspect(item.path, value)}
                  />
                </motion.div>
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence propagate>
        {infoOpen ? (
          <motion.aside
            key="info"
            className="viewer-info"
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 28, transition: { duration: 0.18 } }}
            transition={spring}
          >
            <h3>Detalles</h3>
            <dl>
              <Detail label="Nombre" value={item.name} />
              <Detail label="Tipo" value={`${kindLabel(item.kind)} · ${item.extension.replace(".", "").toUpperCase()}`} />
              <Detail label="Tamaño" value={`${formatBytes(item.sizeBytes)} (${item.sizeBytes.toLocaleString("es-AR")} bytes)`} />
              {aspects[item.path] && item.kind !== "audio" ? (
                <Detail label="Proporción" value={aspects[item.path].toFixed(2)} />
              ) : null}
              <Detail label="Modificado" value={formatFullDate(item.modifiedUtc)} />
              <Detail label="Carpeta" value={item.folder ?? item.relativePath ?? ""} mono />
            </dl>
            <button type="button" className="button is-secondary" onClick={() => onCopy(item.path, "Ruta copiada")}>
              <Copy size={15} />
              Copiar ruta completa
            </button>
          </motion.aside>
        ) : null}
      </AnimatePresence>

      <motion.footer
        className="viewer-filmstrip"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 18, transition: { duration: 0.16 } }}
        transition={{ duration: 0.34, ease, delay: 0.08 }}
        style={{ right: infoOpen ? INFO_WIDTH : 0 }}
      >
        <div className="filmstrip-track">
          {filmstrip.map(({ index: i, item: entry }) => (
            <button
              key={entry.path}
              type="button"
              className={`filmstrip-item ${i === index ? "is-current" : ""} ${i === compareIndex ? "is-compare" : ""}`}
              style={{ transform: `translateX(${(i - index) * 62}px) scale(${i === index ? 1.12 : 1})` }}
              onClick={() => (compareIndex !== null && entry.kind === "image" ? setCompareIndex(i) : go(i))}
              aria-label={entry.name}
            >
              {entry.kind === "audio" ? <Music size={16} /> : <img src={thumbUrl(entry.path, 120)} alt="" draggable={false} />}
            </button>
          ))}
        </div>
        {compareIndex !== null ? <span className="filmstrip-hint">Elegí en la tira con qué comparar</span> : null}
      </motion.footer>
    </div>
  );
}

function MediaContent({
  item,
  fullReady,
  onFullReady,
  onAspect
}: {
  item: MediaItem;
  fullReady: boolean;
  onFullReady: () => void;
  onAspect: (aspect: number) => void;
}) {
  if (item.kind === "video") {
    return (
      <video
        className="viewer-video"
        src={fileUrl(item.path)}
        poster={thumbUrl(item.path, 640)}
        controls
        autoPlay
        playsInline
        onLoadedMetadata={(e) => onAspect(e.currentTarget.videoWidth / e.currentTarget.videoHeight)}
      />
    );
  }

  if (item.kind === "audio") {
    return (
      <div className="viewer-audio">
        <div className="viewer-audio-art">
          <Music size={40} strokeWidth={1.4} />
          <span className="media-eq is-large">
            <i />
            <i />
            <i />
            <i />
          </span>
        </div>
        <strong>{item.name}</strong>
        <audio src={fileUrl(item.path)} controls />
      </div>
    );
  }

  return (
    <>
      <img
        className="viewer-image is-thumb"
        src={thumbUrl(item.path, 320)}
        alt=""
        draggable={false}
        onLoad={(e) => onAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
      />
      <img
        className={`viewer-image is-full ${fullReady ? "is-ready" : ""}`}
        src={fileUrl(item.path)}
        alt={item.name}
        draggable={false}
        onLoad={(e) => {
          onAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight);
          onFullReady();
        }}
      />
    </>
  );
}

function ComparePane({ item, label }: { item: MediaItem; label: string }) {
  return (
    <div className="compare-pane">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.img
          key={item.path}
          src={fileUrl(item.path)}
          alt={item.name}
          draggable={false}
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease }}
        />
      </AnimatePresence>
      <span className="compare-label">
        {label} · {item.name}
      </span>
    </div>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={mono ? "is-mono" : undefined}>{value}</dd>
    </div>
  );
}

function kindLabel(kind: MediaItem["kind"]) {
  return kind === "image" ? "Imagen" : kind === "video" ? "Video" : "Audio";
}

function nextImageIndex(source: MediaSource, from: number): number | null {
  for (let i = from + 1; i < Math.min(source.total, from + 40); i++) if (source.getItem(i)?.kind === "image") return i;
  for (let i = from - 1; i >= Math.max(0, from - 40); i--) if (source.getItem(i)?.kind === "image") return i;
  return null;
}
