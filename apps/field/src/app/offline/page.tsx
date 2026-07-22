/**
 * Offline fallback document. The service worker serves this for a navigation that misses both
 * the network and the `field-shell` cache (see next.config.mjs `fallbacks.document`) — e.g. a
 * cold start on a page that was never opened online. Deliberately static and dependency-free so
 * it renders with no session, no data and no map.
 */
export const metadata = { title: "Offline — Field" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-2xl">📡</div>
      <h1 className="text-xl font-extrabold text-foreground">You&apos;re offline</h1>
      <p className="max-w-xs text-sm text-muted-foreground">
        This page hasn&apos;t been saved for offline use yet. Reconnect to load it — turf you opened
        while online (and downloaded maps for) stays available offline.
      </p>
      <a
        href="/"
        className="mt-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
      >
        Back to my turf
      </a>
    </main>
  );
}
