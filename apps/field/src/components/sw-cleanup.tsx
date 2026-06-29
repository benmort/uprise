"use client";

import { useEffect } from "react";

/**
 * One-time recovery for browsers stuck behind the old next-pwa service worker.
 *
 * next-pwa's dynamicStartUrl registered a NetworkFirst "/" route whose
 * cacheWillUpdate rewrote the app root's cross-origin auth redirect (our
 * middleware's 307 → auth app) into a cached 200 in the "start-url" cache, then
 * replayed it forever ("from service worker") — an inescapable SSO loop. We've
 * since disabled dynamicStartUrl/cacheStartUrl (see next.config.mjs), but a client
 * that already registered the poisoned SW won't evict that cache on its own.
 *
 * This runs once per version flag: drop the poisoned caches, unregister the
 * controlling worker so the fixed sw.js re-registers clean, and reload. Once the
 * flag is set it short-circuits forever, so it's a no-op on every later load.
 * Bump SW_CLEANUP_FLAG if a future SW change needs another forced eviction.
 */
const SW_CLEANUP_FLAG = "uprise.sw-cleanup.v1";

// next-pwa runtime caches that can hold a navigation redirect. The offline data
// caches (mapbox, canvass-api) are intentionally left untouched.
const POISONED_CACHES = new Set(["start-url", "others"]);

export function ServiceWorkerCleanup() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    // If storage is unavailable we can't persist the one-shot flag — skip entirely
    // rather than risk an unbounded reload loop.
    let alreadyRan = true;
    try {
      alreadyRan = window.localStorage.getItem(SW_CLEANUP_FLAG) !== null;
    } catch {
      return;
    }
    if (alreadyRan) return;

    let cancelled = false;
    void (async () => {
      let evicted = false;

      if ("caches" in window) {
        try {
          const keys = await window.caches.keys();
          await Promise.all(
            keys
              .filter((key) => POISONED_CACHES.has(key))
              .map(async (key) => {
                if (await window.caches.delete(key)) evicted = true;
              }),
          );
        } catch {
          /* best effort — a blocked Cache API shouldn't break the page */
        }
      }

      if ("serviceWorker" in navigator) {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const reg of regs) {
            if (await reg.unregister()) evicted = true;
          }
        } catch {
          /* best effort */
        }
      }

      if (cancelled) return;
      try {
        window.localStorage.setItem(SW_CLEANUP_FLAG, "1");
      } catch {
        return; // couldn't persist the flag → don't reload (would loop)
      }
      // Only reload when we actually evicted a stale worker/cache; a fresh client
      // with nothing to clean shouldn't bounce.
      if (evicted) window.location.reload();
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
