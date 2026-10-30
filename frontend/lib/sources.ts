"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CatalogSummary,
  Filters,
  FolderListing,
  MediaItem,
  TimelineBucket,
  api
} from "./api";

/**
 * Lo que leen la grilla y el visor.
 *
 * El catálogo llega de a páginas de 240 y se guarda en un ref: pedir la
 * página siguiente no rearma la lista. Una carpeta llega en un solo listado
 * y el filtro de extensión y de fecha se aplica en el cliente, porque ese
 * endpoint no los tiene.
 *
 * En los dos casos el resultado anterior sigue en pantalla hasta que llega
 * el nuevo, así un cambio de filtro no parpadea vacío.
 */
export type MediaSource = {
  key: string;
  total: number;
  pending: boolean;
  loaded: boolean;
  error: string | null;
  version: number;
  getItem: (index: number) => MediaItem | undefined;
  ensureRange: (start: number, end: number) => void;
};

const PAGE_SIZE = 240;

type PageCache = {
  key: string;
  params: URLSearchParams;
  pages: Map<number, MediaItem[]>;
  inflight: Set<number>;
  total: number;
  signal: AbortSignal;
};

type SourceState = {
  key: string;
  total: number;
  pending: boolean;
  loaded: boolean;
  error: string | null;
  version: number;
};

const initialState: SourceState = { key: "", total: 0, pending: true, loaded: false, error: null, version: 0 };

export function useCatalogSource(params: URLSearchParams | null, refreshToken: number): MediaSource {
  const key = params?.toString() ?? "";
  const cacheRef = useRef<PageCache | null>(null);
  const rangeRef = useRef({ start: 0, end: PAGE_SIZE - 1 });
  const [state, setState] = useState<SourceState>(initialState);

  useEffect(() => {
    if (!params) return;
    const controller = new AbortController();
    setState((s) => ({ ...s, pending: true, error: null }));

    api
      .catalogPage(params, 0, PAGE_SIZE, controller.signal)
      .then((page) => {
        cacheRef.current = {
          key,
          params,
          pages: new Map([[0, page.items]]),
          inflight: new Set(),
          total: page.total,
          signal: controller.signal
        };
        rangeRef.current = { start: 0, end: PAGE_SIZE - 1 };
        setState((s) => ({ key, total: page.total, pending: false, loaded: true, error: null, version: s.version + 1 }));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState((s) => ({ ...s, pending: false, error: messageOf(error) }));
      });

    return () => controller.abort();
    // `key` is the serialized form of `params`.
  }, [key]);

  useEffect(() => {
    const cache = cacheRef.current;
    if (refreshToken === 0 || !cache || cache.key !== key) return;

    const controller = new AbortController();
    const first = Math.floor(rangeRef.current.start / PAGE_SIZE);
    const last = Math.max(first, Math.floor(rangeRef.current.end / PAGE_SIZE));
    const indexes = Array.from({ length: last - first + 1 }, (_, i) => first + i);

    Promise.all(indexes.map((p) => api.catalogPage(cache.params, p * PAGE_SIZE, PAGE_SIZE, controller.signal)))
      .then((pages) => {
        if (cacheRef.current !== cache) return;
        const fresh = new Map<number, MediaItem[]>();
        pages.forEach((page, i) => fresh.set(indexes[i], page.items));
        const total = pages[0]?.total ?? 0;
        cacheRef.current = { ...cache, pages: fresh, inflight: new Set(), total };
        setState((s) => ({ ...s, total, version: s.version + 1 }));
      })
      .catch(() => {
        // A failed background refresh keeps what is on screen.
      });

    return () => controller.abort();
  }, [refreshToken]);

  const getItem = useCallback((index: number) => {
    const cache = cacheRef.current;
    if (!cache) return undefined;
    return cache.pages.get(Math.floor(index / PAGE_SIZE))?.[index % PAGE_SIZE];
  }, []);

  const ensureRange = useCallback((start: number, end: number) => {
    const cache = cacheRef.current;
    if (!cache || cache.total === 0) return;
    rangeRef.current = { start, end };

    const first = Math.max(0, Math.floor(start / PAGE_SIZE));
    const last = Math.floor(Math.min(end, cache.total - 1) / PAGE_SIZE);
    for (let p = first; p <= last; p++) {
      if (cache.pages.has(p) || cache.inflight.has(p)) continue;
      cache.inflight.add(p);
      api
        .catalogPage(cache.params, p * PAGE_SIZE, PAGE_SIZE, cache.signal)
        .then((page) => {
          if (cacheRef.current !== cache) return;
          cache.pages.set(p, page.items);
          cache.inflight.delete(p);
          setState((s) => ({ ...s, version: s.version + 1 }));
        })
        .catch(() => cache.inflight.delete(p));
    }
  }, []);

  return useMemo(
    () => ({ ...state, getItem, ensureRange }),
    [state, getItem, ensureRange]
  );
}

