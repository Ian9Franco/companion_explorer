export type Brand = {
  id: string;
  productName: string;
  windowTitle: string;
  preloadTitle: string;
  logoUrl: string;
};

export type RootEntry = {
  name: string;
  path: string;
  kind: string;
};

export type BreadcrumbEntry = {
  name: string;
  path: string;
};

export type FolderEntry = {
  name: string;
  path: string;
  modifiedUtc: string;
};

export type MediaKind = "image" | "video" | "audio";

export type MediaItem = {
  id?: number;
  name: string;
  path: string;
  folder?: string;
  relativePath?: string;
  extension: string;
  kind: MediaKind;
  sizeBytes: number;
  modifiedUtc: string;
  libraryId?: number | null;
};

export type FolderSummary = {
  totalCount: number;
  imageCount: number;
  videoCount: number;
  audioCount: number;
  totalBytes: number;
};

export type FolderListing = {
  path: string;
  name: string;
  parentPath: string | null;
  breadcrumbs: BreadcrumbEntry[];
  folders: FolderEntry[];
  files: MediaItem[];
  summary: FolderSummary;
};

export type LibraryStatus = "idle" | "queued" | "scanning" | "missing" | "error";

export type LibraryInfo = {
  id: number;
  path: string;
  name: string;
  addedUtc: string;
  lastScanUtc: string | null;
  fileCount: number;
  totalBytes: number;
  status: LibraryStatus;
  scannedCount: number;
  error: string | null;
};

export type CollectionInfo = {
  id: number;
  name: string;
  itemCount: number;
  coverPath: string | null;
  createdUtc: string;
  updatedUtc: string;
};

export type CatalogPage = {
  total: number;
  offset: number;
  items: MediaItem[];
};

export type TimelineBucket = {
  year: number;
  month: number;
  count: number;
};

export type CatalogSummary = {
  totalCount: number;
  totalBytes: number;
  kinds: { image: number; video: number; audio: number };
  extensions: { extension: string; count: number }[];
  timeline: TimelineBucket[];
};

export type SortKey = "date" | "name" | "size" | "type";

export type DateRange = {
  from: number;
  to: number;
  label: string;
};

export type Filters = {
  kind: "all" | MediaKind;
  extensions: string[];
  search: string;
  range: DateRange | null;
  sort: SortKey;
  desc: boolean;
};

export type View =
  | { type: "all" }
  | { type: "library"; id: number }
  | { type: "collection"; id: number }
  | { type: "folder"; path: string };

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:5080";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers
  });

  if (!response.ok) {
    let message = `El núcleo respondió ${response.status}.`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload?.error) message = payload.error;
    } catch {
      // The body was not JSON; keep the status message.
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });

export const api = {
  brand: (signal?: AbortSignal) => request<Brand>("/brand", { signal }),

  roots: async (signal?: AbortSignal) =>
    (await request<{ roots: RootEntry[] }>("/roots", { signal })).roots ?? [],

  folder: (path: string, filters: Pick<Filters, "kind" | "search" | "sort" | "desc">, recursive: boolean, signal?: AbortSignal) => {
    const params = new URLSearchParams({ path, sort: filters.sort, desc: String(filters.desc) });
    if (filters.kind !== "all") params.set("kind", filters.kind);
    if (filters.search.trim()) params.set("search", filters.search.trim());
    if (recursive) params.set("recursive", "true");
    return request<FolderListing>(`/folders?${params}`, { signal });
  },

  libraries: (signal?: AbortSignal) =>
    request<{ libraries: LibraryInfo[]; scanning: boolean }>("/libraries", { signal }),

  addLibrary: (path: string) =>
    request<{ library: LibraryInfo; absorbedLibraryIds: number[] }>("/libraries", { method: "POST", ...json({ path }) }),

  rescanLibrary: (id: number) => request<LibraryInfo>(`/libraries/${id}/scan`, { method: "POST" }),

  removeLibrary: (id: number) => request<void>(`/libraries/${id}`, { method: "DELETE" }),

  catalogPage: (params: URLSearchParams, offset: number, limit: number, signal?: AbortSignal) => {
    const query = new URLSearchParams(params);
    query.set("offset", String(offset));
    query.set("limit", String(limit));
    return request<CatalogPage>(`/catalog/files?${query}`, { signal });
  },

  catalogSummary: (params: URLSearchParams, signal?: AbortSignal) =>
    request<CatalogSummary>(`/catalog/summary?${params}`, { signal }),

  collections: async (signal?: AbortSignal) =>
    (await request<{ collections: CollectionInfo[] }>("/collections", { signal })).collections ?? [],

  createCollection: (name: string) =>
    request<CollectionInfo>("/collections", { method: "POST", ...json({ name }) }),

  renameCollection: (id: number, name: string) =>
    request<CollectionInfo>(`/collections/${id}`, { method: "PATCH", ...json({ name }) }),

  deleteCollection: (id: number) => request<void>(`/collections/${id}`, { method: "DELETE" }),

  addToCollection: (id: number, paths: string[]) =>
    request<{ added: number; collection: CollectionInfo }>(`/collections/${id}/items`, { method: "POST", ...json({ paths }) }),

  removeFromCollection: (id: number, paths: string[]) =>
    request<{ removed: number; collection: CollectionInfo }>(`/collections/${id}/items/remove`, { method: "POST", ...json({ paths }) })
};

export function catalogParams(view: View, filters: Filters): URLSearchParams {
  const params = new URLSearchParams();
  if (view.type === "library") params.set("library", String(view.id));
  if (view.type === "collection") params.set("collection", String(view.id));
  if (filters.kind !== "all") params.set("kind", filters.kind);
  if (filters.extensions.length > 0) params.set("ext", filters.extensions.join(","));
  if (filters.search.trim()) params.set("search", filters.search.trim());
  if (filters.range) {
    params.set("from", String(filters.range.from));
    params.set("to", String(filters.range.to));
  }
  params.set("sort", filters.sort);
  params.set("desc", String(filters.desc));
  return params;
}

export function thumbUrl(path: string, size = 320): string {
  return `${API_URL}/thumb?${new URLSearchParams({ path, size: String(size) })}`;
}

export function fileUrl(path: string): string {
  return `${API_URL}/file?${new URLSearchParams({ path })}`;
}

export function brandLogoUrl(brand: Brand | null): string | null {
  return brand ? `${API_URL}${brand.logoUrl}` : null;
}
