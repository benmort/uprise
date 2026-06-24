"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Lock, RotateCcw, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { getFlagAdmin, setTenantFlag, type FlagAdminEntry } from "@/lib/api/flags";
import { useRefreshFlags } from "@/components/flags/flags-provider";

function isPermissionError(msg: string) {
  return /forbidden|permission|not allowed|403/i.test(msg);
}

const SOURCE_STYLES: Record<string, string> = {
  env: "bg-warning/15 text-warning-foreground",
  tenant: "bg-primary/15 text-primary",
  global: "bg-info/15 text-info",
  plan: "bg-accent/15 text-accent-foreground",
  default: "bg-surface-variant text-muted-foreground",
};

function Toggle({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-muted-foreground/30",
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}

export default function FeatureFlagsPage() {
  const [entries, setEntries] = useState<FlagAdminEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const refreshFlags = useRefreshFlags();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDenied(false);
    const res = await getFlagAdmin();
    if (res.ok) setEntries(res.data);
    else if (isPermissionError(res.error)) setDenied(true);
    else setError(res.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function apply(key: string, enabled: boolean | null) {
    if (pending) return;
    setPending(key);
    setActionError(null);
    const res = await setTenantFlag(key as FlagAdminEntry["key"], enabled);
    setPending(null);
    if (res.ok) {
      setEntries(res.data);
      refreshFlags();
    } else {
      setActionError(isPermissionError(res.error) ? "Only a workspace owner can change feature flags." : res.error);
    }
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-1">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Feature flags</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Turn features on or off for this workspace. The effective value resolves through
          env kill-switch → workspace override → plan → platform default.
        </p>
      </div>

      {actionError ? (
        <div className="rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">{actionError}</div>
      ) : null}

      {denied ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface px-6 py-16 text-center">
          <ShieldAlert className="mb-3 h-8 w-8 text-muted-foreground" />
          <h3 className="mb-1 text-lg font-medium text-foreground">No access</h3>
          <p className="max-w-sm text-sm text-muted-foreground">You don&apos;t have permission to view feature flags.</p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-6 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading flags…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-border bg-surface px-6 py-10 text-center">
          <p className="text-sm text-error">{error}</p>
          <button type="button" onClick={() => void load()} className="mt-3 text-sm text-primary underline">Try again</button>
        </div>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {entries.map((f) => {
            const tenantControllable = f.controllableBy.includes("tenant");
            const envLocked = f.source === "env";
            const locked = !tenantControllable || envLocked;
            const hasTenantOverride = f.tenantOverride !== null;
            return (
              <div key={f.key} className="flex items-start justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{f.key}</span>
                    <span className="rounded-full bg-surface-variant px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">{f.kind}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", SOURCE_STYLES[f.source] ?? SOURCE_STYLES.default)}>
                      {f.source === "default" ? "default" : `via ${f.source}`}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{f.description}</p>
                  {locked ? (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Lock className="h-3 w-3" />
                      {envLocked ? "Set by an environment kill-switch" : "Platform-managed (not workspace-controllable)"}
                    </p>
                  ) : hasTenantOverride ? (
                    <button
                      type="button"
                      onClick={() => void apply(f.key, null)}
                      disabled={pending === f.key}
                      className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
                    >
                      <RotateCcw className="h-3 w-3" /> Reset to inherited
                    </button>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 pt-0.5">
                  {pending === f.key ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
                  <Toggle checked={f.effective} disabled={locked || pending === f.key} onChange={(next) => void apply(f.key, next)} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
