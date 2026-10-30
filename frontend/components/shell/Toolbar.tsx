"use client";

import { ReactNode, RefObject } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  CalendarRange,
  ChevronRight,
  CornerLeftUp,
  FolderPlus,
  Layers,
  Rows3,
  Search,
  X
} from "lucide-react";
import { CatalogSummary, Filters, FolderListing, MediaKind, SortKey } from "../../lib/api";
import { formatBytes, formatCount } from "../../lib/format";
import { ease, spring } from "../../lib/motion";
import { Density } from "../grid/MediaGrid";
import { MenuItem, Popover } from "../ui/Popover";

const KINDS: { id: "all" | MediaKind; label: string }[] = [
  { id: "all", label: "Todo" },
  { id: "image", label: "Fotos" },
  { id: "video", label: "Videos" },
  { id: "audio", label: "Audio" }
];

const SORTS: { id: SortKey; label: string; defaultDesc: boolean }[] = [
  { id: "date", label: "Fecha", defaultDesc: true },
  { id: "name", label: "Nombre", defaultDesc: false },
  { id: "size", label: "Tamaño", defaultDesc: true },
  { id: "type", label: "Tipo", defaultDesc: false }
];

const DENSITIES: { id: Density; label: string }[] = [
  { id: "compact", label: "S" },
  { id: "medium", label: "M" },
  { id: "large", label: "L" }
];

type ToolbarProps = {
  title: ReactNode;
  subtitle: ReactNode;
  titleKey: string;
  searchRef: RefObject<HTMLInputElement | null>;
  searchInput: string;
  filters: Filters;
  summary: CatalogSummary | null;
  density: Density;
  timelineOpen: boolean;
  folder: FolderListing | null;
  recursive: boolean;
  canAddFolderAsLibrary: boolean;
  onSearchInput: (value: string) => void;
  onFilters: (patch: Partial<Filters>) => void;
  onDensity: (density: Density) => void;
  onToggleTimeline: () => void;
  onOpenFolder: (path: string) => void;
  onRecursive: (value: boolean) => void;
  onAddFolderAsLibrary: () => void;
};

