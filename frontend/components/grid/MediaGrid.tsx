"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Film, Image as ImageIcon, Music } from "lucide-react";
import { MediaItem, thumbUrl } from "../../lib/api";
import { formatBytes, formatMonthYear, formatShortDate } from "../../lib/format";
import { MediaSource } from "../../lib/sources";

export type Density = "compact" | "medium" | "large";

const DENSITY: Record<Density, { minWidth: number; gap: number; thumb: number }> = {
  compact: { minWidth: 150, gap: 10, thumb: 240 },
  medium: { minWidth: 210, gap: 14, thumb: 320 },
  large: { minWidth: 290, gap: 16, thumb: 480 }
};

const PADDING_X = 22;
const PADDING_TOP = 18;
const META_HEIGHT = 46;
const OVERSCAN_ROWS = 3;
const INTRO_WINDOW_MS = 700;
const INTRO_MAX_STEPS = 18;

export type ToggleMode = "toggle" | "range";

type MediaGridProps = {
  source: MediaSource;
  density: Density;
  selected: ReadonlySet<string>;
  focusIndex: number;
  activeAudioPath: string | null;
  showDateBubble: boolean;
  keyboardEnabled: boolean;
  revealRequest: { index: number; token: number } | null;
  onFocusIndex: (index: number) => void;
  onActivate: (index: number, item: MediaItem) => void;
  onToggle: (index: number, item: MediaItem, mode: ToggleMode) => void;
  onClearSelection: () => void;
};

