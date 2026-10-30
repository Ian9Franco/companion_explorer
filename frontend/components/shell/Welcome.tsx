"use client";

import { motion } from "motion/react";
import { FolderOpen, History, LibraryBig, RefreshCw, ServerOff } from "lucide-react";
import { Brand, RootEntry, brandLogoUrl } from "../../lib/api";
import { lastSegment } from "../../lib/format";
import { rise, stagger } from "../../lib/motion";

type WelcomeProps = {
  brand: Brand | null;
  offline: boolean;
  roots: RootEntry[];
  recents: string[];
  onRetry: () => void;
  onAddLibrary: () => void;
  onBrowse: () => void;
  onOpenFolder: (path: string) => void;
};

export function Welcome({ brand, offline, roots, recents, onRetry, onAddLibrary, onBrowse, onOpenFolder }: WelcomeProps) {
  const logo = brandLogoUrl(brand);

  return (
    <motion.main
      className="welcome"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.4 } }}
      exit={{ opacity: 0, scale: 0.985, transition: { duration: 0.22 } }}
    >
      <div className="welcome-glow" />
      <motion.div className="welcome-hero" variants={stagger(0.07, 0.05)} initial="hidden" animate="visible" exit="exit">
        <motion.div variants={rise} className="welcome-logo">
          {logo ? <img src={logo} alt="" /> : <span className="sidebar-logo-fallback" />}
        </motion.div>
        <motion.h1 variants={rise}>{brand?.preloadTitle ?? "Companion"}</motion.h1>

        {offline ? (
          <>
            <motion.p variants={rise} className="welcome-lead">
              <ServerOff size={18} /> No llega el núcleo en <code>127.0.0.1:5080</code>.
            </motion.p>
            <motion.pre variants={rise} className="welcome-code">
              dotnet run --project src/CompanionExplorer.Api
            </motion.pre>
            <motion.button variants={rise} type="button" className="button" onClick={onRetry}>
              <RefreshCw size={15} />
              Reintentar
            </motion.button>
          </>
        ) : (
          <>
            <motion.p variants={rise} className="welcome-lead">
              {brand?.productName ?? "Companion Explorer"} cataloga tus fotos, videos y audio sin mover ni tocar un solo archivo.
            </motion.p>

            <motion.div variants={rise} className="welcome-actions">
              <motion.button type="button" className="welcome-card is-primary" onClick={onAddLibrary} whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }}>
                <LibraryBig size={24} />
                <strong>Agregar una biblioteca</strong>
                <span>Indexa la carpeta y sus subcarpetas. Filtros, colecciones y línea de tiempo al instante.</span>
              </motion.button>
              <motion.button type="button" className="welcome-card" onClick={onBrowse} whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }}>
                <FolderOpen size={24} />
                <strong>Solo explorar una carpeta</strong>
                <span>Mirala como está en disco, sin catalogarla.</span>
              </motion.button>
            </motion.div>

            {recents.length > 0 || roots.length > 0 ? (
              <motion.div variants={rise} className="welcome-places">
                {recents.slice(0, 3).map((path) => (
                  <button key={path} type="button" className="place-pill" onClick={() => onOpenFolder(path)} title={path}>
                    <History size={14} />
                    {lastSegment(path)}
                  </button>
                ))}
                {roots.slice(0, 6).map((root) => (
                  <button key={root.path} type="button" className="place-pill" onClick={() => onOpenFolder(root.path)} title={root.path}>
                    <FolderOpen size={14} />
                    {root.name}
                  </button>
                ))}
              </motion.div>
            ) : null}
          </>
        )}
      </motion.div>
    </motion.main>
  );
}