export function Toolbar(props: ToolbarProps) {
  const { filters, summary, folder } = props;
  const kinds = summary?.kinds;
  const kindCount = (id: "all" | MediaKind) =>
    !kinds ? null : id === "all" ? kinds.image + kinds.video + kinds.audio : kinds[id];
  const sort = SORTS.find((s) => s.id === filters.sort) ?? SORTS[0];
  const extensions = summary?.extensions ?? [];
  const hasFilters = filters.extensions.length > 0 || filters.range !== null || filters.search.trim() !== "";

  return (
    <header className="toolbar">
      <div className="toolbar-row">
        <div className="toolbar-title">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={props.titleKey}
              className="toolbar-title-inner"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.32, ease } }}
              exit={{ opacity: 0, y: -8, transition: { duration: 0.16, ease } }}
            >
              {folder ? <Breadcrumbs folder={folder} onOpen={props.onOpenFolder} /> : <h1>{props.title}</h1>}
            </motion.div>
          </AnimatePresence>
          <div className="toolbar-subtitle">{props.subtitle}</div>
        </div>

        <div className="toolbar-actions">
          <label className={`search-field ${props.searchInput ? "has-value" : ""}`}>
            <Search size={16} />
            <input
              ref={props.searchRef}
              type="search"
              value={props.searchInput}
              onChange={(e) => props.onSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && props.searchInput) {
                  e.stopPropagation();
                  props.onSearchInput("");
                }
              }}
              placeholder="Buscar por nombre o carpeta"
              aria-label="Buscar"
            />
            <AnimatePresence>
              {props.searchInput ? (
                <motion.button
                  key="clear"
                  type="button"
                  className="search-clear"
                  onClick={() => props.onSearchInput("")}
                  aria-label="Limpiar búsqueda"
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ duration: 0.14 }}
                >
                  <X size={13} />
                </motion.button>
              ) : (
                <motion.kbd key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  Ctrl F
                </motion.kbd>
              )}
            </AnimatePresence>
          </label>

          <Popover
            className="sort-menu"
            trigger={({ open, toggle }) => (
              <button type="button" className={`chip ${open ? "is-active" : ""}`} onClick={toggle} aria-haspopup="menu">
                {filters.desc ? <ArrowDownWideNarrow size={15} /> : <ArrowUpNarrowWide size={15} />}
                {sort.label}
              </button>
            )}
          >
            {(close) => (
              <>
                <div className="menu-title">Ordenar por</div>
                {SORTS.map((option) => (
                  <MenuItem
                    key={option.id}
                    label={option.label}
                    active={option.id === filters.sort}
                    onSelect={() => {
                      props.onFilters({ sort: option.id, desc: option.id === filters.sort ? filters.desc : option.defaultDesc });
                      close();
                    }}
                  />
                ))}
                <div className="menu-separator" />
                <MenuItem
                  icon={filters.desc ? <ArrowUpNarrowWide size={15} /> : <ArrowDownWideNarrow size={15} />}
                  label={filters.desc ? "Invertir: ascendente" : "Invertir: descendente"}
                  onSelect={() => props.onFilters({ desc: !filters.desc })}
                />
              </>
            )}
          </Popover>

          <div className="segmented" role="group" aria-label="Tamaño de miniaturas">
            {DENSITIES.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`segmented-item ${props.density === d.id ? "is-active" : ""}`}
                onClick={() => props.onDensity(d.id)}
                aria-pressed={props.density === d.id}
              >
                {props.density === d.id ? (
                  <motion.span layoutId="density-pill" className="segmented-pill" transition={spring} />
                ) : null}
                <span>{d.label}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            className={`icon-button ${props.timelineOpen ? "is-active" : ""}`}
            onClick={props.onToggleTimeline}
            aria-pressed={props.timelineOpen}
            aria-label="Línea de tiempo"
            title="Línea de tiempo"
          >
            <CalendarRange size={17} />
          </button>
        </div>
      </div>

      <div className="toolbar-row is-filters">
        <div className="kind-tabs" role="tablist" aria-label="Tipo de archivo">
          {KINDS.map((kind) => {
            const active = filters.kind === kind.id;
            const count = kindCount(kind.id);
            return (
              <button
                key={kind.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`kind-tab ${active ? "is-active" : ""}`}
                onClick={() => props.onFilters({ kind: kind.id, extensions: [] })}
              >
                {active ? <motion.span layoutId="kind-pill" className="kind-pill" transition={spring} /> : null}
                <span>{kind.label}</span>
                {count !== null ? <AnimatedCount value={count} /> : null}
              </button>
            );
          })}
        </div>

        <div className="filter-chips">
          <AnimatePresence initial={false} mode="popLayout">
            {extensions.slice(0, 10).map((ext) => {
              const active = filters.extensions.includes(ext.extension);
              return (
                <motion.button
                  layout="position"
                  key={ext.extension}
                  type="button"
                  className={`ext-chip ${active ? "is-active" : ""}`}
                  onClick={() =>
                    props.onFilters({
                      extensions: active
                        ? filters.extensions.filter((e) => e !== ext.extension)
                        : [...filters.extensions, ext.extension]
                    })
                  }
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ duration: 0.18, ease }}
                >
                  {ext.extension.replace(/^\./, "").toUpperCase()}
                  <small>{formatCount(ext.count)}</small>
                </motion.button>
              );
            })}

            {filters.range ? (
              <motion.button
                layout="position"
                key="range"
                type="button"
                className="ext-chip is-range"
                onClick={() => props.onFilters({ range: null })}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.18, ease }}
                title="Quitar el filtro de fecha"
              >
                <CalendarRange size={13} />
                {filters.range.label}
                <X size={12} />
              </motion.button>
            ) : null}

            {hasFilters ? (
              <motion.button
                layout="position"
                key="clear"
                type="button"
                className="text-button"
                onClick={() => {
                  props.onSearchInput("");
                  props.onFilters({ extensions: [], range: null, search: "" });
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                Limpiar filtros
              </motion.button>
            ) : null}
          </AnimatePresence>
        </div>

        {folder ? (
          <div className="folder-actions">
            <button
              type="button"
              className={`chip ${props.recursive ? "is-active" : ""}`}
              onClick={() => props.onRecursive(!props.recursive)}
              title="Incluir los archivos de todas las subcarpetas"
            >
              <Layers size={15} />
              {props.recursive ? "Aplanado" : "Aplanar"}
            </button>
            {props.canAddFolderAsLibrary ? (
              <button type="button" className="chip is-accent" onClick={props.onAddFolderAsLibrary}>
                <FolderPlus size={15} />
                Catalogar
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <AnimatePresence initial={false}>
        {folder && !props.recursive && folder.folders.length > 0 ? (
          <motion.div
            key={folder.path}
            className="subfolder-strip"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto", transition: { duration: 0.28, ease } }}
            exit={{ opacity: 0, height: 0, transition: { duration: 0.18, ease } }}
          >
            <div className="subfolder-track">
              {folder.parentPath ? (
                <button type="button" className="subfolder-chip is-up" onClick={() => props.onOpenFolder(folder.parentPath!)}>
                  <CornerLeftUp size={14} />
                  Subir
                </button>
              ) : null}
              {folder.folders.map((sub, i) => (
                <motion.button
                  key={sub.path}
                  type="button"
                  className="subfolder-chip"
                  onClick={() => props.onOpenFolder(sub.path)}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0, transition: { duration: 0.24, ease, delay: Math.min(i, 14) * 0.02 } }}
                >
                  <Rows3 size={14} />
                  {sub.name}
                </motion.button>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}

function crumbLabel(crumb: { name: string; path: string }) {
  return crumb.name === "/" || crumb.name === "\\" ? "Equipo" : crumb.name;
}

function Breadcrumbs({ folder, onOpen }: { folder: FolderListing; onOpen: (path: string) => void }) {
  const crumbs = folder.breadcrumbs;
  const visible = crumbs.length > 4 ? [crumbs[0], null, ...crumbs.slice(-3)] : crumbs;
  return (
    <nav className="breadcrumbs" aria-label="Ruta">
      {visible.map((crumb, i) =>
        crumb === null ? (
          <span key="ellipsis" className="crumb-ellipsis">
            …<ChevronRight size={14} />
          </span>
        ) : (
          <span key={crumb.path} className="crumb">
            {i > 0 ? <ChevronRight size={14} className="crumb-sep" /> : null}
            {i === visible.length - 1 ? (
              <h1>{crumbLabel(crumb)}</h1>
            ) : (
              <button type="button" onClick={() => onOpen(crumb.path)}>
                {crumbLabel(crumb)}
              </button>
            )}
          </span>
        )
      )}
    </nav>
  );
}

function AnimatedCount({ value }: { value: number }) {
  return (
    <span className="kind-count">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2, ease }}
        >
          {formatCount(value)}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function describeSummary(summary: CatalogSummary | null, fallback = "Leyendo…") {
  if (!summary) return fallback;
  return `${formatCount(summary.totalCount)} ${summary.totalCount === 1 ? "archivo" : "archivos"} · ${formatBytes(summary.totalBytes)}`;
}
