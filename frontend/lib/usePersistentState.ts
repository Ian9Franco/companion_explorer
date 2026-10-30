"use client";

import { useEffect, useState } from "react";

/**
 * The static export renders with the default value; the stored value is read after
 * mount so the first client render matches the exported HTML.
 */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      // Unreadable storage keeps the default.
    }
    setReady(true);
  }, [key]);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage can be full or blocked; the value still works for this session.
    }
  }, [key, value, ready]);

  return [value, setValue, ready] as const;
}
