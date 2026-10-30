"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { MediaItem, fileUrl } from "../lib/api";
import { formatBytes } from "../lib/format";
import { ease, spring } from "../lib/motion";

type AudioMiniPlayerProps = {
  track: MediaItem;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onReveal: () => void;
  onClose: () => void;
};

/** Render inside `<AnimatePresence>`; it docks at the bottom edge. */
export function AudioMiniPlayer({ track, hasPrev, hasNext, onPrev, onNext, onReveal, onClose }: AudioMiniPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState({ current: 0, duration: 0 });

  useEffect(() => {
    setTime({ current: 0, duration: 0 });
  }, [track.path]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  };

  const progress = time.duration > 0 ? time.current / time.duration : 0;

  return (
    <motion.div
      className="miniplayer"
      role="region"
      aria-label="Reproductor de audio"
      initial={{ y: 90, opacity: 0 }}
      animate={{ y: 0, opacity: 1, transition: spring }}
      exit={{ y: 90, opacity: 0, transition: { duration: 0.22, ease } }}
    >
      <audio
        key={track.path}
        ref={audioRef}
        src={fileUrl(track.path)}
        autoPlay
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => (hasNext ? onNext() : setPlaying(false))}
        onLoadedMetadata={(e) => setTime({ current: 0, duration: e.currentTarget.duration || 0 })}
        onTimeUpdate={(e) => setTime({ current: e.currentTarget.currentTime, duration: e.currentTarget.duration || 0 })}
      />

      <button type="button" className="miniplayer-track" onClick={onReveal} title="Mostrar en la grilla">
        <span className={`miniplayer-art ${playing ? "is-playing" : ""}`}>
          <span className="media-eq">
            <i />
            <i />
            <i />
          </span>
        </span>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={track.path}
            className="miniplayer-text"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease }}
          >
            <strong>{track.name}</strong>
            <small>
              {track.extension.replace(/^\./, "").toUpperCase()} · {formatBytes(track.sizeBytes)}
            </small>
          </motion.span>
        </AnimatePresence>
      </button>

      <div className="miniplayer-controls">
        <button type="button" className="icon-button" disabled={!hasPrev} onClick={onPrev} aria-label="Anterior">
          <SkipBack size={17} />
        </button>
        <button type="button" className="miniplayer-play" onClick={toggle} aria-label={playing ? "Pausar" : "Reproducir"}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={playing ? "pause" : "play"}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
            </motion.span>
          </AnimatePresence>
        </button>
        <button type="button" className="icon-button" disabled={!hasNext} onClick={onNext} aria-label="Siguiente">
          <SkipForward size={17} />
        </button>
      </div>

      <div className="miniplayer-timeline">
        <span>{clock(time.current)}</span>
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(progress * 1000)}
          style={{ "--progress": `${progress * 100}%` } as React.CSSProperties}
          onChange={(e) => {
            const audio = audioRef.current;
            if (audio && time.duration > 0) audio.currentTime = (Number(e.target.value) / 1000) * time.duration;
          }}
          aria-label="Posición"
        />
        <span>{clock(time.duration)}</span>
      </div>

      <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar reproductor">
        <X size={17} />
      </button>
    </motion.div>
  );
}

function clock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