export type FolderData = {
  source: MediaSource;
  listing: FolderListing | null;
  summary: CatalogSummary | null;
};

export function useFolderSource(
  path: string | null,
  filters: Filters,
  recursive: boolean,
  refreshToken: number
): FolderData {
  const [listing, setListing] = useState<FolderListing | null>(null);
  const [requestKey, setRequestKey] = useState("");
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const serverKey = path ? `${path}|${filters.kind}|${filters.search}|${filters.sort}|${filters.desc}|${recursive}` : "";

  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    setPending(true);
    setError(null);

    api
      .folder(path, filters, recursive, controller.signal)
      .then((data) => {
        setListing(data);
        setRequestKey(serverKey);
        setPending(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(messageOf(err));
        setPending(false);
      });

    return () => controller.abort();
  }, [serverKey, refreshToken]);

  const extensionKey = filters.extensions.join(",");
  const rangeKey = filters.range ? `${filters.range.from}-${filters.range.to}` : "";

  const derived = useMemo(() => {
    const files = listing?.files ?? [];
    const extensionSet = new Set(filters.extensions);
    const inRange = (item: MediaItem) => {
      if (!filters.range) return true;
      const time = Date.parse(item.modifiedUtc);
      return time >= filters.range.from && time < filters.range.to;
    };
    const visible = files.filter((f) => (extensionSet.size === 0 || extensionSet.has(f.extension)) && inRange(f));

    const extensionCounts = new Map<string, number>();
    for (const file of files) {
      if (inRange(file)) extensionCounts.set(file.extension, (extensionCounts.get(file.extension) ?? 0) + 1);
    }

    const bucketCounts = new Map<string, TimelineBucket>();
    for (const file of files) {
      if (extensionSet.size > 0 && !extensionSet.has(file.extension)) continue;
      const date = new Date(file.modifiedUtc);
      const id = `${date.getFullYear()}-${date.getMonth() + 1}`;
      const bucket = bucketCounts.get(id) ?? { year: date.getFullYear(), month: date.getMonth() + 1, count: 0 };
      bucket.count++;
      bucketCounts.set(id, bucket);
    }

    const summary: CatalogSummary | null = listing
      ? {
          totalCount: visible.length,
          totalBytes: visible.reduce((sum, f) => sum + f.sizeBytes, 0),
          kinds: {
            image: listing.summary.imageCount,
            video: listing.summary.videoCount,
            audio: listing.summary.audioCount
          },
          extensions: [...extensionCounts]
            .map(([extension, count]) => ({ extension, count }))
            .sort((a, b) => b.count - a.count || a.extension.localeCompare(b.extension)),
          timeline: [...bucketCounts.values()].sort((a, b) => b.year - a.year || b.month - a.month)
        }
      : null;

    return { visible, summary };
  }, [listing, extensionKey, rangeKey]);

  const visibleRef = useRef<MediaItem[]>([]);
  visibleRef.current = derived.visible;

  const getItem = useCallback((index: number) => visibleRef.current[index], []);
  const ensureRange = useCallback(() => {}, []);

  const source = useMemo<MediaSource>(
    () => ({
      key: `${requestKey}|${extensionKey}|${rangeKey}`,
      total: derived.visible.length,
      pending,
      loaded: listing !== null,
      error,
      version: 0,
      getItem,
      ensureRange
    }),
    [requestKey, extensionKey, rangeKey, derived.visible, pending, listing, error, getItem, ensureRange]
  );

  return { source, listing, summary: derived.summary };
}

export function useCatalogSummary(params: URLSearchParams | null, refreshToken: number): CatalogSummary | null {
  // null means "do not query". An empty string is a real query: the whole catalog,
  // whose params are only sort and direction and those are stripped before this hook.
  const key = params === null ? null : params.toString();
  const [summary, setSummary] = useState<CatalogSummary | null>(null);

  useEffect(() => {
    if (key === null || !params) return;
    const controller = new AbortController();
    api
      .catalogSummary(params, controller.signal)
      .then(setSummary)
      .catch(() => {
        // The counters keep their last value until the next successful read.
      });
    return () => controller.abort();
  }, [key, refreshToken]);

  return summary;
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Algo salió mal.";
}
