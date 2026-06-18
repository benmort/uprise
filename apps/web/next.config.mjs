import withPWAInit from "next-pwa";

// PWA is off in dev by default (the SW caches the dev bundle and fights HMR).
// Set ENABLE_PWA=true in .env.local to exercise the offline canvasser app locally.
const pwaDisabled = process.env.NODE_ENV === "development" && process.env.ENABLE_PWA !== "true";

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: pwaDisabled,
  // Offline support for the canvasser PWA. Door-knock mutations are NEVER cached
  // here — they go through the app-level sync queue (lib/canvass/sync-queue.ts).
  runtimeCaching: [
    {
      // Mapbox tiles, styles, glyphs, sprites — the offline tile pack.
      urlPattern: /^https:\/\/(api|[abcd]\.tiles)\.mapbox\.com\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "mapbox",
        expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 14 },
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
};

export default withPWA(nextConfig);
