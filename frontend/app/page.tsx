"use client";

/**
 * Pantalla del explorador. Acá está el estado; los componentes dibujan.
 *
 * Hay tres pantallas: el splash mientras no sabemos si el núcleo responde,
 * la bienvenida cuando no hay bibliotecas ni una carpeta abierta, y el shell.
 *
 * Se recuerda entre visitas la vista, los recientes, la densidad, el sidebar,
 * la línea de tiempo y el orden. Tipo, fecha y búsqueda no: cambian seguido
 * y no tienen que sobrevivir un reinicio.
 *
 * `refreshToken` vuelve a pedir lo que ya se está viendo (un escaneo que
 * avanzó, un archivo que entró a una colección) sin vaciar la grilla.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { FolderSearch, Layers, RefreshCw, SearchX, Sparkles, TriangleAlert } from "lucide-react";
import {
  Brand,
  CollectionInfo,
  DateRange,
  Filters,
  LibraryInfo,
  MediaItem,
  MediaKind,
  RootEntry,
  SortKey,
  View,
  api,
  catalogParams
} from "../lib/api";
import { copyText } from "../lib/clipboard";
import { formatCount, lastSegment } from "../lib/format";
import { ease } from "../lib/motion";
import { messageOf, useCatalogSource, useCatalogSummary, useFolderSource } from "../lib/sources";
import { usePersistentState } from "../lib/usePersistentState";
import { Density, MediaGrid, ToggleMode } from "../components/grid/MediaGrid";
import { MediaViewer } from "../components/viewer/MediaViewer";
import { AudioMiniPlayer } from "../components/AudioMiniPlayer";
import { Sidebar } from "../components/shell/Sidebar";
import { Toolbar, describeSummary } from "../components/shell/Toolbar";
import { TimelineRail } from "../components/shell/TimelineRail";
import { SelectionBar } from "../components/shell/SelectionBar";
import { ToastStack, useToasts } from "../components/shell/Toasts";
import { Welcome } from "../components/shell/Welcome";
import { FolderPicker, PickerMode } from "../components/dialogs/FolderPicker";
import { CollectionDialog } from "../components/dialogs/CollectionDialog";
import { ConfirmDialog, ConfirmRequest } from "../components/dialogs/ConfirmDialog";

type ApiStatus = "connecting" | "online" | "offline";

type WebView = {
  postMessage?: (message: string) => void;
  addEventListener?: (type: "message", listener: (event: { data: unknown }) => void) => void;
  removeEventListener?: (type: "message", listener: (event: { data: unknown }) => void) => void;
};

const webview = (): WebView | undefined =>
  typeof window === "undefined" ? undefined : (window as unknown as { chrome?: { webview?: WebView } }).chrome?.webview;

const SCAN_POLL_MS = 900;

const viewKeyOf = (view: View) =>
  view.type === "all" ? "all" : view.type === "folder" ? `folder:${view.path}` : `${view.type}:${view.id}`;

const samePath = (a: string, b: string) => normalizePath(a) === normalizePath(b);
const normalizePath = (path: string) => path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
const isInside = (child: string, parent: string) =>
  samePath(child, parent) || normalizePath(child).startsWith(`${normalizePath(parent)}/`);

export default function ExplorerPage() {
  const [status, setStatus] = useState<ApiStatus>("connecting");
  const [brand, setBrand] = useState<Brand | null>(null);
  const [roots, setRoots] = useState<RootEntry[]>([]);
  const [libraries, setLibraries] = useState<LibraryInfo[]>([]);
  const [scanning, setScanning] = useState(false);
  const [collections, setCollections] = useState<CollectionInfo[]>([]);

  const [view, setView, viewReady] = usePersistentState<View>("companion.view.v2", { type: "all" });
  const [recents, setRecents, recentsReady] = usePersistentState<string[]>("companion.recents.v2", []);
  const [density, setDensity] = usePersistentState<Density>("companion.density.v2", "medium");
  const [collapsed, setCollapsed] = usePersistentState("companion.sidebar.v2", false);
  const [timelineOpen, setTimelineOpen] = usePersistentState("companion.timeline.v2", true);
  const [sortPref, setSortPref] = usePersistentState<{ sort: SortKey; desc: boolean }>("companion.sort.v2", {
    sort: "date",
    desc: true
  });

  const [kind, setKind] = useState<"all" | MediaKind>("all");
  const [extensions, setExtensions] = useState<string[]>([]);
  const [range, setRange] = useState<DateRange | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [recursive, setRecursive] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const anchorRef = useRef<number | null>(null);
  const [focusIndex, setFocusIndex] = useState(-1);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [audio, setAudio] = useState<{ item: MediaItem; index: number } | null>(null);
  const [reveal, setReveal] = useState<{ index: number; token: number } | null>(null);

  const [picker, setPicker] = useState<PickerMode | null>(null);
  const nativePickMode = useRef<PickerMode>("browse");
  const [collectionTarget, setCollectionTarget] = useState<string[] | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [nativeAvailable, setNativeAvailable] = useState(false);
  const { toasts, show: toast, dismiss } = useToasts();
  const searchRef = useRef<HTMLInputElement | null>(null);

  const filters: Filters = useMemo(
    () => ({ kind, extensions, search, range, sort: sortPref.sort, desc: sortPref.desc }),
    [kind, extensions, search, range, sortPref]
  );

  // Marca, bibliotecas y colecciones. Mientras hay un escaneo, se vuelven a pedir.

  const refreshLibraries = useCallback(async () => {
    const data = await api.libraries();
    setLibraries(data.libraries);
    setScanning(data.scanning);
    return data;
  }, []);

  const refreshCollections = useCallback(async () => {
    setCollections(await api.collections());
  }, []);

  const connect = useCallback(async () => {
    setStatus("connecting");
    try {
      const [brandData, libs, cols, rootList] = await Promise.all([
        api.brand(),
        api.libraries(),
        api.collections(),
        api.roots()
      ]);
      setBrand(brandData);
      setLibraries(libs.libraries);
      setScanning(libs.scanning);
      setCollections(cols);
      setRoots(rootList);
      setStatus("online");
      document.title = brandData.windowTitle;
    } catch {
      setStatus("offline");
    }
  }, []);

  useEffect(() => {
    void connect();
    setNativeAvailable(Boolean(webview()?.postMessage));
  }, [connect]);

  useEffect(() => {
    if (!scanning || status !== "online") return;
    let busy = false;
    const timer = window.setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        const data = await refreshLibraries();
        setRefreshToken((t) => t + 1);
        if (!data.scanning) await refreshCollections();
      } catch {
        // The next tick tries again.
      } finally {
        busy = false;
      }
    }, SCAN_POLL_MS);
    return () => window.clearInterval(timer);
  }, [refreshCollections, refreshLibraries, scanning, status]);

  // A saved view can point at something that no longer exists.
  useEffect(() => {
    if (status !== "online" || !viewReady) return;
    if (view.type === "library" && !libraries.some((l) => l.id === view.id)) setView({ type: "all" });
    if (view.type === "collection" && !collections.some((c) => c.id === view.id)) setView({ type: "all" });
  }, [collections, libraries, setView, status, view, viewReady]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 180);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  // Una sola fuente para la grilla y el visor: páginas del catálogo, o una carpeta.

  const ready = status === "online" && viewReady;
  const isFolder = view.type === "folder";
  const viewKey = viewKeyOf(view);
  const filterKey = JSON.stringify(filters);

  const catalogQuery = useMemo(
    () => (ready && !isFolder ? catalogParams(view, filters) : null),
    // `viewKey` and `filterKey` serialize `view` and `filters`.
    [ready, isFolder, viewKey, filterKey]
  );
  const summaryQuery = useMemo(() => {
    if (!catalogQuery) return null;
    const params = new URLSearchParams(catalogQuery);
    params.delete("sort");
    params.delete("desc");
    return params;
  }, [catalogQuery]);

  const catalogSource = useCatalogSource(catalogQuery, refreshToken);
  const catalogSummary = useCatalogSummary(summaryQuery, refreshToken);
  const folderData = useFolderSource(ready && isFolder ? view.path : null, filters, recursive, refreshToken);

  const source = isFolder ? folderData.source : catalogSource;
  const summary = isFolder ? folderData.summary : catalogSummary;
  const listing = isFolder ? folderData.listing : null;

  useEffect(() => {
    setSelected(new Set());
    anchorRef.current = null;
    setFocusIndex(-1);
  }, [source.key]);

  useEffect(() => {
    const path = folderData.listing?.path;
    if (!isFolder || !path || !recentsReady) return;
    setRecents((list) => (list[0] === path ? list : [path, ...list.filter((p) => !samePath(p, path))].slice(0, 8)));
  }, [folderData.listing?.path, isFolder, recentsReady, setRecents]);

  // Cambiar de vista limpia los filtros de esa visita. El orden se queda.

  const navigate = useCallback(
    (next: View) => {
      setView(next);
      setExtensions([]);
      setRange(null);
      setSearchInput("");
      setSearch("");
      setViewerIndex(null);
    },
    [setView]
  );

  const patchFilters = useCallback(
    (patch: Partial<Filters>) => {
      if (patch.kind !== undefined) setKind(patch.kind);
      if (patch.extensions !== undefined) setExtensions(patch.extensions);
      if (patch.range !== undefined) setRange(patch.range);
      if (patch.search !== undefined) setSearch(patch.search);
      if (patch.sort !== undefined || patch.desc !== undefined)
        setSortPref((current) => ({ sort: patch.sort ?? current.sort, desc: patch.desc ?? current.desc }));
    },
    [setSortPref]
  );

  const clearFilters = useCallback(() => {
    setExtensions([]);
    setRange(null);
    setSearchInput("");
    setSearch("");
  }, []);

  // Alta, baja y colecciones. El disco no se toca: solo cambian filas del catálogo.

  const addLibrary = useCallback(
    async (path: string) => {
      try {
        const result = await api.addLibrary(path);
        await refreshLibraries();
        setScanning(true);
        navigate({ type: "library", id: result.library.id });
        toast({
          tone: "success",
          message:
            result.absorbedLibraryIds.length > 0
              ? `«${result.library.name}» reúne ${result.absorbedLibraryIds.length} bibliotecas que estaban adentro.`
              : `Catalogando «${result.library.name}» en segundo plano.`
        });
      } catch (error) {
        toast({ tone: "error", message: messageOf(error) });
      }
    },
    [navigate, refreshLibraries, toast]
  );

  const rescan = useCallback(
    async (library: LibraryInfo) => {
      try {
        await api.rescanLibrary(library.id);
        await refreshLibraries();
        setScanning(true);
        toast({ tone: "info", message: `Volviendo a escanear «${library.name}».` });
      } catch (error) {
        toast({ tone: "error", message: messageOf(error) });
      }
    },
    [refreshLibraries, toast]
  );

  const askRemoveLibrary = useCallback(
    (library: LibraryInfo) =>
      setConfirm({
        title: `Quitar «${library.name}»`,
        body: "Se borra del catálogo, no del disco. Los archivos que estén en colecciones se conservan en ellas.",
        confirmLabel: "Quitar del catálogo",
        danger: true,
        run: async () => {
          try {
            await api.removeLibrary(library.id);
            if (view.type === "library" && view.id === library.id) navigate({ type: "all" });
            await Promise.all([refreshLibraries(), refreshCollections()]);
            setRefreshToken((t) => t + 1);
            toast({ tone: "success", message: `«${library.name}» ya no está en el catálogo.` });
          } catch (error) {
            toast({ tone: "error", message: messageOf(error) });
          }
        }
      }),
    [navigate, refreshCollections, refreshLibraries, toast, view]
  );

  const createCollection = useCallback(
    async (name: string) => {
      try {
        const created = await api.createCollection(name);
        await refreshCollections();
        toast({ tone: "success", message: `Colección «${created.name}» creada.` });
        return true;
      } catch (error) {
        toast({ tone: "error", message: messageOf(error) });
        return false;
      }
    },
    [refreshCollections, toast]
  );

  const renameCollection = useCallback(
    async (collection: CollectionInfo, name: string) => {
      try {
        await api.renameCollection(collection.id, name);
        await refreshCollections();
        return true;
      } catch (error) {
        toast({ tone: "error", message: messageOf(error) });
        return false;
      }
    },
    [refreshCollections, toast]
  );

  const askDeleteCollection = useCallback(
    (collection: CollectionInfo) =>
      setConfirm({
        title: `Eliminar «${collection.name}»`,
        body: "Se borra la colección. Los archivos siguen en su carpeta y en el catálogo.",
        confirmLabel: "Eliminar colección",
        danger: true,
        run: async () => {
          try {
            await api.deleteCollection(collection.id);
            if (view.type === "collection" && view.id === collection.id) navigate({ type: "all" });
            await refreshCollections();
            toast({ tone: "success", message: `Colección «${collection.name}» eliminada.` });
          } catch (error) {
            toast({ tone: "error", message: messageOf(error) });
          }
        }
      }),
    [navigate, refreshCollections, toast, view]
  );

  const addToCollection = useCallback(
    async (collection: CollectionInfo, paths: string[]) => {
      try {
        const result = await api.addToCollection(collection.id, paths);
        await refreshCollections();
        if (view.type === "collection" && view.id === collection.id) setRefreshToken((t) => t + 1);
        setCollectionTarget(null);
        setSelected(new Set());
        const skipped = paths.length - result.added;
        toast({
          tone: "success",
          message:
            result.added === 0
              ? `Ya estaban en «${collection.name}».`
              : `${formatCount(result.added)} agregados a «${collection.name}»${skipped > 0 ? ` (${skipped} ya estaban)` : ""}.`,
          action:
            view.type === "collection" && view.id === collection.id
              ? undefined
              : { label: "Ver", run: () => navigate({ type: "collection", id: collection.id }) }
        });
      } catch (error) {
        toast({ tone: "error", message: messageOf(error) });
      }
    },
    [navigate, refreshCollections, toast, view]
  );

  const removeFromCollection = useCallback(
    async (paths: string[]) => {
      if (view.type !== "collection") return;
      const collectionId = view.id;
      try {
        const result = await api.removeFromCollection(collectionId, paths);
        setSelected(new Set());
        setRefreshToken((t) => t + 1);
        await refreshCollections();
        toast({
          tone: "success",
          message: `${formatCount(result.removed)} quitados de «${result.collection?.name ?? "la colección"}».`,
          action: {
            label: "Deshacer",
            run: async () => {
              await api.addToCollection(collectionId, paths);
              setRefreshToken((t) => t + 1);
              await refreshCollections();
            }
          }
        });
      } catch (error) {
        toast({ tone: "error", message: messageOf(error) });
      }
    },
    [refreshCollections, toast, view]
  );

  const copy = useCallback(
    async (text: string, label: string) => {
      toast((await copyText(text)) ? { tone: "success", message: label } : { tone: "error", message: "No se pudo copiar." });
    },
    [toast]
  );

  // El diálogo propio, o el de Windows cuando la ventana manda "folder-picked".

  const choosePickedFolder = useCallback(
    (mode: PickerMode, path: string) => {
      setPicker(null);
      if (mode === "library") void addLibrary(path);
      else navigate({ type: "folder", path });
    },
    [addLibrary, navigate]
  );

  useEffect(() => {
    const host = webview();
    if (!host?.addEventListener) return;
    const onMessage = (event: { data: unknown }) => {
      try {
        const payload = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (payload?.type === "folder-picked" && typeof payload.path === "string" && payload.path)
          choosePickedFolder(nativePickMode.current, payload.path);
      } catch {
        // A message that is not ours.
      }
    };
    host.addEventListener("message", onMessage);
    return () => host.removeEventListener?.("message", onMessage);
  }, [choosePickedFolder]);

  // Selección al estilo fotos: el primer clic abre, y con algo marcado los clics alternan.

  const handleToggle = useCallback(
    (index: number, item: MediaItem, mode: ToggleMode) => {
      setSelected((current) => {
        const next = new Set(current);
        if (mode === "range" && anchorRef.current !== null) {
          const [from, to] = anchorRef.current < index ? [anchorRef.current, index] : [index, anchorRef.current];
          for (let i = from; i <= to; i++) {
            const entry = source.getItem(i);
            if (entry) next.add(entry.path);
          }
        } else {
          if (next.has(item.path)) next.delete(item.path);
          else next.add(item.path);
          anchorRef.current = index;
        }
        return next;
      });
    },
    [source]
  );

  const handleActivate = useCallback((index: number, item: MediaItem) => {
    setFocusIndex(index);
    if (item.kind === "audio") setAudio({ item, index });
    else setViewerIndex(index);
  }, []);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    anchorRef.current = null;
  }, []);

  const dialogOpen = picker !== null || collectionTarget !== null || confirm !== null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = (event.target as HTMLElement | null)?.closest("input, textarea, select");
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (event.key === "/" && !typing && viewerIndex === null && !dialogOpen) {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key === "Escape" && !typing && viewerIndex === null && !dialogOpen && selected.size > 0) {
        clearSelection();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearSelection, dialogOpen, selected.size, viewerIndex]);

  const audioNeighbor = (direction: 1 | -1) => {
    if (!audio || source.getItem(audio.index)?.path !== audio.item.path) return null;
    for (let i = audio.index + direction, steps = 0; i >= 0 && i < source.total && steps < 400; i += direction, steps++) {
      const entry = source.getItem(i);
      if (!entry) return null;
      if (entry.kind === "audio") return { item: entry, index: i };
    }
    return null;
  };
  const prevTrack = audioNeighbor(-1);
  const nextTrack = audioNeighbor(1);

  // Título, subtítulo y el estado vacío salen de la vista, no de un pedido aparte.

  const library = view.type === "library" ? libraries.find((l) => l.id === view.id) : undefined;
  const collection = view.type === "collection" ? collections.find((c) => c.id === view.id) : undefined;
  const scanningLibraries = libraries.filter((l) => l.status === "scanning" || l.status === "queued");
  const viewScanning = view.type === "library" ? scanningLibraries.some((l) => l.id === view.id) : view.type === "all" && scanning;

  const title =
    view.type === "all"
      ? "Todo el catálogo"
      : view.type === "library"
        ? library?.name ?? "Biblioteca"
        : view.type === "collection"
          ? collection?.name ?? "Colección"
          : lastSegment(view.path);

  const subtitle = (
    <>
      <span>{describeSummary(summary)}</span>
      {library ? <span className="is-mono">{library.path}</span> : null}
      <AnimatePresence>
        {viewScanning ? (
          <motion.span
            key="scanning"
            className="scan-pill"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
          >
            <RefreshCw size={12} className="spin" />
            Indexando {formatCount(scanningLibraries.reduce((sum, l) => sum + l.scannedCount, 0))}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </>
  );

  const canAddFolderAsLibrary =
    isFolder && !libraries.some((l) => isInside(view.path, l.path) || isInside(l.path, view.path));

  const hasFilters = extensions.length > 0 || range !== null || search !== "" || kind !== "all";

  const stage: "loading" | "error" | "empty" | "grid" =
    source.error && source.total === 0
      ? "error"
      : !source.loaded
        ? "loading"
        : source.total === 0
          ? "empty"
          : "grid";

  const screen: "splash" | "welcome" | "shell" =
    status === "connecting" || (status === "online" && !viewReady)
      ? "splash"
      : status === "offline" || (libraries.length === 0 && collections.length === 0 && !isFolder)
        ? "welcome"
        : "shell";

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait">
        {screen === "splash" ? (
          <motion.div
            key="splash"
            className="splash"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { delay: 0.25 } }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
          >
            <span className="splash-dot" />
          </motion.div>
        ) : screen === "welcome" ? (
          <Welcome
            key="welcome"
            brand={brand}
            offline={status === "offline"}
            roots={roots}
            recents={recents}
            onRetry={() => void connect()}
            onAddLibrary={() => setPicker("library")}
            onBrowse={() => setPicker("browse")}
            onOpenFolder={(path) => navigate({ type: "folder", path })}
          />
        ) : (
          <motion.div
            key="shell"
            className={`shell ${audio ? "has-dock" : ""}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.35, ease } }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
          >
            <Sidebar
              brand={brand}
              collapsed={collapsed}
              view={view}
              libraries={libraries}
              collections={collections}
              recents={recents}
              onToggleCollapsed={() => setCollapsed((v) => !v)}
              onNavigate={navigate}
              onAddLibrary={() => setPicker("library")}
              onBrowse={() => setPicker("browse")}
              onRescan={rescan}
              onRemoveLibrary={askRemoveLibrary}
              onCreateCollection={createCollection}
              onRenameCollection={renameCollection}
              onDeleteCollection={askDeleteCollection}
            />

            <div className="workspace">
              <Toolbar
                title={title}
                subtitle={subtitle}
                titleKey={viewKey}
                searchRef={searchRef}
                searchInput={searchInput}
                filters={filters}
                summary={summary}
                density={density}
                timelineOpen={timelineOpen}
                folder={listing}
                recursive={recursive}
                canAddFolderAsLibrary={canAddFolderAsLibrary}
                onSearchInput={setSearchInput}
                onFilters={patchFilters}
                onDensity={setDensity}
                onToggleTimeline={() => setTimelineOpen((v) => !v)}
                onOpenFolder={(path) => navigate({ type: "folder", path })}
                onRecursive={setRecursive}
                onAddFolderAsLibrary={() => isFolder && void addLibrary(view.path)}
              />

              <div className="stage-row">
                <main className="stage">
                  <AnimatePresence>
                    {source.pending && source.loaded ? (
                      <motion.div
                        key="progress"
                        className="stage-progress"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1, transition: { delay: 0.15 } }}
                        exit={{ opacity: 0 }}
                      />
                    ) : null}
                  </AnimatePresence>

                  <AnimatePresence mode="wait" initial={false}>
                    {stage === "grid" ? (
                      <motion.div
                        key="grid"
                        className="stage-fill"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1, transition: { duration: 0.2 } }}
                        exit={{ opacity: 0, transition: { duration: 0.14 } }}
                      >
                        <MediaGrid
                          source={source}
                          density={density}
                          selected={selected}
                          focusIndex={focusIndex}
                          activeAudioPath={audio?.item.path ?? null}
                          showDateBubble={filters.sort === "date"}
                          keyboardEnabled={viewerIndex === null && !dialogOpen}
                          revealRequest={reveal}
                          onFocusIndex={setFocusIndex}
                          onActivate={handleActivate}
                          onToggle={handleToggle}
                          onClearSelection={clearSelection}
                        />
                      </motion.div>
                    ) : stage === "loading" ? (
                      <motion.div
                        key="loading"
                        className="stage-fill skeleton-grid"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1, transition: { delay: 0.12 } }}
                        exit={{ opacity: 0, transition: { duration: 0.12 } }}
                      >
                        {Array.from({ length: 18 }, (_, i) => (
                          <span key={i} className="media-card skeleton" style={{ animationDelay: `${i * 40}ms` }} />
                        ))}
                      </motion.div>
                    ) : (
                      <EmptyState
                        key={`${stage}-${viewKey}`}
                        stage={stage}
                        error={source.error}
                        view={view}
                        scanning={viewScanning}
                        hasFilters={hasFilters}
                        missing={library?.status === "missing"}
                        subfolders={listing?.folders.length ?? 0}
                        recursive={recursive}
                        onClearFilters={() => {
                          clearFilters();
                          setKind("all");
                        }}
                        onRecursive={() => setRecursive(true)}
                        onRetry={() => setRefreshToken((t) => t + 1)}
                        onBrowse={() => setPicker("browse")}
                      />
                    )}
                  </AnimatePresence>
                </main>

                <AnimatePresence initial={false}>
                  {timelineOpen ? (
                    <TimelineRail key="timeline" timeline={summary?.timeline ?? null} range={range} onRange={setRange} />
                  ) : null}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence onExitComplete={() => document.querySelector<HTMLElement>("[data-grid-root]")?.focus({ preventScroll: true })}>
        {viewerIndex !== null && source.getItem(viewerIndex) ? (
          <MediaViewer
            key="viewer"
            source={source}
            index={viewerIndex}
            keyboardEnabled={!dialogOpen}
            onIndexChange={(index) => {
              setViewerIndex(index);
              setFocusIndex(index);
            }}
            onClose={() => setViewerIndex(null)}
            onAddToCollection={setCollectionTarget}
            onCopy={copy}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {screen === "shell" && selected.size > 0 && viewerIndex === null ? (
          <SelectionBar
            key="selection"
            count={selected.size}
            inCollection={view.type === "collection"}
            onAddToCollection={() => setCollectionTarget([...selected])}
            onRemoveFromCollection={() => void removeFromCollection([...selected])}
            onCopyPaths={() => void copy([...selected].join("\n"), `${formatCount(selected.size)} rutas copiadas`)}
            onClear={clearSelection}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {audio ? (
          <AudioMiniPlayer
            key="miniplayer"
            track={audio.item}
            hasPrev={prevTrack !== null}
            hasNext={nextTrack !== null}
            onPrev={() => prevTrack && setAudio(prevTrack)}
            onNext={() => nextTrack && setAudio(nextTrack)}
            onReveal={() => {
              if (source.getItem(audio.index)?.path !== audio.item.path) return;
              setFocusIndex(audio.index);
              setReveal((r) => ({ index: audio.index, token: (r?.token ?? 0) + 1 }));
            }}
            onClose={() => setAudio(null)}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {picker ? (
          <FolderPicker
            key="picker"
            mode={picker}
            initialPath={isFolder ? view.path : recents[0] ?? null}
            recents={recents}
            nativeAvailable={nativeAvailable}
            onNative={() => {
              nativePickMode.current = picker;
              webview()?.postMessage?.("pick-folder");
            }}
            onChoose={(path) => choosePickedFolder(picker, path)}
            onClose={() => setPicker(null)}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {collectionTarget ? (
          <CollectionDialog
            key="collection"
            count={collectionTarget.length}
            collections={collections}
            excludeId={view.type === "collection" ? view.id : null}
            onPick={(c) => addToCollection(c, collectionTarget)}
            onCreateAndPick={async (name) => {
              try {
                const created = await api.createCollection(name);
                await addToCollection(created, collectionTarget);
              } catch (error) {
                toast({ tone: "error", message: messageOf(error) });
              }
            }}
            onClose={() => setCollectionTarget(null)}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {confirm ? <ConfirmDialog key="confirm" request={confirm} onClose={() => setConfirm(null)} /> : null}
      </AnimatePresence>

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </MotionConfig>
  );
}

type EmptyStateProps = {
  stage: "error" | "empty";
  error: string | null;
  view: View;
  scanning: boolean;
  hasFilters: boolean;
  missing: boolean;
  subfolders: number;
  recursive: boolean;
  onClearFilters: () => void;
  onRecursive: () => void;
  onRetry: () => void;
  onBrowse: () => void;
};

function EmptyState(props: EmptyStateProps) {
  let icon = <SearchX size={30} />;
  let heading = "Nada por acá";
  let body = "";
  let action: { label: string; run: () => void } | null = null;

  if (props.stage === "error") {
    icon = <TriangleAlert size={30} />;
    heading = props.view.type === "folder" ? "No se pudo abrir la carpeta" : "No se pudo leer el catálogo";
    body = props.error ?? "";
    action = props.view.type === "folder" ? { label: "Elegir otra carpeta", run: props.onBrowse } : { label: "Reintentar", run: props.onRetry };
  } else if (props.scanning) {
    icon = <Sparkles size={30} />;
    heading = "Indexando…";
    body = "Los archivos aparecen acá a medida que se catalogan.";
  } else if (props.missing) {
    icon = <TriangleAlert size={30} />;
    heading = "La carpeta no está disponible";
    body = "Puede ser un disco desconectado. Cuando vuelva, escaneala desde el menú de la biblioteca.";
  } else if (props.hasFilters) {
    heading = "Nada coincide con estos filtros";
    body = "Probá con otro tipo, otra fecha u otra búsqueda.";
    action = { label: "Limpiar filtros", run: props.onClearFilters };
  } else if (props.view.type === "collection") {
    icon = <Layers size={30} />;
    heading = "Colección vacía";
    body = "Seleccioná archivos en la grilla y usá «Agregar a colección». Siguen en su carpeta.";
  } else if (props.view.type === "folder") {
    icon = <FolderSearch size={30} />;
    heading = "Sin multimedia en esta carpeta";
    body = props.subfolders > 0 && !props.recursive ? `Tiene ${props.subfolders} subcarpetas.` : "";
    action = props.subfolders > 0 && !props.recursive ? { label: "Aplanar subcarpetas", run: props.onRecursive } : null;
  }

  return (
    <motion.div
      className="stage-fill empty-state"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.32, ease } }}
      exit={{ opacity: 0, y: -8, transition: { duration: 0.14 } }}
    >
      <motion.div
        className="empty-icon"
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1, transition: { type: "spring", stiffness: 380, damping: 22, delay: 0.05 } }}
      >
        {icon}
      </motion.div>
      <h2>{heading}</h2>
      {body ? <p>{body}</p> : null}
      {action ? (
        <button type="button" className="button is-secondary" onClick={action.run}>
          {action.label}
        </button>
      ) : null}
    </motion.div>
  );
}
