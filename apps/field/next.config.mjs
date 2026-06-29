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
        expiration: { maxEntries: 8000, maxAgeSeconds: 60 * 60 * 24 * 14 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      // API GETs (assignments, dispositions) — last-good fallback when offline.
      urlPattern: ({ url, request }) =>
        request.method === "GET" && /\/(canvass|engagement)\//.test(url.pathname),
      handler: "NetworkFirst",
      options: {
        cacheName: "canvass-api",
        networkTimeoutSeconds: 5,
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
      },
    },
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
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
