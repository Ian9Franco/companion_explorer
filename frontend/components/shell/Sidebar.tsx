"use client";

import { FormEvent, ReactNode, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  FolderOpen,
  FolderSearch,
  History,
  LayoutGrid,
  Library,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  RefreshCw,
  Trash2
} from "lucide-react";
import { Brand, CollectionInfo, LibraryInfo, View, brandLogoUrl, thumbUrl } from "../../lib/api";
import { formatBytes, formatCount, lastSegment } from "../../lib/format";
import { ease, spring } from "../../lib/motion";
import { MenuItem, Popover } from "../ui/Popover";

type SidebarProps = {
  brand: Brand | null;
  collapsed: boolean;
  view: View;
  libraries: LibraryInfo[];
  collections: CollectionInfo[];
  recents: string[];
  onToggleCollapsed: () => void;
  onNavigate: (view: View) => void;
  onAddLibrary: () => void;
  onBrowse: () => void;
  onRescan: (library: LibraryInfo) => void;
  onRemoveLibrary: (library: LibraryInfo) => void;
  onCreateCollection: (name: string) => Promise<boolean>;
  onRenameCollection: (collection: CollectionInfo, name: string) => Promise<boolean>;
  onDeleteCollection: (collection: CollectionInfo) => void;
};

export function Sidebar(props: SidebarProps) {
  const { brand, collapsed, view, libraries, collections, recents } = props;
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const logo = brandLogoUrl(brand);
  const catalogTotal = libraries.reduce((sum, l) => sum + l.fileCount, 0);

  const isActive = (candidate: View) =>
    candidate.type === view.type &&
    (candidate.type === "all" ||
      (candidate.type === "folder" && view.type === "folder" && candidate.path === view.path) ||
      ("id" in candidate && "id" in view && candidate.id === view.id));

  return (
    <motion.aside
      className={`sidebar ${collapsed ? "is-collapsed" : ""}`}
      animate={{ width: collapsed ? 68 : 268 }}
      transition={spring}
      initial={false}
    >
      <div className="sidebar-head">
        <button type="button" className="sidebar-brand" onClick={() => props.onNavigate({ type: "all" })}>
          {logo ? <img src={logo} alt="" /> : <span className="sidebar-logo-fallback" />}
          <AnimatePresence initial={false} mode="popLayout">
            {!collapsed ? (
              <motion.span
                className="sidebar-brand-name"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0, transition: { duration: 0.2, ease, delay: 0.05 } }}
                exit={{ opacity: 0, x: -6, transition: { duration: 0.1 } }}
              >
                {brand?.productName ?? "Companion"}
              </motion.span>
            ) : null}
          </AnimatePresence>
        </button>
        <button
          type="button"
          className="icon-button sidebar-collapse"
          onClick={props.onToggleCollapsed}
          aria-label={collapsed ? "Expandir panel" : "Contraer panel"}
          title={collapsed ? "Expandir panel" : "Contraer panel"}
        >
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
      </div>

      <nav className="sidebar-scroll" aria-label="Navegación">
        <NavItem
          icon={<LayoutGrid size={17} />}
          label="Todo"
          meta={formatCount(catalogTotal)}
          active={isActive({ type: "all" })}
          collapsed={collapsed}
          onClick={() => props.onNavigate({ type: "all" })}
        />

        <Section title="Bibliotecas" collapsed={collapsed} actionLabel="Agregar biblioteca" onAction={props.onAddLibrary}>
          <AnimatePresence initial={false} mode="popLayout">
            {libraries.map((library) => (
              <motion.div key={library.id} {...listMotion}>
                <NavItem
                  icon={<LibraryIcon library={library} />}
                  label={library.name}
                  title={library.path}
                  meta={<LibraryMeta library={library} />}
                  progress={library.status === "scanning" || library.status === "queued"}
                  active={isActive({ type: "library", id: library.id })}
                  collapsed={collapsed}
                  onClick={() => props.onNavigate({ type: "library", id: library.id })}
                  menu={(close) => (
                    <>
                      <MenuItem
                        icon={<RefreshCw size={15} />}
                        label="Volver a escanear"
                        disabled={library.status === "scanning" || library.status === "queued"}
                        onSelect={() => {
                          close();
                          props.onRescan(library);
                        }}
                      />
                      <MenuItem
                        icon={<FolderSearch size={15} />}
                        label="Explorar la carpeta"
                        onSelect={() => {
                          close();
                          props.onNavigate({ type: "folder", path: library.path });
                        }}
                      />
                      <MenuItem
                        icon={<Trash2 size={15} />}
                        label="Quitar del catálogo"
                        danger
                        onSelect={() => {
                          close();
                          props.onRemoveLibrary(library);
                        }}
                      />
                    </>
                  )}
                />
              </motion.div>
            ))}
          </AnimatePresence>
          {libraries.length === 0 && !collapsed ? (
            <button type="button" className="sidebar-empty" onClick={props.onAddLibrary}>
              Agregá una carpeta para catalogarla
            </button>
          ) : null}
        </Section>

        <Section
          title="Colecciones"
          collapsed={collapsed}
          actionLabel="Nueva colección"
          onAction={() => setCreating(true)}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {creating && !collapsed ? (
              <motion.div key="create" {...listMotion}>
                <InlineName
                  placeholder="Nombre de la colección"
                  onCancel={() => setCreating(false)}
                  onSubmit={async (name) => {
                    if (await props.onCreateCollection(name)) setCreating(false);
                  }}
                />
              </motion.div>
            ) : null}
            {collections.map((collection) =>
              renamingId === collection.id && !collapsed ? (
                <motion.div key={`rename-${collection.id}`} {...listMotion}>
                  <InlineName
                    initial={collection.name}
                    placeholder="Nuevo nombre"
                    onCancel={() => setRenamingId(null)}
                    onSubmit={async (name) => {
                      if (await props.onRenameCollection(collection, name)) setRenamingId(null);
                    }}
                  />
                </motion.div>
              ) : (
                <motion.div key={collection.id} {...listMotion}>
                  <NavItem
                    icon={<CollectionCover collection={collection} />}
                    label={collection.name}
                    meta={formatCount(collection.itemCount)}
                    active={isActive({ type: "collection", id: collection.id })}
                    collapsed={collapsed}
                    onClick={() => props.onNavigate({ type: "collection", id: collection.id })}
                    menu={(close) => (
                      <>
                        <MenuItem
                          icon={<Pencil size={15} />}
                          label="Renombrar"
                          onSelect={() => {
                            close();
                            setRenamingId(collection.id);
                          }}
                        />
                        <MenuItem
                          icon={<Trash2 size={15} />}
                          label="Eliminar colección"
                          danger
                          onSelect={() => {
                            close();
                            props.onDeleteCollection(collection);
                          }}
                        />
                      </>
                    )}
                  />
                </motion.div>
              )
            )}
          </AnimatePresence>
          {collections.length === 0 && !creating && !collapsed ? (
            <button type="button" className="sidebar-empty" onClick={() => setCreating(true)}>
              Agrupá archivos sin moverlos de su carpeta
            </button>
          ) : null}
        </Section>

        <Section title="Explorar" collapsed={collapsed}>
          <NavItem
            icon={<FolderOpen size={17} />}
            label="Abrir carpeta…"
            active={false}
            collapsed={collapsed}
            onClick={props.onBrowse}
          />
          <AnimatePresence initial={false} mode="popLayout">
            {recents.slice(0, 5).map((path) => (
              <motion.div key={path} {...listMotion}>
                <NavItem
                  icon={<History size={16} />}
                  label={lastSegment(path)}
                  title={path}
                  active={isActive({ type: "folder", path })}
                  collapsed={collapsed}
                  onClick={() => props.onNavigate({ type: "folder", path })}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </Section>
      </nav>
    </motion.aside>
  );
}

const listMotion = {
  layout: "position" as const,
  initial: { opacity: 0, x: -10 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.26, ease } },
  exit: { opacity: 0, x: -10, transition: { duration: 0.16, ease } },
  transition: spring
};

