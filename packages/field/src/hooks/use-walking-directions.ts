"use client";

import { useEffect, useState } from "react";
import {
  fetchWalkingDirections,
  coordKey,
  type LatLng,
  type WalkingDirections,
} from "../lib/directions";
import { useOnlineStatus } from "./use-online-status";

/**
 * Walking turn-by-turn directions from `from` to `to` (Mapbox Directions API,
 * walking profile). Network-only — returns null when offline or disabled so the
 * Walk view falls back to pins + the address. Refetches only when either endpoint
 * moves enough to change its ~1m-rounded key (avoids GPS-jitter churn).
 */
export function useWalkingDirections(
  from: LatLng | null | undefined,
  to: LatLng | null | undefined,
  enabled = true,
  opts: { minMoveM?: number } = {},
): { directions: WalkingDirections | null; loading: boolean; online: boolean } {
  const online = useOnlineStatus();
  const [directions, setDirections] = useState<WalkingDirections | null>(null);
  const [loading, setLoading] = useState(false);
  // With `minMoveM` (street mode's continuous fixes) the origin is quantised to that grid
  // so a walking canvasser refetches every ~25m, not every metre of GPS drift.
  const { minMoveM = 0 } = opts;
  const originKey = (p: LatLng): string => {
    if (minMoveM <= 0) return coordKey(p);
    const step = minMoveM / 111_320; // ≈ degrees per metre of latitude
    return `${(Math.round(p.lat / step) * step).toFixed(6)},${(Math.round(p.lng / step) * step).toFixed(6)}`;
  };
  const key = from && to ? `${originKey(from)}>${coordKey(to)}` : null;

  useEffect(() => {
    if (!enabled || !online || !from || !to) {
      setDirections(null);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    void fetchWalkingDirections(from, to, ctrl.signal).then((d) => {
      if (ctrl.signal.aborted) return;
      setDirections(d);
      setLoading(false);
    });
    return () => ctrl.abort();
    // `key` encodes from+to; from/to objects are intentionally not deps (jitter).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, online]);

  return { directions, loading, online };
}
