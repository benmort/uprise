"use client";

import { useEffect } from "react";

/**
 * Recover from a ChunkLoadError by reloading once.
 *
 * An open tab keeps running the JS of the build it loaded with, which references that build's chunk
 * hashes. When the served build changes underneath it — a production deploy, or the dev server
 * recompiling a `next/dynamic` module (HMR) — lazy-loading a chunk resolves to a hash that no longer
 * exists: "Loading chunk … failed" / a request to `/_next/undefined`. The currently-served
 * HTML + build manifest are consistent, so a single reload fetches matching chunks and the error
 * clears.
 *
 * Guarded to a short window: if a chunk error recurs within {@link RELOAD_WINDOW_MS} of the last
 * auto-reload, the reload evidently didn't fix it (a genuinely broken build), so we stop and let the
 * error surface rather than loop. A later error (e.g. the next deploy) reloads again.
 */
const RELOAD_STAMP = "uprise.chunk-reload.at";
const RELOAD_WINDOW_MS = 10_000;

function looksLikeChunkError(...parts: Array<string | undefined>): boolean {
  const text = parts.filter(Boolean).join(" ");
  return (
    /ChunkLoadError/i.test(text) ||
    /Loading (CSS )?chunk [^\s]+ failed/i.test(text) ||
    /_next\/undefined/i.test(text)
  );
}

export function ChunkErrorReload() {
  useEffect(() => {
    const recover = () => {
      const now = Date.now();
      let last = 0;
      try {
        last = Number(window.sessionStorage.getItem(RELOAD_STAMP)) || 0;
      } catch {
        return; // storage blocked — don't risk an unbounded reload loop
      }
      if (now - last < RELOAD_WINDOW_MS) return; // just reloaded and still broken → stop looping
      try {
        window.sessionStorage.setItem(RELOAD_STAMP, String(now));
      } catch {
        return;
      }
      window.location.reload();
    };

    const onError = (e: ErrorEvent) => {
      const err = e.error as { name?: string; message?: string } | undefined;
      if (looksLikeChunkError(e.message, err?.name, err?.message)) recover();
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason as { name?: string; message?: string } | undefined;
      if (looksLikeChunkError(r?.name, r?.message)) recover();
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
