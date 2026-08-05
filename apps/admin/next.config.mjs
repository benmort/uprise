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
  // then replays forever ("from service worker") – an inescapable SSO loop. The
  // root must always hit the network so the auth redirect passes through.
  dynamicStartUrl: false,
  cacheStartUrl: false,
  // Offline support for the volunteer PWA. Door-knock mutations are NEVER cached
  // here – they go through the app-level sync queue (lib/canvass/sync-queue.ts).
  //
  // NOTE for anyone editing a urlPattern below: workbox inlines each matcher via
  // Function.prototype.toString() into the generated sw.js (workbox-build's
  // runtime-caching-converter). The functions therefore cannot close over anything
  // in this module – no shared helper, no imported constant. Duplication here is
  // deliberate.
  runtimeCaching: [
    {
      // FIRST on purpose: workbox's registerRoute tries handlers in registration
      // order, so this claims every request that can carry a page before any later
      // matcher sees it. A cached page response is the whole failure mode above –
      // a cross-origin auth redirect gets stored as a 200 and replayed into a
      // fresh, already-authed context. dynamicStartUrl/cacheStartUrl only cover
      // next-pwa's own "/" route, not hand-written matchers like canvass-api below.
      //
      // Three shapes count as "a page", not just navigations:
      //  - a real document navigation (mode "navigate" / destination "document");
      //  - an App Router RSC payload, which is how a *client-side* navigation to
      //    /canvass/* actually travels: a fetch with mode "cors", an empty
      //    destination and the `RSC: 1` header (next/dist/client/components/
      //    app-router-headers.js). It is not a navigation by any Request field;
      //  - the same payload identified by its `_rsc` cache-busting query param
      //    (NEXT_RSC_UNION_QUERY), as a second signal in case headers are dropped
      //    by an intermediary.
      // Admin has no offline story to protect – that is apps/field, which caches
      // its screen documents deliberately.
      urlPattern: ({ url, request }) =>
        request.mode === "navigate" ||
        request.destination === "document" ||
        request.headers.has("RSC") ||
        url.searchParams.has("_rsc"),
      handler: "NetworkOnly",
      // next-pwa 5.6.0 reads `c.options` off every entry when fallbacks are built
      // (index.js: `if (c.options.precacheFallback) return`). It only reaches that
      // loop when buildFallbackWorker returns a worker, which needs a pages/ or
      // src/pages/ dir with an _offline page – admin has neither today, so an
      // entry without `options` happens to be safe. Keeping the key present means
      // adding a fallback page later cannot turn this into a build crash.
      options: {},
    },
    {
      // Mapbox tiles, styles, glyphs, sprites – the offline tile pack.
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
      // API GETs (assignments, dispositions) – last-good fallback when offline.
      // Genuine API calls only. The old matcher tested the bare pathname for
      // /canvass/ or /engagement/, which also matched admin's own route paths –
      // both a document navigation to /canvass/<id>/turf and the RSC payload a
      // client-side navigation to it fetches. Both are page responses, and caching
      // them is the start-url bug wearing a different cache name.
      //
      // The API base is NEXT_PUBLIC_API_URL (…/api/v1), so a real call lands on
      // /api/v1/canvass/… while an admin route never carries an /api/vN/ segment.
      // The mode/destination/RSC guards stay as defence in depth: the NetworkOnly
      // route above already claims those, and a matcher this route is not allowed
      // to reach should still say no on its own.
      urlPattern: ({ url, request }) =>
        request.method === "GET" &&
        request.mode !== "navigate" &&
        request.destination !== "document" &&
        !request.headers.has("RSC") &&
        !url.searchParams.has("_rsc") &&
        /\/api\/v\d+\/(canvass|engagement)\//.test(url.pathname),
      handler: "NetworkFirst",
      options: {
        cacheName: "canvass-api",
        networkTimeoutSeconds: 5,
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
        // NetworkFirst's default plugin stores opaque (status 0) responses too,
        // which is how an opaqueredirect becomes a cached "200". Our API GETs are
        // CORS requests that answer 200, so restricting to 200 loses nothing.
        cacheableResponse: { statuses: [200] },
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
  experimental: {
    // Rewrite workspace-barrel imports to direct file imports at compile time –
    // without this, one symbol from a barrel drags the whole package into every
    // chunk under transpilePackages (see apps/field/next.config.mjs for the numbers).
    optimizePackageImports: ["@uprise/field", "@uprise/ui", "@uprise/api-client"],
  },
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
