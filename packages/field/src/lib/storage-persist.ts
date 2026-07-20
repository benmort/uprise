// Ask the browser to mark this origin's storage as persistent, so the OS won't evict the
// offline map pack (Cache Storage) or the door-knock outbox (IndexedDB) under storage
// pressure mid-shift. Best-effort and idempotent: if already persisted, or the API is
// unavailable (older Safari, SSR), it does nothing. Chromium/Firefox decide the grant from
// site engagement / notification permission — a denial just leaves storage best-effort.

export type PersistResult = "already" | "granted" | "denied" | "unsupported";

export async function requestPersistentStorage(): Promise<PersistResult> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return "unsupported";
  try {
    if (await navigator.storage.persisted?.()) return "already";
    return (await navigator.storage.persist()) ? "granted" : "denied";
  } catch {
    // A thrown query (e.g. a locked-down WebView) is treated as unavailable, never fatal.
    return "unsupported";
  }
}
