"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, ChevronLeft, Loader2, Pencil, Plus, ShieldAlert, Star } from "lucide-react";
import { FEATURE_FLAG_KEYS, FLAG_META, type FeatureFlagKey } from "@uprise/flags";
import { cn } from "@/lib/utils";
import { listPlans, updatePlan, upsertPlan, type Plan } from "@/lib/api/flags";
import { Badge } from "@/components/prog/ui/badge";
import { Button } from "@/components/prog/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/prog/ui/card";
import { Input } from "@/components/prog/ui/input";
import { Label } from "@/components/prog/ui/label";
import { Modal } from "@/components/prog/ui/modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/prog/ui/table";

// Only flags that declare the "plan" layer can be granted per plan.
const PLAN_FLAGS: FeatureFlagKey[] = FEATURE_FLAG_KEYS.filter((k) =>
  FLAG_META[k].controllableBy.includes("plan"),
);

function isPermissionError(msg: string) {
  return /forbidden|permission|not allowed|403/i.test(msg);
}

function flagLabel(flag: FeatureFlagKey) {
  return flag
    .replace(/^FEATURE_/, "")
    .replace(/_ENABLED$/, "")
    .replaceAll("_", " ")
    .toLowerCase();
}

function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-muted-foreground/30",
      )}
    >
      <span
        className={cn(
          "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform",
          checked ? "translate-x-5" : "translate-x-1",
        )}
      />
    </button>
  );
}

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newName, setNewName] = useState("");

  // Rename modal
  const [renaming, setRenaming] = useState<Plan | null>(null);
  const [renameValue, setRenameValue] = useState("");

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

  function writeError(res: { error: string }, fallback: string) {
    setActionError(isPermissionError(res.error) ? fallback : res.error);
  }

  async function toggleFlag(plan: Plan, flag: FeatureFlagKey, next: boolean) {
    if (pending) return;
    setPending(`${plan.id}:${flag}`);
    setActionError(null);
    const featureFlags = { ...plan.featureFlags, [flag]: next };
    const res = await updatePlan(plan.id, { featureFlags });
    setPending(null);
    if (res.ok) setPlans((prev) => prev.map((p) => (p.id === plan.id ? res.data : p)));
    else writeError(res, "Only a super-admin can edit plan entitlements.");
  }

  async function createPlan(e: React.FormEvent) {
    e.preventDefault();
    if (!newKey.trim() || !newName.trim() || pending) return;
    setPending("create");
    setActionError(null);
    const res = await upsertPlan({ key: newKey.trim(), displayName: newName.trim(), featureFlags: {} });
    setPending(null);
    if (res.ok) {
      setCreateOpen(false);
      setNewKey("");
      setNewName("");
      void load();
    } else {
      writeError(res, "Only a super-admin can create plans.");
    }
  }

  async function renamePlan(e: React.FormEvent) {
    e.preventDefault();
    if (!renaming || !renameValue.trim() || pending) return;
    const plan = renaming;
    setPending(`rename:${plan.id}`);
    setActionError(null);
    const res = await updatePlan(plan.id, { displayName: renameValue.trim() });
    setPending(null);
    if (res.ok) {
      setPlans((prev) => prev.map((p) => (p.id === plan.id ? res.data : p)));
      setRenaming(null);
    } else {
      writeError(res, "Only a super-admin can rename plans.");
    }
  }

  async function makeDefault(plan: Plan) {
    if (pending || plan.isDefault) return;
    setPending(`default:${plan.id}`);
    setActionError(null);
    const res = await updatePlan(plan.id, { isDefault: true });
    setPending(null);
    // Setting one default clears the others server-side, so reload the set.
    if (res.ok) void load();
    else writeError(res, "Only a super-admin can change the default plan.");
  }

  async function setArchived(plan: Plan, archived: boolean) {
    if (pending) return;
    setPending(`archive:${plan.id}`);
    setActionError(null);
    const res = await updatePlan(plan.id, { archived });
    setPending(null);
    if (res.ok) setPlans((prev) => prev.map((p) => (p.id === plan.id ? res.data : p)));
    else writeError(res, "Only a super-admin can archive plans.");
  }

  const headerActions = (
    <Button type="button" onClick={() => setCreateOpen(true)} disabled={!!pending}>
      <Plus className="h-4 w-4" /> New plan
    </Button>
  );

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-1">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/settings/flags"
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" /> Feature flags
          </Link>
          <h1 className="text-2xl font-bold text-foreground">Plans</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Subscription plans and the features each one grants. A plan&apos;s key must match the
            network&apos;s plan name. Tenants inherit a plan&apos;s entitlements unless a workspace or
            env override says otherwise.
          </p>
        </div>
        {!denied && !loading && !error ? headerActions : null}
      </div>

      {actionError ? (
        <div className="rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
          {actionError}
        </div>
      ) : null}

      {denied ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface px-6 py-16 text-center">
          <ShieldAlert className="mb-3 h-8 w-8 text-muted-foreground" />
          <h3 className="mb-1 text-lg font-medium text-foreground">No access</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            You don&apos;t have permission to view plans.
          </p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-6 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading plans…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-border bg-surface px-6 py-10 text-center">
          <p className="text-sm text-error">{error}</p>
          <button type="button" onClick={() => void load()} className="mt-3 text-sm text-primary underline">
            Try again
          </button>
        </div>
      ) : plans.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <h3 className="mb-1 text-lg font-medium text-foreground">No plans yet</h3>
            <p className="mb-4 max-w-sm text-sm text-muted-foreground">
              Create your first plan to start defining which features it grants.
            </p>
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New plan
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden py-0">
          <CardHeader className="border-b py-5">
            <CardTitle>Plans &amp; entitlements</CardTitle>
            <CardDescription>
              Toggle which plan-controllable features each plan grants. Changes save immediately.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-10 bg-card">Plan</TableHead>
                  {PLAN_FLAGS.map((f) => (
                    <TableHead key={f} className="whitespace-nowrap" title={FLAG_META[f].description}>
                      {flagLabel(f)}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => {
                  const archived = plan.archivedAt !== null;
                  return (
                    <TableRow key={plan.id} className={cn(archived && "opacity-60")}>
                      <TableCell className="sticky left-0 z-10 bg-card align-top">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{plan.displayName}</span>
                          {plan.isDefault ? <Badge variant="info">Default</Badge> : null}
                          {archived ? <Badge variant="secondary">Archived</Badge> : null}
                        </div>
                        <div className="mt-0.5 font-mono text-xs text-muted-foreground">{plan.key}</div>
                      </TableCell>
                      {PLAN_FLAGS.map((f) => (
                        <TableCell key={f} className="align-top">
                          <Toggle
                            checked={plan.featureFlags[f] === true}
                            disabled={pending === `${plan.id}:${f}` || archived}
                            onChange={(next) => void toggleFlag(plan, f, next)}
                            label={`${plan.displayName}: ${flagLabel(f)}`}
                          />
                        </TableCell>
                      ))}
                      <TableCell className="align-top text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            title="Rename"
                            disabled={!!pending}
                            onClick={() => {
                              setRenaming(plan);
                              setRenameValue(plan.displayName);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {!plan.isDefault && !archived ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title="Make default"
                              disabled={!!pending}
                              onClick={() => void makeDefault(plan)}
                            >
                              {pending === `default:${plan.id}` ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Star className="h-4 w-4" />
                              )}
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            title={archived ? "Unarchive" : "Archive"}
                            disabled={!!pending}
                            onClick={() => void setArchived(plan, !archived)}
                          >
                            {pending === `archive:${plan.id}` ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : archived ? (
                              <ArchiveRestore className="h-4 w-4" />
                            ) : (
                              <Archive className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Create plan */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} className="max-w-md bg-card p-6 text-card-foreground">
        <form onSubmit={createPlan} className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-foreground">New plan</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The key must match the network&apos;s plan name; the display name is what admins see.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="plan-key">Key (matches plan name)</Label>
            <Input
              id="plan-key"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="growth"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plan-name">Display name</Label>
            <Input
              id="plan-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Growth"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!newKey.trim() || !newName.trim() || pending === "create"}>
              {pending === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create plan
            </Button>
          </div>
        </form>
      </Modal>

      {/* Rename plan */}
      <Modal
        isOpen={renaming !== null}
        onClose={() => setRenaming(null)}
        className="max-w-md bg-card p-6 text-card-foreground"
      >
        <form onSubmit={renamePlan} className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Rename plan</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Changes the display name only. The key{" "}
              <span className="font-mono">{renaming?.key}</span> stays fixed.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rename-name">Display name</Label>
            <Input
              id="rename-name"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                !renameValue.trim() ||
                renameValue.trim() === renaming?.displayName ||
                pending === `rename:${renaming?.id}`
              }
            >
              {pending === `rename:${renaming?.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
