/**
 * Ship an error boundary's throw to the API so it lands in ops.ErrorLog.
 *
 * Vercel retains no runtime logs on this account, so an error that isn't recorded is
 * gone the moment it happens – a user reporting "I got a server error" leaves nothing
 * behind to read. This is what makes that report diagnosable.
 *
 * Deliberately dependency-free (raw fetch, env read inline, no @uprise/api-client and
 * no design-system imports): global-error.tsx runs when the ROOT LAYOUT itself failed,
 * so anything this module pulls in is a module that might be the reason we're here.
 * Keep it importing nothing.
 */

type Source = "admin" | "auth" | "field" | "action" | "marketing";

export function reportClientError(
  source: Source,
  error: (Error & { digest?: string }) | null | undefined,
  extra?: { path?: string },
): void {
  // Error boundaries are also rendered during SSR, where there is nothing to report
  // from and no fetch target – the server-side throw is captured by the API's own
  // filter or by the platform.
  if (typeof window === "undefined") return;

  try {
    const base = process.env.NEXT_PUBLIC_API_URL;
    if (!base) return;

    const body = JSON.stringify({
      source,
      message: String(error?.message || "Unknown client error").slice(0, 2000),
      name: error?.name ? String(error.name).slice(0, 500) : undefined,
      stack: error?.stack ? String(error.stack).slice(0, 20000) : undefined,
      digest: error?.digest ? String(error.digest).slice(0, 500) : undefined,
      path: (extra?.path ?? window.location.pathname + window.location.search).slice(0, 500),
    });

    void fetch(`${base}/ops/client-error`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      // The user is very likely about to reload or navigate away from a broken page;
      // keepalive lets the request outlive the document.
      keepalive: true,
      // Attributes the row to the session when there is one. Errors from a signed-out
      // or half-booted app still record, just without a tenant/user.
      credentials: "include",
    }).catch(() => undefined);
  } catch {
    // Reporting an error must never itself throw – that would replace a useful
    // fallback screen with a blank one.
  }
}
