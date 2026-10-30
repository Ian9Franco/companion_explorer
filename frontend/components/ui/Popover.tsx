"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ease } from "../../lib/motion";

type PopoverProps = {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "start" | "end";
  className?: string;
};

export function Popover({ trigger, children, align = "end", className }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`popover-root ${open ? "is-open" : ""}`}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      <AnimatePresence>
        {open ? (
          <motion.div
            className={`popover-panel align-${align} ${className ?? ""}`}
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.18, ease } }}
            exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.12, ease } }}
          >
            {children(() => setOpen(false))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

type MenuItemProps = {
  icon?: ReactNode;
  label: ReactNode;
  hint?: ReactNode;
  danger?: boolean;
  active?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

export function MenuItem({ icon, label, hint, danger, active, disabled, onSelect }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`menu-item ${danger ? "is-danger" : ""} ${active ? "is-active" : ""}`}
      disabled={disabled}
      onClick={onSelect}
    >
      {icon ? <span className="menu-icon">{icon}</span> : null}
      <span className="menu-label">{label}</span>
      {hint ? <span className="menu-hint">{hint}</span> : null}
    </button>
  );
}
