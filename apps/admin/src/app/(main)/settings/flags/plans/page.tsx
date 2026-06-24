"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Loader2, Plus, ShieldAlert } from "lucide-react";
import { FEATURE_FLAG_KEYS, FLAG_META, type FeatureFlagKey } from "@yarns/flags";
import { cn } from "@/lib/utils";
import { listPlans, updatePlan, upsertPlan, type Plan } from "@/lib/api/flags";

// Only flags that declare the "plan" layer can be configured per plan.
const PLAN_FLAGS: FeatureFlagKey[] = FEATURE_FLAG_KEYS.filter((k) => FLAG_META[k].controllableBy.includes("plan"));

function isPermissionError(msg: string) {
  return /forbidden|permission|not allowed|403/i.test(msg);
}

function Toggle({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: (n: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-primary" : "bg-muted-foreground/30",
      )}
    >
      <span className={cn("inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform", checked ? "translate-x-5" : "translate-x-1")} />
    </button>
  );
}

export default function PlanEntitlementsPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newName, setNewName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDenied(false);
    const res = await listPlans();
    if (res.ok) setPlans(res.data);
    else if (isPermissionError(res.error)) setDenied(true);
    else setError(res.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleFlag(plan: Plan, flag: FeatureFlagKey, next: boolean) {
    if (pending) return;
    setPending(`${plan.id}:${flag}`);
    setActionError(null);
    const featureFlags = { ...plan.featureFlags, [flag]: next };
    const res = await updatePlan(plan.id, { featureFlags });
    setPending(null);
    if (res.ok) setPlans((prev) => prev.map((p) => (p.id === plan.id ? res.data : p)));
    else setActionError(isPermissionError(res.error) ? "Only a super-admin can edit plan entitlements." : res.error);
  }

  async function addPlan(e: React.FormEvent) {
    e.preventDefault();
    if (!newKey.trim() || !newName.trim() || pending) return;
    setPending("new");
    setActionError(null);
    const res = await upsertPlan({ key: newKey.trim(), displayName: newName.trim(), featureFlags: {} });
    setPending(null);
    if (res.ok) {
      setNewKey("");
      setNewName("");
      void load();
    } else {
      setActionError(isPermissionError(res.error) ? "Only a super-admin can create plans." : res.error);
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-1">
      <div>
        <Link href="/settings/flags" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Feature flags
        </Link>
        <h1 className="text-2xl font-bold text-foreground">Plan entitlements</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Which features each subscription plan includes. A plan&apos;s key must match the network&apos;s plan name.
          Tenants inherit these unless a workspace or env override says otherwise.
        </p>
      </div>

      {actionError ? (
        <div className="rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">{actionError}</div>
      ) : null}

      {denied ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface px-6 py-16 text-center">
          <ShieldAlert className="mb-3 h-8 w-8 text-muted-foreground" />
          <h3 className="mb-1 text-lg font-medium text-foreground">No access</h3>
          <p className="max-w-sm text-sm text-muted-foreground">You don&apos;t have permission to view plans.</p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-6 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading plans…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-border bg-surface px-6 py-10 text-center">
          <p className="text-sm text-error">{error}</p>
          <button type="button" onClick={() => void load()} className="mt-3 text-sm text-primary underline">Try again</button>
        </div>
      ) : (
        <>
          {plans.length === 0 ? (
            <p className="rounded-xl border border-border bg-surface px-5 py-8 text-center text-sm text-muted-foreground">
              No plans yet. Create one below to start defining entitlements.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-surface">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Plan</th>
                    {PLAN_FLAGS.map((f) => (
                      <th key={f} className="px-3 py-3 font-medium" title={FLAG_META[f].description}>
                        {f.replace(/^FEATURE_/, "").replace(/_ENABLED$/, "").replaceAll("_", " ").toLowerCase()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {plans.map((plan) => (
                    <tr key={plan.id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{plan.displayName}</div>
                        <div className="font-mono text-xs text-muted-foreground">{plan.key}</div>
                      </td>
                      {PLAN_FLAGS.map((f) => (
                        <td key={f} className="px-3 py-3">
                          <Toggle
                            checked={plan.featureFlags[f] === true}
                            disabled={pending === `${plan.id}:${f}`}
                            onChange={(next) => void toggleFlag(plan, f, next)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <form onSubmit={addPlan} className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4">
            <div>
              <label htmlFor="plan-key" className="mb-1 block text-xs font-medium text-muted-foreground">Key (matches plan name)</label>
              <input id="plan-key" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="growth"
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:border-primary focus:outline-none" />
            </div>
            <div>
              <label htmlFor="plan-name" className="mb-1 block text-xs font-medium text-muted-foreground">Display name</label>
              <input id="plan-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Growth"
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:border-primary focus:outline-none" />
            </div>
            <button type="submit" disabled={!newKey.trim() || !newName.trim() || pending === "new"}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {pending === "new" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add plan
            </button>
          </form>
        </>
      )}
    </main>
  );
}
