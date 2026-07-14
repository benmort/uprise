import withPWAInit from "next-pwa";

// PWA is off in dev by default (the SW caches the dev bundle and fights HMR).
// Set ENABLE_PWA=true in .env.local to exercise the offline field app locally.
const pwaDisabled = process.env.NODE_ENV === "development" && process.env.ENABLE_PWA !== "true";

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: pwaDisabled,
  // Never let the SW own the app root. next-pwa's dynamicStartUrl registers a
  // NetworkFirst "/" route whose cacheWillUpdate rewrites a cross-origin
  // opaqueredirect (our middleware's 307 → auth app) into a cached 200, which it
  // then replays forever ("from service worker") — an inescapable SSO loop. The
  // root must always hit the network so the auth redirect passes through.
  dynamicStartUrl: false,
  cacheStartUrl: false,
  // worker/index.js (web-push handlers) is bundled automatically by next-pwa.
  // Door-knock mutations are NEVER cached here — they go through the app-level
  // sync queue in @uprise/field (lib/sync-queue).
  runtimeCaching: [
    {
      // Mapbox tiles, styles, glyphs, sprites — the offline tile pack + directions.
      urlPattern: /^https:\/\/(api|[abcd]\.tiles)\.mapbox\.com\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "mapbox",
        // ignoreSearch: the pre-cache (lib/map-cache.ts) saves tiles with only
        // `?access_token=`, but mapbox-gl v3 appends a rotating `sku` session token at
        // render time. Without this, the query strings differ and the saved tiles never
        // match offline (blank map). Tile identity is fully in the path (z/x/y, style,
        // glyph range), so ignoring the query is safe.
        matchOptions: { ignoreSearch: true },
        // maxEntries must stay >= MAX_TILES in lib/map-cache.ts (a single turf can enqueue
        // that many) plus headroom for both themes' style JSON / sprite / glyphs, or the
        // ExpirationPlugin LRU-evicts the front of the pack during the same download.
        expiration: { maxEntries: 24000, maxAgeSeconds: 60 * 60 * 24 * 30 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      // API GETs (assignments, dispositions, surveys, resident contacts) — serve the cached
      // response instantly and revalidate in the background (pairs with the in-memory SWR
      // cache), instead of blocking on the live network on every read. Still a last-good store
      // offline. `/contacts/` is included so the at-the-door prior-contact context works offline.
      urlPattern: ({ url, request }) =>
        request.method === "GET" && /\/(canvass|engagement|contacts)\//.test(url.pathname),
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "canvass-api",
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
      },
    },
    {
      // Cold offline start: cache the /field navigation DOCUMENTS so reopening a killed
      // /field/[turfId] tab with no signal serves the last-good shell, boots the SPA, and
      // renders the turf from the durable IndexedDB cache (@uprise/field api-cache-store).
      // Scoped strictly to /field navigations — the root "/" MUST stay uncached (see the
      // dynamicStartUrl note above: caching "/" replays the SSO redirect forever).
      urlPattern: ({ url, request }) =>
        request.mode === "navigate" && url.pathname.startsWith("/field"),
      handler: "NetworkFirst",
      options: {
        cacheName: "field-shell",
        networkTimeoutSeconds: 3,
        expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 * 30 },
      },
    },
  ],
  // A minimal precached document for a navigation that misses both network and cache.
  fallbacks: { document: "/offline" },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Validation builds set NEXT_DIST_DIR (e.g. .next-validate) so `next build`
  // never clobbers the `.next` a running `next dev` is serving from.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  transpilePackages: [
    "@uprise/ui",
    "@uprise/api-client",
    "@uprise/contracts",
    "@uprise/flags",
    "@uprise/field",
  ],
};

export default withPWA(nextConfig);
