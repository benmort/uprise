"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  Check,
  Loader2,
  Minus,
  Network as NetworkIcon,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { FLAG_META, NAV_FLAGS, type FeatureFlagKey } from "@uprise/flags";
import { cn } from "@/lib/utils";
import {
  getFlagAdminFor,
  searchNetworks,
  searchTenants,
  setTargetFlag,
  type FlagAdminEntry,
  type FlagTarget,
  type NetworkLite,
  type TenantLite,
} from "@/lib/api/flags";

function isPermissionError(msg: string) {
  return /forbidden|permission|not allowed|403/i.test(msg);
}

const NAV_LABEL: Record<string, string> = Object.fromEntries(NAV_FLAGS.map((n) => [n.key, n.label]));
const NAV_SECTION: Record<string, string> = Object.fromEntries(NAV_FLAGS.map((n) => [n.key, n.section]));
const SECTION_ORDER = ["Core features", "Inbox", "Channels", "Canvass", "Engagement", "Compliance", "Prog"];

function flagLabel(f: string) {
  if (NAV_LABEL[f]) return NAV_LABEL[f];
  return f
    .replace(/^FEATURE_/, "")
    .replace(/_ENABLED$/, "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const SOURCE_STYLES: Record<string, string> = {
  env: "bg-warning/15 text-warning-foreground",
  tenant: "bg-primary/15 text-primary",
  network: "bg-accent/15 text-accent-foreground",
  plan: "bg-accent/15 text-accent-foreground",
  global: "bg-info/15 text-info",
  default: "bg-surface-variant text-muted-foreground",
};

type SelTarget = { type: "tenant" | "network"; id: string; label: string; sub?: string };

/** Tri-state override control: Inherit (clear) / Force on / Force off. */
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

export default function FeatureFlagsPage() {
  const [tab, setTab] = useState<"tenant" | "network">("tenant");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<TenantLite | NetworkLite>>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<SelTarget | null>(null);
  const [entries, setEntries] = useState<FlagAdminEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const targetOf = (s: SelTarget): FlagTarget =>
    s.type === "tenant" ? { tenantId: s.id } : { networkId: s.id };

  const runSearch = useCallback(
    async (kind: "tenant" | "network", q: string) => {
      setSearching(true);
      setError(null);
      setDenied(false);
      const res = kind === "tenant" ? await searchTenants(q) : await searchNetworks(q);
      setSearching(false);
      if (res.ok) setResults(res.data);
      else if (isPermissionError(res.error)) setDenied(true);
      else setError(res.error);
    },
    [],
  );

  // Reset + load an initial (unfiltered) list whenever the tab changes.
  useEffect(() => {
    setSelected(null);
    setEntries([]);
    setQuery("");
    void runSearch(tab, "");
  }, [tab, runSearch]);

  const select = useCallback(
    async (s: SelTarget) => {
      setSelected(s);
      setLoading(true);
      setActionError(null);
      const res = await getFlagAdminFor(targetOf(s));
      setLoading(false);
      if (res.ok) setEntries(res.data);
      else if (isPermissionError(res.error)) setDenied(true);
      else setError(res.error);
    },
    [],
  );

  async function setOverride(key: FeatureFlagKey, enabled: boolean | null) {
    if (!selected || pending) return;
    setPending(key);
    setActionError(null);
    const res = await setTargetFlag(targetOf(selected), key, enabled);
    setPending(null);
    if (res.ok) setEntries(res.data);
    else setActionError(isPermissionError(res.error) ? "Super-admins only." : res.error);
  }

  // Only flags overridable for the target: tenant target → tenant-controllable;
  // network target → tenant- or plan-controllable. Grouped by nav section.
  const groups = useMemo(() => {
    const overridable = entries.filter((f) =>
      selected?.type === "network"
        ? f.controllableBy.includes("tenant") || f.controllableBy.includes("plan")
        : f.controllableBy.includes("tenant"),
    );
    const by: Record<string, FlagAdminEntry[]> = {};
    for (const f of overridable) {
      const s = NAV_SECTION[f.key] ?? "Core features";
      (by[s] ||= []).push(f);
    }
    return SECTION_ORDER.filter((s) => by[s]?.length).map((s) => ({ section: s, flags: by[s] }));
  }, [entries, selected]);

  const overrideOf = (f: FlagAdminEntry): boolean | null =>
    selected?.type === "network" ? f.networkOverride : f.tenantOverride;

  return (
    <main className="page-stack">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 shrink-0 text-primary" />
            <h1 className="text-2xl font-extrabold">Feature flags</h1>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Per-tenant and per-network overrides on top of each target&apos;s plan. Pick a
            workspace or network, then force a feature on or off, or leave it to inherit
            from the plan. Base entitlements live on the{" "}
            <Link href="/settings/plans" className="text-primary hover:underline">
              Plans
            </Link>{" "}
            page.
          </p>
        </div>
        <Link
          href="/settings/plans"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-surface-variant"
        >
          <SlidersHorizontal className="h-4 w-4" /> Plans
        </Link>
      </div>

      {actionError ? (
        <div className="rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">{actionError}</div>
      ) : null}

      {denied ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface px-6 py-16 text-center">
          <ShieldAlert className="mb-3 h-8 w-8 text-muted-foreground" />
          <h3 className="mb-1 text-lg font-medium text-foreground">No access</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            Per-tenant/network overrides are super-admin only.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          {/* Selector panel */}
          <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
            <div className="inline-flex w-full overflow-hidden rounded-lg border border-border">
              {(["tenant", "network"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 px-3 py-1.5 text-sm capitalize transition-colors",
                    tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-surface-variant",
                  )}
                >
                  {t === "tenant" ? <Building2 className="h-4 w-4" /> : <NetworkIcon className="h-4 w-4" />}
                  {t === "tenant" ? "Tenant" : "Network"}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void runSearch(tab, query);
              }}
              className="flex items-center gap-2 rounded-lg border border-border px-2.5"
            >
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${tab}s…`}
                className="w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
              />
            </form>
            <div className="max-h-[420px] space-y-1 overflow-y-auto">
              {searching ? (
                <div className="flex items-center gap-2 px-1 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Searching…
                </div>
              ) : results.length === 0 ? (
                <p className="px-1 py-4 text-sm text-muted-foreground">No {tab}s found.</p>
              ) : (
                results.map((r) => {
                  const isTenant = tab === "tenant";
                  const label = r.name;
                  const sub = isTenant ? (r as TenantLite).slug : ((r as NetworkLite).planName ?? "no plan");
                  const active = selected?.id === r.id && selected.type === tab;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => void select({ type: tab, id: r.id, label, sub })}
                      className={cn(
                        "flex w-full flex-col items-start rounded-lg px-3 py-2 text-left transition-colors",
                        active ? "bg-primary/10 text-primary" : "hover:bg-surface-variant",
                      )}
                    >
                      <span className="text-sm font-medium text-foreground">{label}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">{sub}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Override editor */}
          <div className="min-w-0">
            {!selected ? (
              <div className="flex h-full min-h-[200px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center text-sm text-muted-foreground">
                Pick a {tab} on the left to view and override its feature flags.
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
                <div className="border-b border-border px-5 py-4">
                  <div className="flex items-center gap-2">
                    {selected.type === "tenant" ? <Building2 className="h-4 w-4 text-muted-foreground" /> : <NetworkIcon className="h-4 w-4 text-muted-foreground" />}
                    <span className="font-semibold text-foreground">{selected.label}</span>
                    <span className="font-mono text-xs text-muted-foreground">{selected.sub}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Overrides take precedence over the plan. &quot;Inherit&quot; clears the override.
                  </p>
                </div>
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
                              <span className={cn("rounded-full px-2 py-0.5 text-[11px]", SOURCE_STYLES[f.source] ?? SOURCE_STYLES.default)}>
                                via {f.source}
                              </span>
                            </div>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">{f.description}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {pending === f.key ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
                            <TriState
                              value={overrideOf(f)}
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
        </div>
      )}
    </main>
  );
}
