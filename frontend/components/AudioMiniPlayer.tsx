"use client";

import { MediaFileEntry, formatBytes, getFileUrl } from "../lib/api";

type AudioMiniPlayerProps = {
  track: MediaFileEntry | null;
  audioTracks: MediaFileEntry[];
  onSelectTrack: (track: MediaFileEntry) => void;
  onInspectTrack: (track: MediaFileEntry) => void;
  onClose: () => void;
};

export function AudioMiniPlayer({
  track,
  audioTracks,
  onSelectTrack,
  onInspectTrack,
  onClose
}: AudioMiniPlayerProps) {
  if (!track) return null;

  const currentIdx = audioTracks.findIndex((t) => t.path === track.path);
  const prevTrack = currentIdx > 0 ? audioTracks[currentIdx - 1] : null;
  const nextTrack =
    currentIdx >= 0 && currentIdx < audioTracks.length - 1
      ? audioTracks[currentIdx + 1]
      : null;

  return (
    <div className="miniplayer-dock" role="region" aria-label="Reproductor de audio">
      <div className="miniplayer-info">
        <span className="miniplayer-badge">♫</span>
        <div className="miniplayer-text">
          <strong>{track.name}</strong>
          <small>
            {formatBytes(track.sizeBytes)} · {track.extension.replace(/^\./, "").toUpperCase()}
          </small>
        </div>
      </div>

      <div className="miniplayer-controls">
        <button
          type="button"
          className="btn-chip"
          disabled={!prevTrack}
          onClick={() => prevTrack && onSelectTrack(prevTrack)}
          title="Pista anterior"
        >
          ⏮
        </button>

        <audio
          key={track.path}
          src={getFileUrl(track.path)}
          controls
          autoPlay
          onEnded={() => {
            if (nextTrack) onSelectTrack(nextTrack);
          }}
          className="miniplayer-audio"
        />

        <button
          type="button"
          className="btn-chip"
          disabled={!nextTrack}
          onClick={() => nextTrack && onSelectTrack(nextTrack)}
          title="Siguiente pista"
        >
          ⏭
        </button>
      </div>

      <div className="miniplayer-actions">
        <button
          type="button"
          className="btn-chip"
          onClick={() => onInspectTrack(track)}
        >
          Detalles
        </button>
        <button
          type="button"
          className="btn-icon"
          onClick={onClose}
          aria-label="Cerrar reproductor"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
