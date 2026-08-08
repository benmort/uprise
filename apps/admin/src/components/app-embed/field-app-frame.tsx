"use client";

import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ExternalLink, Monitor, Smartphone } from "lucide-react";
import { getFieldAppUrl } from "@uprise/api-client";
import { PageHeader } from "@/components/shell/page-header";
import { cn } from "@/lib/utils";

/**
 * Read at BUILD time so the server render and the client's first render agree and hydration
 * has nothing to reconcile. The derived value is applied afterwards, from an effect.
 */
const ENV_FIELD_ORIGIN = (process.env.NEXT_PUBLIC_FIELD_APP_URL || "").replace(/\/$/, "");

/**
 * The embedded volunteer app ("Yarns") — the REAL field app in an iframe. Both apps sit on
 * the same parent domain, so the httpOnly session cookie flows into the frame and SSO just
 * works: what you see is exactly what a volunteer sees, branding and all. A width toggle
 * flips between a phone-sized frame (the app's native shape) and full width (the texting
 * screens' desktop two-pane).
 */
export function FieldAppFrame({
  title,
  description,
  icon,
  path,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  /** Path within the field app, e.g. "/" (My turf) or "/texts". */
  path: string;
}) {
  const [width, setWidth] = useState<"phone" | "full">("phone");

  /**
   * The field app's origin, resolved AFTER mount rather than during render.
   *
   * Two faults here, of quite different reach.
   *
   * The live one: the env value took precedence over any derivation, so on a tenant's own
   * domain the frame pointed at the PLATFORM field app. That is a different parent, so the
   * session cookie does not reach it and the frame shows a login bounce instead of the app.
   * `NEXT_PUBLIC_FIELD_APP_URL` is set in admin's production environment (checked), which is
   * exactly why the env branch always won and the derivation never ran.
   *
   * The latent one: the fallback derivation was `hostname.replace(/^admin\./, "field.")`,
   * which no-ops wherever the first label is not literally `admin` — on a bare tenant
   * subdomain (`<tenant>.uprise.org.au`) it left the base as the admin host, so the page
   * iframed ITSELF. Only reachable where the env var is absent (local dev, or a deployment
   * missing it), which is why it has survived unnoticed.
   *
   * `getFieldAppUrl()` has the precedence the right way round — derive on a custom parent,
   * otherwise the configured value, which stays correct for the platform and bare-subdomain
   * cases. Applying it from an effect makes the correction a real re-render: an attribute
   * that differs between the server render and the client's first render is a mismatch React
   * warns about in development and leaves alone in production, so computing it during render
   * would ship the server's answer regardless.
   */
  const [origin, setOrigin] = useState(ENV_FIELD_ORIGIN);
  useEffect(() => {
    setOrigin(getFieldAppUrl().replace(/\/$/, ""));
  }, []);
  const src = origin ? `${origin}${path}` : null;

  return (
    <div className="flex h-[calc(100dvh-7rem)] flex-col gap-4">
      <PageHeader
        title={title}
        icon={icon}
        description={description}
        actions={
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface-variant p-1">
              {(
                [
                  { key: "phone", label: "Phone", Icon: Smartphone },
                  { key: "full", label: "Full", Icon: Monitor },
                ] as const
              ).map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={width === key}
                  onClick={() => setWidth(key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold",
                    width === key ? "bg-surface text-foreground shadow-card" : "text-muted-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
            {/* Held back until the origin is known — an <a> with no href is not focusable
                and reads to a screen reader as text, not a broken link. */}
            {src ? (
              <a
                href={src}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-variant"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open app
              </a>
            ) : null}
          </div>
        }
      />
      <div className="flex min-h-0 flex-1 justify-center">
        {src ? (
          <iframe
            src={src}
            title={title}
            className={cn(
              "h-full rounded-2xl border border-border bg-surface shadow-card",
              width === "phone" ? "w-[430px] max-w-full" : "w-full",
            )}
          />
        ) : null}
      </div>
    </div>
  );
}
