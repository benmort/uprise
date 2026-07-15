"use client";

import { useCallback, useEffect, useState } from "react";

export type GpsFix = { lat: number; lng: number; accuracy: number };

/**
 * One-shot GPS capture (NOT a continuous watch — battery). Call capture() when you
 * need a fix (e.g. the volunteer opens a door); it resolves null on denial/timeout so
 * a knock can still be recorded without coordinates. Pass `{ auto: true }` to acquire
 * once on mount — used by My turf so the volunteer's position is ready as soon as they
 * land, without waiting for a door.
 */
export function useGeolocation(opts: { auto?: boolean } = {}) {
  const { auto = false } = opts;
  const [fix, setFix] = useState<GpsFix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const capture = useCallback(async (): Promise<GpsFix | null> => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Geolocation unavailable");
      return null;
    }
    setLocating(true);
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const next = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          };
          setFix(next);
          setError(null);
          setLocating(false);
          resolve(next);
        },
        (err) => {
          setError(err.message);
          setLocating(false);
          resolve(null); // degrade gracefully — record the knock without GPS
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
      );
    });
  }, []);

  // Auto-acquire once on mount. Best-effort: a denial leaves `fix` null (features that
  // need it degrade) and we never re-prompt in a loop — the volunteer can retry manually.
  useEffect(() => {
    if (auto) void capture();
  }, [auto, capture]);

  return { fix, error, locating, capture };
}
