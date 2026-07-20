"use client";

import { useCallback, useEffect, useState } from "react";

export type GpsFix = { lat: number; lng: number; accuracy: number };

/** The browser's geolocation permission, normalised. "unsupported" = no geolocation API at
 *  all (SSR / locked-down desktop); "unknown" = geolocation exists but the Permissions API
 *  can't tell us (older Safari) — treat like "prompt" for gating (we don't know, so ask). */
export type GeoPermission = "granted" | "denied" | "prompt" | "unsupported" | "unknown";

/**
 * One-shot GPS capture (NOT a continuous watch — battery). Call capture() when you
 * need a fix (e.g. the volunteer opens a door); it resolves null on denial/timeout so
 * a knock can still be recorded without coordinates. Pass `{ auto: true }` to acquire
 * once on mount — used by My turf so the volunteer's position is ready as soon as they
 * land, without waiting for a door.
 *
 * `permission` tracks the live grant state (via the Permissions API, kept in sync as it
 * changes) so callers can force a decision at shift start and hard-state a denial — the
 * browser suppresses repeat prompts once blocked, so we can't just re-ask.
 */
export function useGeolocation(opts: { auto?: boolean } = {}) {
  const { auto = false } = opts;
  const [fix, setFix] = useState<GpsFix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [permission, setPermission] = useState<GeoPermission>("unknown");

  // Track the permission state and follow changes (the volunteer granting/revoking in the
  // browser UI). Best-effort — a browser without navigator.permissions stays "unknown".
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setPermission("unsupported");
      return;
    }
    if (!navigator.permissions?.query) {
      setPermission("unknown");
      return;
    }
    let status: PermissionStatus | null = null;
    const onChange = () => status && setPermission(status.state as GeoPermission);
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((s) => {
        status = s;
        setPermission(s.state as GeoPermission);
        s.addEventListener("change", onChange);
      })
      .catch(() => setPermission("unknown"));
    return () => status?.removeEventListener("change", onChange);
  }, []);

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
          setPermission("granted"); // a successful fix means the grant is live
          resolve(next);
        },
        (err) => {
          setError(err.message);
          setLocating(false);
          if (err.code === err.PERMISSION_DENIED) setPermission("denied");
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

  return { fix, error, locating, permission, capture };
}
