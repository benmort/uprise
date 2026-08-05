/**
 * Ship a client-side failure to the API so it lands in ops.ErrorLog.
 *
 * Vercel retains no runtime logs on this account, so an error that isn't recorded is
 * gone the moment it happens – a user reporting "the invite link did nothing" leaves
 * nothing behind to read. This is what makes that report diagnosable, and this app is
 * where a failure costs the most: a throw here means the user never gets a session.
 *
 * Deliberately dependency-free (raw fetch, base resolved inline, no @uprise/api-client
 * and no design-system imports): global-error.tsx runs when the ROOT LAYOUT itself
 * failed, so anything this module pulls in is a module that might be the reason we're
 * here. Keep it importing nothing.
 */

type Source = "admin" | "auth" | "field" | "action" | "marketing";

/**
 * Wider than `Error` on purpose. A rejected promise's `reason` is frequently not an
 * Error at all, and fabricating one just to satisfy a type would attach a stack that
 * points at this file rather than the throw site – actively misleading in ops.
 */
type ReportableError = {
  message?: unknown;
  name?: unknown;
  stack?: unknown;
  digest?: unknown;
};

/**
 * Resolve the API base without importing `getApiUrl()` from @uprise/api-client.
 *
 * The judgement (the divergence is real, the coupling is worse): global-error.tsx is
 * rendered precisely when the root layout failed to evaluate, so every import this
 * module carries is a module that could itself be the fault being reported. Importing
 * the api-client to report an api-client failure is the one dependency that can turn a
 * recorded error into a silent one. So the precedence of `getApiUrl()` is duplicated
 * here verbatim instead – the runtime `window.__API_URL__` the root layout injects
 * wins, then the build-time env – which closes the divergence that mattered (the two
 * disagreeing) at the cost of four lines that must stay in step with
 * packages/api-client/src/index.ts.
 *
 * Two deliberate differences. No localhost fallback: `getApiUrl()` defaults to
 * http://localhost:3001 so a dev app boots, but a report posted to localhost from a
 * production browser just fails, so an unset base no-ops instead. And the runtime
 * value is read off `globalThis` rather than `window` – in a browser they are the same
 * object, and it keeps this helper total, so nothing here depends on being called after
 * the SSR guard.
 */
function apiBase(): string | undefined {
  const runtime = (globalThis as { __API_URL__?: string }).__API_URL__;
  if (runtime) return runtime;
  return process.env.NEXT_PUBLIC_API_URL || undefined;
}

export function reportClientError(
  source: Source,
  error: ReportableError | null | undefined,
  extra?: { path?: string },
): void {
  // Error boundaries are also rendered during SSR, where there is nothing to report
  // from and no fetch target – the server-side throw is captured by the API's own
  // filter or by the platform.
  if (typeof window === "undefined") return;

  try {
    const base = apiBase();
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
      // or half-booted app still record, just without a tenant/user – which is the
      // normal case here, since most of this app runs before a session exists.
      credentials: "include",
    }).catch(() => undefined);
  } catch {
    // Reporting an error must never itself throw – that would replace a useful
    // fallback screen with a blank one.
  }
}

/**
 * A single fault can re-fire every animation frame (a render loop, a retrying poller).
 * Without a bound, one broken screen turns into a sustained POST flood at ops.ErrorLog
 * from every affected browser at once. Dedupe on a signature first, then hard-cap what
 * a single page load may ever send.
 */
const MAX_GLOBAL_REPORTS = 10;
const reportedSignatures = new Set<string>();
let listenerSource: Source = "auth";

function signatureOf(error: ReportableError): string {
  const stack = typeof error.stack === "string" ? error.stack : "";
  // Name + message + the top frames: enough to tell two different throw sites apart,
  // coarse enough that the same throw re-firing reads as the same error.
  return [error.name, error.message, stack.split("\n").slice(0, 3).join("|")].join("::");
}

/** Never throws: it runs inside a window listener, where a throw would re-enter here. */
function reportOnce(error: ReportableError): void {
  try {
    if (reportedSignatures.size >= MAX_GLOBAL_REPORTS) return;
    const signature = signatureOf(error);
    if (reportedSignatures.has(signature)) return;
    reportedSignatures.add(signature);
    reportClientError(listenerSource, error);
  } catch {
    // Nothing to fall back to, and no screen to protect – drop it.
  }
}

/** Stringify a rejection reason that isn't an Error, without ever throwing. */
function describe(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? Object.prototype.toString.call(value);
  } catch {
    // Circular, or a getter that throws.
    return Object.prototype.toString.call(value);
  }
}

/**
 * The ops.ErrorLog intake takes a closed field set (source/message/name/stack/path/
 * digest), so how a report reached us has to ride on one of them. `name` is the
 * low-information field, so the origin tag goes there and `message` stays pristine –
 * grouping by message still works across boundary and listener reports.
 */
function normalise(value: unknown, tag: string): ReportableError {
  return value instanceof Error
    ? { name: `${value.name} (${tag})`, message: value.message, stack: value.stack }
    : { name: tag, message: describe(value) };
}

function onUnhandledRejection(event: Event): void {
  reportOnce(normalise((event as PromiseRejectionEvent).reason, "unhandledrejection"));
}

function onWindowError(event: Event): void {
  const errorEvent = event as ErrorEvent;
  // `error` also fires for failed resource loads (<img>, <script>), where the target is
  // the element rather than the window and there is no exception at all. Those are
  // noise – a blocked analytics script would otherwise burn the whole report budget.
  if (errorEvent.target && errorEvent.target !== window) return;
  reportOnce(normalise(errorEvent.error ?? errorEvent.message, "uncaught"));
}

/**
 * Record the failures the React error boundaries structurally cannot see.
 *
 * A boundary only catches a throw during render/lifecycle. It never sees a throw from
 * an event handler or an async callback, and it never sees an unhandled promise
 * rejection – which is exactly where both invite-accept incidents lived (an async
 * submit handler that made no network call and left no trace). Without these two
 * listeners, error.tsx and global-error.tsx record nothing for the failure mode that
 * actually happens.
 *
 * Returns a teardown. Safe to call more than once: the handlers are module-level, and
 * addEventListener ignores a repeat registration of the same reference and type, so a
 * React StrictMode double-mount cannot double-report.
 */
export function installGlobalErrorReporting(source: Source): () => void {
  if (typeof window === "undefined") return () => undefined;
  listenerSource = source;
  // A fresh install is a fresh page lifecycle, so it gets a fresh report budget.
  reportedSignatures.clear();
  window.addEventListener("unhandledrejection", onUnhandledRejection);
  window.addEventListener("error", onWindowError);
  return () => {
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
    window.removeEventListener("error", onWindowError);
  };
}
