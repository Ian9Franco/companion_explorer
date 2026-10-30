"use client";

import { ReactNode, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { X } from "lucide-react";
import { ease, spring } from "../../lib/motion";

type ModalProps = {
  title: string;
  subtitle?: ReactNode;
  className?: string;
  headerActions?: ReactNode;
  onClose: () => void;
  children: ReactNode;
};

/** Render inside `<AnimatePresence>` so it can animate out. */
export function Modal({ title, subtitle, className, headerActions, onClose, children }: ModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>("[data-autofocus]") ?? panel;
    first?.focus({ preventScroll: true });

    // Capture on window so an open viewer underneath never sees this Escape.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      previous?.focus?.({ preventScroll: true });
    };
  }, []);

  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-label={title}>
      <motion.div
        className="modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.24, ease } }}
        exit={{ opacity: 0, transition: { duration: 0.2, ease } }}
        onClick={onClose}
      />
      <motion.div
        ref={panelRef}
        tabIndex={-1}
        className={`modal-panel ${className ?? ""}`}
        initial={{ opacity: 0, scale: 0.96, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0, transition: spring }}
        exit={{ opacity: 0, scale: 0.97, y: 10, transition: { duration: 0.17, ease } }}
      >
        <header className="modal-header">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <div className="modal-header-actions">
            {headerActions}
            <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">
              <X size={18} />
            </button>
          </div>
        </header>
        {children}
      </motion.div>
    </div>
  );
}
