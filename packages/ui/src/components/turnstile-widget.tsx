"use client";

import * as React from "react";

/**
 * Cloudflare Turnstile — invisible, execute-on-submit. Render it inside a public form and
 * call `ref.execute()` in the submit handler to mint a fresh token, then send it to the API
 * (as the `cf-turnstile-response` header — see @uprise/api-client).
 *
 * Invisible by default (`appearance: interaction-only`): a real user is never challenged; only
 * a suspicious session sees an interactive challenge. When no site key is configured the widget
 * renders nothing and `execute()` resolves to null (the backend guard no-ops / fails open), so
 * local dev and unconfigured envs are never blocked.
 */

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  execute: (id: string) => void;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

function turnstile(): TurnstileApi | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { turnstile?: TurnstileApi }).turnstile ?? null;
}

function getSiteKey(): string {
  if (typeof window === "undefined") return "";
  // Injected by each app's layout from NEXT_PUBLIC_TURNSTILE_SITE_KEY (same pattern as __API_URL__).
  return (window as unknown as { __TURNSTILE_SITE_KEY__?: string }).__TURNSTILE_SITE_KEY__ || "";
}

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (turnstile()) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Turnstile"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export type TurnstileHandle = {
  /** Mint a fresh token (invisible unless a challenge is needed). null if unconfigured/unavailable. */
  execute: () => Promise<string | null>;
};

export const TurnstileWidget = React.forwardRef<TurnstileHandle, { className?: string }>(
  function TurnstileWidget({ className }, ref) {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const widgetIdRef = React.useRef<string | null>(null);
    const pendingRef = React.useRef<((token: string | null) => void) | null>(null);
    const siteKey = getSiteKey();
    // The site key comes from a client-only global (window.__TURNSTILE_SITE_KEY__), so the
    // server renders nothing while the client would render the widget div — a hydration
    // mismatch. Defer the div to after mount so SSR and the first client render agree.
    const [mounted, setMounted] = React.useState(false);
    React.useEffect(() => setMounted(true), []);

    const settle = (token: string | null) => {
      const resolve = pendingRef.current;
      pendingRef.current = null;
      resolve?.(token);
    };

    React.useEffect(() => {
      if (!mounted || !siteKey || typeof window === "undefined") return;
      let cancelled = false;
      void loadScript()
        .then(() => {
          const ts = turnstile();
          if (cancelled || !ts || !containerRef.current || widgetIdRef.current) return;
          widgetIdRef.current = ts.render(containerRef.current, {
            sitekey: siteKey,
            execution: "execute",
            appearance: "interaction-only",
            callback: (token: string) => settle(token),
            "error-callback": () => settle(null),
            "timeout-callback": () => settle(null),
          });
        })
        .catch(() => {});
      return () => {
        cancelled = true;
        const ts = turnstile();
        if (ts && widgetIdRef.current) {
          try {
            ts.remove(widgetIdRef.current);
          } catch {
            /* ignore */
          }
          widgetIdRef.current = null;
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [siteKey, mounted]);

    React.useImperativeHandle(
      ref,
      () => ({
        execute() {
          const ts = turnstile();
          if (!siteKey || !ts || !widgetIdRef.current) return Promise.resolve(null);
          return new Promise<string | null>((resolve) => {
            pendingRef.current = resolve;
            try {
              ts.reset(widgetIdRef.current!);
              ts.execute(widgetIdRef.current!);
            } catch {
              settle(null);
              return;
            }
            // Safety net: don't hang the form if the callback never fires.
            setTimeout(() => settle(null), 8000);
          });
        },
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [siteKey],
    );

    // Render nothing until mounted (matches SSR) — then the div appears client-side and
    // the effect above renders the invisible widget into it.
    if (!mounted || !siteKey) return null;
    return <div ref={containerRef} className={className} />;
  },
);
