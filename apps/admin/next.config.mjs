import withPWAInit from "next-pwa";

// PWA is off in dev by default (the SW caches the dev bundle and fights HMR).
// Set ENABLE_PWA=true in .env.local to exercise the offline volunteer app locally.
const pwaDisabled = process.env.NODE_ENV === "development" && process.env.ENABLE_PWA !== "true";

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: pwaDisabled,
  // Offline support for the volunteer PWA. Door-knock mutations are NEVER cached
  // here — they go through the app-level sync queue (lib/canvass/sync-queue.ts).
  runtimeCaching: [
    {
      // Mapbox tiles, styles, glyphs, sprites — the offline tile pack.
      urlPattern: /^https:\/\/(api|[abcd]\.tiles)\.mapbox\.com\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "mapbox",
        // Headroom for a full per-region pre-download (lib/canvass/map-cache.ts):
        // a turf at z13–16 can be several thousand vector tiles + glyphs/sprite.
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
  // @yarns/ui ships TS/TSX source (the shared design system); api-client/contracts
  // ship built dist but are listed so Next resolves the workspace packages (meld doc 14).
  transpilePackages: ["@yarns/ui", "@yarns/api-client", "@yarns/contracts", "@yarns/flags"],
};

export default withPWA(nextConfig);