export function MediaGrid({
  source,
  density,
  selected,
  focusIndex,
  activeAudioPath,
  showDateBubble,
  keyboardEnabled,
  revealRequest,
  onFocusIndex,
  onActivate,
  onToggle,
  onClearSelection
}: MediaGridProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 1200, height: 800 });
  const [scrollTop, setScrollTop] = useState(0);
  const [scrolling, setScrolling] = useState(false);
  const frameRef = useRef<number | null>(null);
  const idleRef = useRef<number | null>(null);
  const introRef = useRef({ key: "", at: 0, firstIndex: 0 });

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const measure = () => setSize({ width: element.clientWidth || 1200, height: element.clientHeight || 800 });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // A new result set starts at the top and plays the entrance once.
  useLayoutEffect(() => {
    if (!source.loaded || introRef.current.key === source.key) return;
    introRef.current = { key: source.key, at: performance.now(), firstIndex: 0 };
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setScrollTop(0);
  }, [source.key, source.loaded]);

  const layout = useMemo(() => {
    const config = DENSITY[density];
    const usable = Math.max(280, size.width - PADDING_X * 2);
    const columns = Math.max(1, Math.floor((usable + config.gap) / (config.minWidth + config.gap)));
    const cardWidth = (usable - config.gap * (columns - 1)) / columns;
    const rowHeight = Math.round(cardWidth * 0.75 + META_HEIGHT);
    const rows = Math.ceil(source.total / columns);
    const stride = rowHeight + config.gap;
    const height = rows > 0 ? PADDING_TOP + rows * stride - config.gap + 120 : 0;
    return { ...config, columns, cardWidth, rowHeight, rows, stride, height };
  }, [density, size.width, source.total]);

  const firstRow = Math.max(0, Math.floor((scrollTop - PADDING_TOP) / layout.stride) - OVERSCAN_ROWS);
  const lastRow = Math.min(
    layout.rows - 1,
    Math.ceil((scrollTop + size.height) / layout.stride) + OVERSCAN_ROWS
  );

  const { ensureRange } = source;
  useEffect(() => {
    if (layout.rows === 0) return;
    ensureRange(firstRow * layout.columns, (lastRow + 1) * layout.columns + layout.columns * 4);
  }, [ensureRange, firstRow, lastRow, layout.columns, layout.rows, source.key]);

  useEffect(() => () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    if (idleRef.current) window.clearTimeout(idleRef.current);
  }, []);

  const handleScroll = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      setScrollTop(scrollRef.current?.scrollTop ?? 0);
    });
    setScrolling(true);
    if (idleRef.current) window.clearTimeout(idleRef.current);
    idleRef.current = window.setTimeout(() => setScrolling(false), 900);
  }, []);

  const scrollIntoView = useCallback(
    (index: number, behavior: ScrollBehavior = "smooth") => {
      const element = scrollRef.current;
      if (!element) return;
      const top = PADDING_TOP + Math.floor(index / layout.columns) * layout.stride;
      const bottom = top + layout.rowHeight;
      if (top < element.scrollTop + 8) element.scrollTo({ top: Math.max(0, top - 12), behavior });
      else if (bottom > element.scrollTop + element.clientHeight - 8)
        element.scrollTo({ top: bottom - element.clientHeight + 24, behavior });
    },
    [layout.columns, layout.rowHeight, layout.stride]
  );

  // While the viewer is open the grid follows it, so closing can fly back into a visible card.
  useEffect(() => {
    if (keyboardEnabled || focusIndex < 0) return;
    scrollIntoView(focusIndex, "auto");
  }, [focusIndex, keyboardEnabled, scrollIntoView]);

  useEffect(() => {
    if (revealRequest) scrollIntoView(revealRequest.index);
    // Only a new request scrolls; a relayout must not.
  }, [revealRequest?.token]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!keyboardEnabled || source.total === 0) return;
    const current = focusIndex < 0 ? 0 : focusIndex;
    const page = Math.max(1, Math.floor(size.height / layout.stride)) * layout.columns;
    const moves: Record<string, number> = {
      ArrowRight: current + 1,
      ArrowLeft: current - 1,
      ArrowDown: current + layout.columns,
      ArrowUp: current - layout.columns,
      PageDown: current + page,
      PageUp: current - page,
      Home: 0,
      End: source.total - 1
    };

    if (event.key in moves) {
      event.preventDefault();
      const next = Math.min(source.total - 1, Math.max(0, moves[event.key]));
      onFocusIndex(next);
      scrollIntoView(next);
      const item = source.getItem(next);
      if (event.shiftKey && item) onToggle(next, item, "range");
      return;
    }

    const item = focusIndex >= 0 ? source.getItem(focusIndex) : undefined;
    if (event.key === "Enter" && item) {
      event.preventDefault();
      onActivate(focusIndex, item);
    } else if (event.key === " " && item) {
      event.preventDefault();
      onToggle(focusIndex, item, "toggle");
    } else if (event.key === "Escape" && selected.size > 0) {
      event.preventDefault();
      onClearSelection();
    }
  };

  const rows: number[] = [];
  for (let r = firstRow; r <= lastRow; r++) rows.push(r);

  const now = performance.now();
  const intro = introRef.current.key === source.key && now - introRef.current.at < INTRO_WINDOW_MS;
  const firstVisibleIndex = Math.max(0, Math.floor((scrollTop - PADDING_TOP) / layout.stride)) * layout.columns;
  const bubbleItem = source.getItem(firstVisibleIndex);
  const scrollable = Math.max(1, layout.height - size.height);
  const bubbleTop = 12 + (Math.min(scrollTop, scrollable) / scrollable) * Math.max(0, size.height - 64);
  const selecting = selected.size > 0;

  return (
    <div className="grid-frame">
      <div
        ref={scrollRef}
        className={`grid-scroll ${source.pending ? "is-pending" : ""}`}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="grid"
        aria-label="Archivos"
        aria-rowcount={layout.rows}
        data-grid-root
      >
        <div className="grid-stage" style={{ height: layout.height }}>
          {rows.map((row) => {
            const start = row * layout.columns;
            const count = Math.min(layout.columns, source.total - start);
            return (
              <div
                key={row}
                className="grid-row"
                role="row"
                style={{
                  transform: `translate3d(0, ${PADDING_TOP + row * layout.stride}px, 0)`,
                  height: layout.rowHeight,
                  gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
                  gap: layout.gap,
                  left: PADDING_X,
                  right: PADDING_X
                }}
              >
                {Array.from({ length: count }, (_, offset) => {
                  const index = start + offset;
                  const item = source.getItem(index);
                  const step = index - introRef.current.firstIndex;
                  const introDelay = intro && step < INTRO_MAX_STEPS * layout.columns
                    ? Math.min(INTRO_MAX_STEPS, row - firstRow + offset * 0.35) * 32
                    : null;

                  if (!item) return <div key={`skeleton-${index}`} className="media-card skeleton" role="gridcell" />;

                  return (
                    <MediaCard
                      key={`${source.key}:${item.path}`}
                      item={item}
                      index={index}
                      thumbSize={layout.thumb}
                      selected={selected.has(item.path)}
                      selecting={selecting}
                      focused={index === focusIndex}
                      playing={activeAudioPath === item.path}
                      introDelay={introDelay}
                      onActivate={onActivate}
                      onToggle={onToggle}
                      onFocusIndex={onFocusIndex}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <AnimatePresence>
        {showDateBubble && scrolling && bubbleItem && layout.height > size.height * 1.5 ? (
          <motion.div
            className="date-bubble"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0, top: bubbleTop }}
            exit={{ opacity: 0, x: 12, transition: { duration: 0.25 } }}
            transition={{ duration: 0.18, top: { duration: 0 } }}
          >
            {formatMonthYear(bubbleItem.modifiedUtc)}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

type MediaCardProps = {
  item: MediaItem;
  index: number;
  thumbSize: number;
  selected: boolean;
  selecting: boolean;
  focused: boolean;
  playing: boolean;
  introDelay: number | null;
  onActivate: (index: number, item: MediaItem) => void;
  onToggle: (index: number, item: MediaItem, mode: ToggleMode) => void;
  onFocusIndex: (index: number) => void;
};

const KIND_ICON = { image: ImageIcon, video: Film, audio: Music } as const;

const MediaCard = memo(function MediaCard({
  item,
  index,
  thumbSize,
  selected,
  selecting,
  focused,
  playing,
  introDelay,
  onActivate,
  onToggle,
  onFocusIndex
}: MediaCardProps) {
  const [thumbState, setThumbState] = useState<"loading" | "ready" | "failed">(
    item.kind === "audio" ? "failed" : "loading"
  );
  // The entrance is decided when the card mounts; later renders must not restart it.
  const entrance = useRef(introDelay);
  const Icon = KIND_ICON[item.kind];
  const extension = item.extension.replace(/^\./, "").toUpperCase();

  const handleClick = (event: React.MouseEvent) => {
    onFocusIndex(index);
    if (event.shiftKey) onToggle(index, item, "range");
    else if (event.ctrlKey || event.metaKey || selecting) onToggle(index, item, "toggle");
    else onActivate(index, item);
  };

  return (
    <div
      className={[
        "media-card",
        selected ? "is-selected" : "",
        selecting ? "is-selecting" : "",
        focused ? "is-focused" : "",
        playing ? "is-playing" : "",
        entrance.current !== null ? "card-intro" : ""
      ].join(" ")}
      style={entrance.current !== null ? ({ "--intro-delay": `${entrance.current}ms` } as React.CSSProperties) : undefined}
      role="gridcell"
      aria-selected={selected}
      data-card-path={item.path}
      onClick={handleClick}
      onDoubleClick={() => selecting && onActivate(index, item)}
      title={item.name}
    >
      <div className={`media-preview kind-${item.kind}`}>
        {item.kind !== "audio" && thumbState !== "failed" ? (
          <img
            className={`media-thumb ${thumbState === "ready" ? "is-ready" : ""}`}
            src={thumbUrl(item.path, thumbSize)}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            onLoad={(e) => setThumbState(e.currentTarget.naturalWidth > 0 ? "ready" : "failed")}
            onError={() => setThumbState("failed")}
          />
        ) : null}

        {thumbState !== "ready" ? (
          <div className={`media-placeholder ${thumbState === "loading" ? "is-loading" : ""}`}>
            <Icon size={26} strokeWidth={1.5} />
            <span>{extension}</span>
          </div>
        ) : null}

        <div className="media-scrim" />

        <span className="media-badge">
          {item.kind !== "image" ? <Icon size={11} strokeWidth={2.2} /> : null}
          {extension}
        </span>

        {playing ? (
          <span className="media-eq" aria-label="Reproduciendo">
            <i />
            <i />
            <i />
          </span>
        ) : null}

        <button
          type="button"
          className="media-check"
          aria-label={selected ? "Quitar de la selección" : "Seleccionar"}
          onClick={(event) => {
            event.stopPropagation();
            onFocusIndex(index);
            onToggle(index, item, event.shiftKey ? "range" : "toggle");
          }}
        >
          <Check size={13} strokeWidth={3} />
        </button>
      </div>

      <div className="media-meta">
        <div className="media-name">{item.name}</div>
        <div className="media-sub">
          {formatBytes(item.sizeBytes)} · {formatShortDate(item.modifiedUtc)}
        </div>
      </div>
    </div>
  );
});
