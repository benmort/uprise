"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, Globe, Lock } from "lucide-react";
import { parentDomain } from "@uprise/domains";
import { getSession } from "@/lib/session";
import { cn } from "@/lib/utils";

/**
 * Domains settings — the tenant's web address(es), Vercel-style.
 *
 * Part A (live): the workspace's uprise subdomain (`<slug>.<platform>`), shown as the
 * primary domain with a copy/open affordance. Part B (custom white-label domains —
 * `admin/auth/action/field.yourdomain`) needs the TenantDomain model + DNS verification
 * backend, so that section renders the intended flow but is disabled until it ships.
 */
export function DomainsSettings() {
  const [slug, setSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void getSession().then((s) => {
      if (!alive) return;
      setSlug(s?.activeTenant?.slug ?? null);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  // The parent domain of the current admin host (admin.dev.uprise.org.au → dev.uprise.org.au;
  // common-threads.uprise.org.au → uprise.org.au), so the shown address matches the environment.
  const baseDomain = useMemo(
    () => (typeof window === "undefined" ? "uprise.org.au" : (parentDomain(window.location.host) ?? "uprise.org.au")),
    [],
  );
  const subdomainHost = slug ? `${slug}.${baseDomain}` : null;

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Domains</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The web address your team and supporters use to reach this workspace.
        </p>
      </div>

      {/* ── Workspace address (uprise subdomain) — live ─────────────────────── */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Workspace address</h3>
        {loading ? (
          <div className="h-[62px] animate-pulse rounded-xl border border-border bg-surface-variant/40" />
        ) : subdomainHost ? (
          <DomainRow host={subdomainHost} primary status="active" />
        ) : (
          <div className="rounded-xl border border-border bg-surface p-4 text-sm text-muted-foreground">
            This workspace has no subdomain yet.
          </div>
        )}
      </section>

      {/* ── Custom domain (white-label) — coming soon ───────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">Custom domain</h3>
          <span className="rounded-md bg-surface-variant px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
            Coming soon
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Bring your own domain for a fully white-label experience — your team on{" "}
          <code className="rounded bg-surface-variant px-1 py-0.5 text-xs">admin.yourdomain.org</code>, supporters on{" "}
          <code className="rounded bg-surface-variant px-1 py-0.5 text-xs">action.yourdomain.org</code>, canvassers on{" "}
          <code className="rounded bg-surface-variant px-1 py-0.5 text-xs">field.yourdomain.org</code>. Add the domain,
          we’ll give you the DNS records, and verify them automatically.
        </p>
        {/* Vercel-style add row — disabled until the verification backend ships. */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            disabled
            placeholder="yourdomain.org"
            aria-label="Custom domain"
            className="min-w-0 flex-1 cursor-not-allowed rounded-lg border border-border bg-surface-variant/40 px-3 py-2 text-sm text-muted-foreground placeholder:text-muted-foreground/70"
          />
          <button
            type="button"
            disabled
            className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-border bg-surface-variant/40 px-4 py-2 text-sm font-semibold text-muted-foreground"
          >
            <Lock className="h-4 w-4" />
            Add
          </button>
        </div>
      </section>
    </div>
  );
}

/** A single domain row — Vercel-style: name, status pill, and copy/open actions. */
function DomainRow({
  host,
  primary = false,
  status,
}: {
  host: string;
  primary?: boolean;
  status: "active" | "pending";
}) {
  const [copied, setCopied] = useState(false);
  const url = `https://${host}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4">
      <Globe className="h-5 w-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{host}</span>
          {primary ? (
            <span className="rounded-md border border-border px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
              Primary
            </span>
          ) : null}
        </div>
        <StatusPill status={status} />
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => void copy()}
          aria-label="Copy address"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-surface-variant hover:text-foreground"
        >
          {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          aria-label="Open address"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-surface-variant hover:text-foreground"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: "active" | "pending" }) {
  if (status === "active") {
    return (
      <span className="mt-0.5 inline-flex items-center gap-1.5 text-xs font-medium text-success">
        <span className="h-1.5 w-1.5 rounded-full bg-success" />
        Active
      </span>
    );
  }
  return (
    <span className="mt-0.5 inline-flex items-center gap-1.5 text-xs font-medium text-warning">
      <span className="h-1.5 w-1.5 rounded-full bg-warning" />
      Pending verification
    </span>
  );
}