function Section({
  title,
  collapsed,
  actionLabel,
  onAction,
  children
}: {
  title: string;
  collapsed: boolean;
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="sidebar-section">
      <div className="sidebar-section-head">
        {collapsed ? <span className="sidebar-divider" /> : <span>{title}</span>}
        {onAction && !collapsed ? (
          <button type="button" className="icon-button is-small" onClick={onAction} aria-label={actionLabel} title={actionLabel}>
            <Plus size={15} />
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

type NavItemProps = {
  icon: ReactNode;
  label: string;
  title?: string;
  meta?: ReactNode;
  active: boolean;
  collapsed: boolean;
  progress?: boolean;
  onClick: () => void;
  menu?: (close: () => void) => ReactNode;
};

function NavItem({ icon, label, title, meta, active, collapsed, progress, onClick, menu }: NavItemProps) {
  return (
    <div className={`nav-item ${active ? "is-active" : ""} ${progress ? "is-progress" : ""}`}>
      {active ? <motion.span layoutId="nav-active" className="nav-active-pill" transition={spring} /> : null}
      <button type="button" className="nav-main" onClick={onClick} title={collapsed ? label : title && title !== label ? title : undefined}>
        <span className="nav-icon">{icon}</span>
        {!collapsed ? (
          <>
            <span className="nav-label">{label}</span>
            {meta !== undefined ? <span className="nav-meta">{meta}</span> : null}
          </>
        ) : null}
      </button>
      {menu && !collapsed ? (
        <Popover
          className="nav-menu"
          trigger={({ open, toggle }) => (
            <button
              type="button"
              className={`icon-button is-small nav-more ${open ? "is-active" : ""}`}
              onClick={toggle}
              aria-label={`Opciones de ${label}`}
            >
              <MoreHorizontal size={15} />
            </button>
          )}
        >
          {menu}
        </Popover>
      ) : null}
      {progress ? <span className="nav-progress" /> : null}
    </div>
  );
}

function LibraryIcon({ library }: { library: LibraryInfo }) {
  if (library.status === "missing" || library.status === "error") return <AlertTriangle size={16} className="is-warning" />;
  if (library.status === "scanning" || library.status === "queued") return <RefreshCw size={16} className="spin" />;
  return <Library size={17} />;
}

function LibraryMeta({ library }: { library: LibraryInfo }) {
  if (library.status === "scanning") return <span className="is-accent">{formatCount(library.scannedCount)}</span>;
  if (library.status === "queued") return <span>En cola</span>;
  if (library.status === "missing") return <span className="is-warning">No está</span>;
  if (library.status === "error") return <span className="is-warning">Error</span>;
  return <span title={formatBytes(library.totalBytes)}>{formatCount(library.fileCount)}</span>;
}

function CollectionCover({ collection }: { collection: CollectionInfo }) {
  const [failed, setFailed] = useState(false);
  if (!collection.coverPath || failed) return <span className="nav-cover is-empty" />;
  return (
    <img
      className="nav-cover"
      src={thumbUrl(collection.coverPath, 96)}
      alt=""
      draggable={false}
      onLoad={(e) => {
        if (e.currentTarget.naturalWidth === 0) setFailed(true);
      }}
      onError={() => setFailed(true)}
    />
  );
}

function InlineName({
  initial = "",
  placeholder,
  onSubmit,
  onCancel
}: {
  initial?: string;
  placeholder: string;
  onSubmit: (name: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const name = value.trim();
    if (!name || busy) return;
    setBusy(true);
    await onSubmit(name);
    setBusy(false);
  };

  return (
    <form className="inline-name" onSubmit={submit}>
      <input
        autoFocus
        value={value}
        maxLength={80}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onCancel();
          }
        }}
        onBlur={() => !value.trim() && onCancel()}
      />
    </form>
  );
}
