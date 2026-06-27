"use client";

import { useCallback, useState } from "react";

export type GpsFix = { lat: number; lng: number; accuracy: number };

/**
 * One-shot GPS capture for door entry (NOT a continuous watch — battery). Call
 * capture() when the volunteer opens a door; it resolves null on denial/timeout
 * so a knock can still be recorded without coordinates.
 */
export function useGeolocation() {
  const [fix, setFix] = useState<GpsFix | null>(null);
  const [error, setError] = useState<string | null>(null);

  const capture = useCallback(async (): Promise<GpsFix | null> => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Geolocation unavailable");
      return null;
    }
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
          resolve(next);
        },
        (err) => {
          setError(err.message);
          resolve(null); // degrade gracefully — record the knock without GPS
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
      );
    });
  }, []);

  return { fix, error, capture };
}
