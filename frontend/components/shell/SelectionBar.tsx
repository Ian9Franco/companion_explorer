"use client";

import { AnimatePresence, motion } from "motion/react";
import { BookmarkMinus, BookmarkPlus, Copy, X } from "lucide-react";
import { formatCount } from "../../lib/format";
import { ease, spring } from "../../lib/motion";

type SelectionBarProps = {
  count: number;
  inCollection: boolean;
  onAddToCollection: () => void;
  onRemoveFromCollection: () => void;
  onCopyPaths: () => void;
  onClear: () => void;
};

/** Render inside `<AnimatePresence>`; it slides up from the bottom edge. */
export function SelectionBar({
  count,
  inCollection,
  onAddToCollection,
  onRemoveFromCollection,
  onCopyPaths,
  onClear
}: SelectionBarProps) {
  return (
    <motion.div
      className="selection-bar"
      role="toolbar"
      aria-label="Selección"
      initial={{ opacity: 0, y: 40, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: spring }}
      exit={{ opacity: 0, y: 30, scale: 0.97, transition: { duration: 0.18, ease } }}
    >
      <button type="button" className="icon-button" onClick={onClear} aria-label="Limpiar selección (Esc)">
        <X size={17} />
      </button>
      <span className="selection-count">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.strong
            key={count}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease }}
          >
            {formatCount(count)}
          </motion.strong>
        </AnimatePresence>
        {count === 1 ? "seleccionado" : "seleccionados"}
      </span>
      <span className="selection-divider" />
      <button type="button" className="chip" onClick={onAddToCollection}>
        <BookmarkPlus size={15} />
        Agregar a colección
      </button>
      {inCollection ? (
        <button type="button" className="chip" onClick={onRemoveFromCollection}>
          <BookmarkMinus size={15} />
          Quitar de la colección
        </button>
      ) : null}
      <button type="button" className="chip" onClick={onCopyPaths}>
        <Copy size={15} />
        Copiar rutas
      </button>
    </motion.div>
  );
}
