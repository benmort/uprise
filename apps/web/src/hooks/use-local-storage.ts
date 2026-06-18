"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Persisted useState. Reads/writes a JSON value under `key`, guarded for SSR.
 * Ported from the Slingshot admin-ui hook (sans its bespoke logger).
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((val: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === "undefined") return initialValue;
    try {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((val: T) => T)) => {
      try {
        const valueToStore = value instanceof Function ? value(storedValue) : value;
        setStoredValue(valueToStore);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
        }
      } catch {
        // Ignore quota / serialization errors — tour progress is best-effort.
      }
    },
    [key, storedValue],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const item = window.localStorage.getItem(key);
      if (item) setStoredValue(JSON.parse(item) as T);
    } catch {
      // Ignore malformed stored values.
    }
  }, [key]);

  return [storedValue, setValue];
}
