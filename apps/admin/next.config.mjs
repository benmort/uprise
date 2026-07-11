import withPWAInit from "next-pwa";

// PWA is off in dev by default (the SW caches the dev bundle and fights HMR).
// Set ENABLE_PWA=true in .env.local to exercise the offline volunteer app locally.
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
  // Validation builds set NEXT_DIST_DIR (e.g. .next-validate) so `next build`
  // never clobbers the `.next` a running `next dev` is serving from.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  // @uprise/ui ships TS/TSX source (the shared design system); api-client/contracts
  // ship built dist but are listed so Next resolves the workspace packages (meld doc 14).
  transpilePackages: ["@uprise/ui", "@uprise/api-client", "@uprise/contracts", "@uprise/flags", "@uprise/field"],
  // The prog sandbox became /future/* (with /inbox and /journeys parked under it).
  // Keep old bookmarks/deep links working.
  async redirects() {
    return [
      { source: "/prog/:path*", destination: "/future/:path*", permanent: false },
      { source: "/journeys", destination: "/future/journeys", permanent: false },
      { source: "/journeys/:path*", destination: "/future/journeys/:path*", permanent: false },
      // The geo explorers + datasets + file manager moved under /data.
      { source: "/canvass/divisions", destination: "/data/divisions", permanent: false },
      { source: "/canvass/divisions/:path*", destination: "/data/divisions/:path*", permanent: false },
      { source: "/canvass/states", destination: "/data/states", permanent: false },
      { source: "/canvass/areas", destination: "/data/areas", permanent: false },
      { source: "/canvass/areas/:path*", destination: "/data/areas/:path*", permanent: false },
      { source: "/canvass/addresses", destination: "/data/addresses", permanent: false },
      { source: "/settings/data", destination: "/data/datasets", permanent: false },
      { source: "/future/file-manager", destination: "/data/file-manager", permanent: false },
      // The engagement library became the Content section (routes /content/*).
      { source: "/engagement", destination: "/content", permanent: false },
      { source: "/engagement/:path*", destination: "/content/:path*", permanent: false },
      // The super-admin views consolidated under /super/* (tenants, plans, flags, queues).
      { source: "/future/tenants", destination: "/super/tenants", permanent: false },
      { source: "/future/tenants/:path*", destination: "/super/tenants/:path*", permanent: false },
      { source: "/settings/plans", destination: "/super/plans", permanent: false },
      { source: "/settings/flags", destination: "/super/flags", permanent: false },
      { source: "/settings/queues", destination: "/super/queues", permanent: false },
    ];
  },
};

export default withPWA(nextConfig);
