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

export type MediaFileEntry = {
  name: string;
  path: string;
  relativePath: string;
  extension: string;
  kind: MediaKind;
  sizeBytes: number;
  modifiedUtc: string;
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
  files: MediaFileEntry[];
  summary: FolderSummary;
};

export type FolderQueryOptions = {
  path: string;
  kind?: "all" | MediaKind;
  search?: string;
  sort?: "date" | "name" | "size" | "type";
  desc?: boolean;
  recursive?: boolean;
  signal?: AbortSignal;
};

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:5080";

export async function fetchBrand(signal?: AbortSignal): Promise<Brand> {
  const response = await fetch(`${API_URL}/brand`, { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as Brand;
}

export async function fetchRoots(signal?: AbortSignal): Promise<RootEntry[]> {
  const response = await fetch(`${API_URL}/roots`, { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const data = (await response.json()) as { roots: RootEntry[] };
  return data.roots ?? [];
}

export async function fetchFolderListing(options: FolderQueryOptions): Promise<FolderListing> {
  const params = new URLSearchParams();
  params.set("path", options.path);
  if (options.kind && options.kind !== "all") {
    params.set("kind", options.kind);
  }
  if (options.search && options.search.trim().length > 0) {
    params.set("search", options.search.trim());
  }
  if (options.sort) {
    params.set("sort", options.sort);
  }
  if (typeof options.desc === "boolean") {
    params.set("desc", String(options.desc));
  }
  if (options.recursive) {
    params.set("recursive", "true");
  }

  const response = await fetch(`${API_URL}/folders?${params.toString()}`, {
    signal: options.signal
  });

  if (!response.ok) {
    let message = `No se pudo abrir la carpeta (${response.status}).`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload?.error) {
        message = payload.error;
      }
    } catch {
      // Ignore parse error
    }
    throw new Error(message);
  }

  return (await response.json()) as FolderListing;
}

export function getThumbUrl(filePath: string, size = 320): string {
  const params = new URLSearchParams({
    path: filePath,
    size: String(size)
  });
  return `${API_URL}/thumb?${params.toString()}`;
}

export function getFileUrl(filePath: string): string {
  const params = new URLSearchParams({
    path: filePath
  });
  return `${API_URL}/file?${params.toString()}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, index);
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

export function formatShortDate(iso: string): string {
  try {
    const date = new Date(iso);
    return new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(date);
  } catch {
    return iso;
  }
}

export function formatFullDateTime(iso: string): string {
  try {
    const date = new Date(iso);
    return new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  } catch {
    return iso;
  }
}
