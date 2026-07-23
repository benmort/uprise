"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Check, Loader2, Minus, ShieldAlert, X } from "lucide-react";
import { NAV_FLAGS, type FeatureFlagKey } from "@uprise/flags";
import { cn } from "@/lib/utils";
import { FlagSourceBadge } from "@/components/super/flag-source-badge";
import { getFlagAdminFor, setTargetFlag, type FlagAdminEntry } from "@/lib/api/flags";
import { TenantPageHeader } from "@/components/super/tenant-page-header";

const NAV_LABEL: Record<string, string> = Object.fromEntries(NAV_FLAGS.map((n) => [n.key, n.label]));
const NAV_SECTION: Record<string, string> = Object.fromEntries(NAV_FLAGS.map((n) => [n.key, n.section]));
const SECTION_ORDER = ["Core features", "Inbox", "Channels", "Canvass", "Engagement", "Compliance", "Prog"];

function isPermissionError(msg: string) {
  return /forbidden|permission|not allowed|403/i.test(msg);
}
function flagLabel(f: string) {
  if (NAV_LABEL[f]) return NAV_LABEL[f];
  return f
    .replace(/^FEATURE_/, "")
    .replace(/_ENABLED$/, "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Tri-state override: Inherit (clear) / On / Off — the /super/flags control, unchanged. */
function TriState({
  value,
  disabled,
  onChange,
}: {
  value: boolean | null;
  disabled?: boolean;
  onChange: (v: boolean | null) => void;
}) {
  const opts: Array<{ v: boolean | null; label: string; Icon: typeof Check }> = [
    { v: null, label: "Inherit", Icon: Minus },
    { v: true, label: "On", Icon: Check },
    { v: false, label: "Off", Icon: X },
  ];
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-border">
      {opts.map((o) => {
        const active = value === o.v;
        return (
          <button
            key={String(o.v)}
            type="button"
            disabled={disabled}
            onClick={() => onChange(o.v)}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              active && o.v === true && "bg-primary text-primary-foreground",
              active && o.v === false && "bg-error text-white",
              active && o.v === null && "bg-surface-variant font-medium text-foreground",
              !active && "text-muted-foreground hover:bg-surface-variant",
            )}
          >
            <o.Icon className="h-3 w-3" />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Per-tenant feature-flag overrides, pre-scoped to the `[tenantId]` in the URL — the
 * super-admin /super/flags editor without the tenant/network picker (the tenant is the one
 * you're managing). Tenant-controllable flags only, grouped by nav section; each is Inherit
 * (from the plan) / force On / force Off. Overrides take precedence over the plan.
 */
export default function TenantFlagsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [entries, setEntries] = useState<FlagAdminEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await getFlagAdminFor({ tenantId });
    setLoading(false);
    if (res.ok) setEntries(res.data);
    else if (isPermissionError(res.error)) setDenied(true);
    else setError(res.error);
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setOverride(key: FeatureFlagKey, enabled: boolean | null) {
    if (pending) return;
    setPending(key);
    setActionError(null);
    const res = await setTargetFlag({ tenantId }, key, enabled);
    setPending(null);
    if (res.ok) setEntries(res.data);
    else setActionError(isPermissionError(res.error) ? "Super-admins only." : res.error);
  }

  const groups = useMemo(() => {
    const overridable = entries.filter((f) => f.controllableBy.includes("tenant"));
    const by: Record<string, FlagAdminEntry[]> = {};
    for (const f of overridable) {
      const s = NAV_SECTION[f.key] ?? "Core features";
      (by[s] ||= []).push(f);
    }
    return SECTION_ORDER.filter((s) => by[s]?.length).map((s) => ({ section: s, flags: by[s] }));
  }, [entries]);

  return (
    <div className="page-stack">
      <TenantPageHeader
        title="Feature flags"
        description="Per-tenant overrides on top of the plan. Force a feature on or off, or leave it to inherit."
      />

      {actionError ? (
        <div className="rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">{actionError}</div>
      ) : null}

      {denied ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface px-6 py-16 text-center">
          <ShieldAlert className="mb-3 h-8 w-8 text-muted-foreground" />
          <h3 className="mb-1 text-lg font-medium text-foreground">No access</h3>
          <p className="max-w-sm text-sm text-muted-foreground">Per-tenant overrides are super-admin only.</p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-6 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading overrides…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-border bg-surface px-6 py-10 text-center">
          <p className="text-sm text-error">{error}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="divide-y divide-border">
            {groups.map((group) => (
              <Fragment key={group.section}>
                <div className="bg-muted/40 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.section}
                </div>
                {group.flags.map((f) => (
                  <div key={f.key} className="flex items-center justify-between gap-4 px-5 py-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-foreground" title={f.key}>
                          {flagLabel(f.key)}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-medium",
                            f.effective ? "bg-success/15 text-success" : "bg-surface-variant text-muted-foreground",
                          )}
                        >
                          {f.effective ? "On" : "Off"}
                        </span>
                        <FlagSourceBadge source={f.source} />
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{f.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {pending === f.key ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
                      <TriState
                        value={f.tenantOverride}
                        disabled={pending === f.key}
                        onChange={(v) => void setOverride(f.key, v)}
                      />
                    </div>
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
