"use client";

/**
 * One-time recovery for browsers stuck behind a service worker that cached a
 * navigation document.
 *
 * next-pwa's dynamicStartUrl registered a NetworkFirst "/" route whose
 * cacheWillUpdate rewrote the app root's cross-origin auth redirect (our
 * middleware's 307 → auth app) into a cached 200 in the "start-url" cache, then
 * replayed it forever ("from service worker") – an inescapable SSO loop. The
 * hand-written "canvass-api" route had the same hole from the other side: it
 * tested the bare pathname, so both a navigation to /canvass/<id>/turf and the
 * RSC payload a client-side navigation to it fetches landed in that cache as
 * well. Both are closed in next.config.mjs (a NetworkOnly route claims
 * navigations, documents and RSC payloads before any caching route sees them,
 * and canvass-api now requires an /api/vN/ path), but a client that already
 * registered the old sw.js won't evict the poisoned caches on its own.
 *
 * The eviction therefore runs on module evaluation rather than on mount: if the
 * worker replays a cached redirect the app may never hydrate, and a recovery
 * gated on the broken app rendering is gated on the very thing it repairs. The
 * one-shot flag is written only once the eviction has completed, so a run cut
 * short by that redirect leaves nothing behind and simply retries on the next
 * load. Bump SW_CLEANUP_FLAG if a future SW change needs another forced pass.
 */
const SW_CLEANUP_FLAG = "uprise.sw-cleanup.v2";

// Caches that can hold a page response, and so a replayable redirect: next-pwa's
// own start-url/others routes plus "canvass-api", whose old matcher accepted both
// the document navigations and the RSC payloads for /canvass/* and /engagement/*.
// Dropping canvass-api costs admin one cold read – the offline app is apps/field.
const POISONED_CACHES = new Set(["start-url", "others", "canvass-api"]);

// Set while the page is being torn down, so a late-finishing eviction never
// calls reload() into a navigation that is already under way.
let unloading = false;

/** null when storage is unavailable, so the one-shot flag cannot be read. */
function hasRun(): boolean | null {
  try {
    return window.localStorage.getItem(SW_CLEANUP_FLAG) !== null;
  } catch {
    return null;
  }
}

async function evictPoisonedWorker(): Promise<void> {
  const ran = hasRun();
  if (ran === true) return;
  // No readable storage (private mode, blocked cookies/site data, an embedded
  // webview) means no durable "already done" marker, so this could never be
  // one-shot: it would unregister the worker on every single load, permanently
  // disabling the PWA for those clients and putting us one edit away from a
  // reload loop. A recovery that can't bound itself doesn't run.
  if (ran === null) return;

  let evicted = false;

  // Unregister first so that whatever else fails below, the registration is
  // already gone and the next load starts uncontrolled. It is not a guard
  // against a refill: unregister() only removes the registration, it does not
  // stop the active worker, which keeps controlling this page (and can still
  // populate a cache we just deleted) until the page goes away. The reload at
  // the end is what actually lands on an uncontrolled page.
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
      /* best effort – a blocked Cache API shouldn't break the page */
    }
  }

  try {
    window.localStorage.setItem(SW_CLEANUP_FLAG, "1");
  } catch {
    return; // couldn't persist the flag → don't reload (would loop)
  }
  // Only reload when we actually evicted a stale worker/cache; a fresh client
  // with nothing to clean shouldn't bounce.
  if (evicted && !unloading) window.location.reload();
}

if (typeof window !== "undefined") {
  window.addEventListener(
    "pagehide",
    () => {
      unloading = true;
    },
    { once: true },
  );
  void evictPoisonedWorker();
}

export function ServiceWorkerCleanup() {
  // Deliberately renders nothing and runs no effect: the eviction above fires as
  // soon as this module is evaluated, which is the earliest point a poisoned
  // client reaches our code. The component stays as the layout's mount point.
  return null;
}
