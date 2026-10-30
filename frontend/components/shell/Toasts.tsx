"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { ease, spring } from "../../lib/motion";

export type Toast = {
  id: number;
  tone: "success" | "error" | "info";
  message: string;
  action?: { label: string; run: () => void };
};

export type ShowToast = (toast: Omit<Toast, "id">) => void;

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const show = useCallback<ShowToast>((toast) => {
    const id = nextId.current++;
    setToasts((list) => [...list.slice(-3), { ...toast, id }]);
  }, []);

  return { toasts, show, dismiss };
}

export function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toast-stack" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => onDismiss(toast.id), toast.tone === "error" ? 6500 : 4200);
    return () => window.clearTimeout(timer);
  }, [onDismiss, paused, toast.id, toast.tone]);

  const Icon = toast.tone === "error" ? AlertCircle : CheckCircle2;

  return (
    <motion.div
      layout
      className={`toast is-${toast.tone}`}
      role={toast.tone === "error" ? "alert" : "status"}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      initial={{ opacity: 0, y: 18, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: spring }}
      exit={{ opacity: 0, x: -24, scale: 0.96, transition: { duration: 0.2, ease } }}
      transition={spring}
    >
      <Icon size={17} className="toast-icon" />
      <span className="toast-message">{toast.message}</span>
      {toast.action ? (
        <button
          type="button"
          className="text-button"
          onClick={() => {
            toast.action?.run();
            onDismiss(toast.id);
          }}
        >
          {toast.action.label}
        </button>
      ) : null}
      <button type="button" className="icon-button is-small" onClick={() => onDismiss(toast.id)} aria-label="Cerrar aviso">
        <X size={14} />
      </button>
    </motion.div>
  );
}
