"use client";

import { FormEvent, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUp,
  ChevronRight,
  Download,
  Folder,
  HardDrive,
  History,
  Home,
  Image as ImageIcon,
  Monitor,
  Music,
  Video
} from "lucide-react";
import { FolderListing, RootEntry, api } from "../../lib/api";
import { formatCount, lastSegment } from "../../lib/format";
import { ease } from "../../lib/motion";
import { messageOf } from "../../lib/sources";
import { Modal } from "../ui/Modal";

export type PickerMode = "library" | "browse";

type FolderPickerProps = {
  mode: PickerMode;
  initialPath: string | null;
  recents: string[];
  nativeAvailable: boolean;
  onNative: () => void;
  onChoose: (path: string) => void;
  onClose: () => void;
};

const ROOT_ICON: Record<string, typeof Folder> = {
  pictures: ImageIcon,
  videos: Video,
  music: Music,
  downloads: Download,
  desktop: Monitor,
  home: Home,
  drive: HardDrive
};

const LISTING_FILTERS = { kind: "all", search: "", sort: "name", desc: false } as const;

export function FolderPicker({ mode, initialPath, recents, nativeAvailable, onNative, onChoose, onClose }: FolderPickerProps) {
  const [roots, setRoots] = useState<RootEntry[]>([]);
  const [path, setPath] = useState(initialPath ?? "");
  const [input, setInput] = useState(initialPath ?? "");
  const [listing, setListing] = useState<FolderListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .roots(controller.signal)
      .then((list) => {
        setRoots(list);
        setPath((current) => current || recents[0] || list[0]?.path || "");
      })
      .catch((err: unknown) => !controller.signal.aborted && setError(messageOf(err)));
    return () => controller.abort();
    // Roots are read once per opening.
  }, []);

  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api
      .folder(path, LISTING_FILTERS, false, controller.signal)
      .then((data) => {
        setListing(data);
        setInput(data.path);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(messageOf(err));
        setLoading(false);
      });
    return () => controller.abort();
  }, [path]);

  const submitInput = (event: FormEvent) => {
    event.preventDefault();
    if (input.trim()) setPath(input.trim());
  };

  const current = listing?.path ?? path;
  const isLibrary = mode === "library";

  return (
    <Modal
      title={isLibrary ? "Agregar biblioteca" : "Explorar una carpeta"}
      subtitle={
        isLibrary
          ? "La carpeta y sus subcarpetas se catalogan en segundo plano. Nada se escribe en ellas."
          : "Mirá una carpeta tal cual está en disco, sin catalogarla."
      }
      className="picker"
      onClose={onClose}
      headerActions={
        nativeAvailable ? (
          <button type="button" className="button is-secondary" onClick={onNative}>
            Diálogo de Windows…
          </button>
        ) : null
      }
    >
      <form className="picker-path" onSubmit={submitInput}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pegá una ruta: C:\Users\vos\Pictures o /home/vos/fotos"
          aria-label="Ruta"
          spellCheck={false}
        />
        <button type="submit" className="button is-secondary">
          Ir
        </button>
      </form>

      <div className="picker-body">
        <aside className="picker-places">
          <div className="picker-places-title">Ubicaciones</div>
          {roots.map((root) => {
            const Icon = ROOT_ICON[root.kind] ?? Folder;
            return (
              <button
                key={root.path}
                type="button"
                className={`picker-place ${current === root.path ? "is-active" : ""}`}
                onClick={() => setPath(root.path)}
                title={root.path}
              >
                <Icon size={16} />
                <span>{root.name}</span>
              </button>
            );
          })}
          {recents.length > 0 ? (
            <>
              <div className="picker-places-title">Recientes</div>
              {recents.slice(0, 6).map((recent) => (
                <button
                  key={recent}
                  type="button"
                  className={`picker-place ${current === recent ? "is-active" : ""}`}
                  onClick={() => setPath(recent)}
                  title={recent}
                >
                  <History size={16} />
                  <span>{lastSegment(recent)}</span>
                </button>
              ))}
            </>
          ) : null}
        </aside>

        <section className="picker-browser">
          <div className="picker-crumbs">
            <button
              type="button"
              className="icon-button is-small"
              disabled={!listing?.parentPath}
              onClick={() => listing?.parentPath && setPath(listing.parentPath)}
              aria-label="Subir"
            >
              <ArrowUp size={15} />
            </button>
            {(listing?.breadcrumbs ?? []).map((crumb, i) => (
              <span key={crumb.path} className="crumb">
                {i > 0 ? <ChevronRight size={13} className="crumb-sep" /> : null}
                <button type="button" onClick={() => setPath(crumb.path)}>
                  {crumb.name}
                </button>
              </span>
            ))}
            {loading ? <span className="picker-spinner" /> : null}
          </div>

          <div className="picker-list">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={listing?.path ?? "empty"}
                className="picker-list-inner"
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0, transition: { duration: 0.22, ease } }}
                exit={{ opacity: 0, x: -10, transition: { duration: 0.12 } }}
              >
                {error ? (
                  <p className="picker-message is-error">{error}</p>
                ) : listing && listing.folders.length === 0 ? (
                  <p className="picker-message">No hay subcarpetas acá.</p>
                ) : (
                  listing?.folders.map((folder, i) => (
                    <motion.button
                      key={folder.path}
                      type="button"
                      className="picker-folder"
                      onClick={() => setPath(folder.path)}
                      onDoubleClick={() => onChoose(folder.path)}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0, transition: { duration: 0.2, ease, delay: Math.min(i, 16) * 0.015 } }}
                    >
                      <Folder size={16} />
                      <span>{folder.name}</span>
                      <ChevronRight size={15} className="picker-folder-go" />
                    </motion.button>
                  ))
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <footer className="picker-footer">
            <div className="picker-current">
              <code title={current}>{current || "Elegí una ubicación"}</code>
              {listing && !error ? (
                <span>
                  {formatCount(listing.summary.totalCount)} multimedia acá · {formatCount(listing.folders.length)} subcarpetas
                </span>
              ) : null}
            </div>
            <button type="button" className="button is-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="button" className="button" disabled={!listing || !!error} onClick={() => listing && onChoose(listing.path)}>
              {isLibrary ? "Catalogar esta carpeta" : "Explorar esta carpeta"}
            </button>
          </footer>
        </section>
      </div>
    </Modal>
  );
}
