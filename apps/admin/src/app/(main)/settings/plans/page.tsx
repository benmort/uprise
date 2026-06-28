"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, ChevronLeft, EyeOff, Loader2, Pencil, Plus, ShieldAlert, Star, X } from "lucide-react";
import { FEATURE_FLAG_KEYS, FLAG_META, NAV_FLAGS, type FeatureFlagKey } from "@uprise/flags";
import { cn } from "@/lib/utils";
import {
  listPlans,
  updatePlan,
  upsertPlan,
  type Plan,
  type PlanEditable,
  type PlanFeatureRow,
} from "@/lib/api/flags";
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

// Friendly label + section grouping for the entitlements table (mirrors the nav).
const NAV_LABEL: Record<string, string> = Object.fromEntries(NAV_FLAGS.map((n) => [n.key, n.label]));
const NAV_SECTION: Record<string, string> = Object.fromEntries(NAV_FLAGS.map((n) => [n.key, n.section]));
// Core product flags (not tied to a single nav item) sit under "Core features"; the
// rest group by nav section, in nav order.
const SECTION_ORDER = ["Core features", "Inbox", "Channels", "Canvass", "Engagement", "Compliance", "Prog"];
const FLAG_GROUPS: { section: string; flags: FeatureFlagKey[] }[] = (() => {
  const by: Record<string, FeatureFlagKey[]> = {};
  for (const f of PLAN_FLAGS) {
    const s = NAV_SECTION[f] ?? "Core features";
    (by[s] ||= []).push(f);
  }
  return SECTION_ORDER.filter((s) => by[s]?.length).map((s) => ({ section: s, flags: by[s] }));
})();

function isPermissionError(msg: string) {
  return /forbidden|permission|not allowed|403/i.test(msg);
}

function flagLabel(flag: FeatureFlagKey) {
  if (NAV_LABEL[flag]) return NAV_LABEL[flag];
  return flag
    .replace(/^FEATURE_/, "")
    .replace(/_ENABLED$/, "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
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

// ── Edit form: plan fields as strings (blank number = unset/unlimited) ──
type EditFeatureRow = { label: string; mode: "tick" | "text"; bool: boolean; text: string };
type EditForm = {
  displayName: string;
  description: string;
  order: string;
  popular: boolean;
  publiclyVisible: boolean;
  priceMonthly: string;
  priceMonthlyOriginal: string;
  priceAnnually: string;
  priceAnnuallyOriginal: string;
  contacts: string;
  teamMembers: string;
  segments: string;
  features: EditFeatureRow[];
};

const numToStr = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));
const strToNum = (s: string): number | null => {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

function formFromPlan(plan: Plan): EditForm {
  return {
    displayName: plan.displayName,
    description: plan.description ?? "",
    order: String(plan.order ?? 0),
    popular: plan.popular ?? false,
    publiclyVisible: plan.publiclyVisible ?? true,
    priceMonthly: numToStr(plan.priceMonthly),
    priceMonthlyOriginal: numToStr(plan.priceMonthlyOriginal),
    priceAnnually: numToStr(plan.priceAnnually),
    priceAnnuallyOriginal: numToStr(plan.priceAnnuallyOriginal),
    contacts: numToStr(plan.limits?.contacts),
    teamMembers: numToStr(plan.limits?.teamMembers),
    segments: numToStr(plan.limits?.segments),
    features: (plan.features ?? []).map((f) => ({
      label: f.label,
      mode: typeof f.value === "boolean" ? "tick" : "text",
      bool: typeof f.value === "boolean" ? f.value : false,
      text: typeof f.value === "string" ? f.value : "",
    })),
  };
}

function editToPayload(form: EditForm): PlanEditable {
  const features: PlanFeatureRow[] = form.features
    .filter((r) => r.label.trim() !== "")
    .map((r) => ({ label: r.label.trim(), value: r.mode === "tick" ? r.bool : r.text }));
  return {
    displayName: form.displayName.trim(),
    description: form.description.trim() === "" ? null : form.description.trim(),
    order: strToNum(form.order) ?? 0,
    popular: form.popular,
    publiclyVisible: form.publiclyVisible,
    priceMonthly: strToNum(form.priceMonthly),
    priceMonthlyOriginal: strToNum(form.priceMonthlyOriginal),
    priceAnnually: strToNum(form.priceAnnually),
    priceAnnuallyOriginal: strToNum(form.priceAnnuallyOriginal),
    limits: {
      contacts: strToNum(form.contacts),
      teamMembers: strToNum(form.teamMembers),
      segments: strToNum(form.segments),
    },
    features,
  };
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

  // Edit modal
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);

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

  function openEdit(plan: Plan) {
    setEditing(plan);
    setForm(formFromPlan(plan));
    setActionError(null);
  }

  function patchForm(patch: Partial<EditForm>) {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
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

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || !form || !form.displayName.trim() || pending) return;
    const plan = editing;
    setPending(`save:${plan.id}`);
    setActionError(null);
    const res = await updatePlan(plan.id, editToPayload(form));
    setPending(null);
    if (res.ok) {
      setPlans((prev) => prev.map((p) => (p.id === plan.id ? res.data : p)));
      setEditing(null);
      setForm(null);
    } else {
      writeError(res, "Only a super-admin can edit plans.");
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
    <main className="page-stack">
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
            Subscription plans: pricing and limits for the public page, plus the features each one
            grants. A plan&apos;s key must match the network&apos;s plan name. Tenants inherit a
            plan&apos;s entitlements unless a workspace or env override says otherwise.
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
              Create your first plan to start defining its pricing and which features it grants.
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
              Edit a plan&apos;s pricing, limits and visibility, or toggle the features it grants.
              Changes save immediately.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 z-10 min-w-[220px] bg-card">Feature</TableHead>
                    {plans.map((plan) => {
                      const archived = plan.archivedAt !== null;
                      const price =
                        plan.priceMonthly === null || plan.priceMonthly === undefined
                          ? null
                          : plan.priceMonthly;
                      return (
                        <TableHead key={plan.id} className={cn("min-w-[170px] text-center align-top", archived && "opacity-60")}>
                          <div className="flex flex-col items-center gap-1 py-1">
                            <div className="flex flex-wrap items-center justify-center gap-1.5">
                              <span className="font-semibold text-foreground">{plan.displayName}</span>
                              {plan.isDefault ? <Badge variant="info">Default</Badge> : null}
                              {plan.popular ? <Badge variant="secondary">Popular</Badge> : null}
                              {!plan.publiclyVisible ? (
                                <Badge variant="secondary" className="gap-1">
                                  <EyeOff className="h-3 w-3" /> Hidden
                                </Badge>
                              ) : null}
                              {archived ? <Badge variant="secondary">Archived</Badge> : null}
                            </div>
                            <div className="font-mono text-[11px] font-normal text-muted-foreground">{plan.key}</div>
                            <div className="text-[11px] font-normal text-muted-foreground">
                              {price === null ? "No price set" : price === 0 ? "Free" : `$${price}/mo`}
                            </div>
                            <div className="flex items-center gap-0.5">
                              <Button
                                type="button" variant="ghost" size="icon" title="Edit plan" disabled={!!pending}
                                onClick={() => openEdit(plan)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              {!plan.isDefault && !archived ? (
                                <Button
                                  type="button" variant="ghost" size="icon" title="Make default" disabled={!!pending}
                                  onClick={() => void makeDefault(plan)}
                                >
                                  {pending === `default:${plan.id}` ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Star className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              ) : null}
                              <Button
                                type="button" variant="ghost" size="icon" title={archived ? "Unarchive" : "Archive"} disabled={!!pending}
                                onClick={() => void setArchived(plan, !archived)}
                              >
                                {pending === `archive:${plan.id}` ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : archived ? (
                                  <ArchiveRestore className="h-3.5 w-3.5" />
                                ) : (
                                  <Archive className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </div>
                          </div>
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {FLAG_GROUPS.map((group) => (
                    <Fragment key={group.section}>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableCell
                          colSpan={plans.length + 1}
                          className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                        >
                          {group.section}
                        </TableCell>
                      </TableRow>
                      {group.flags.map((f) => (
                        <TableRow key={f}>
                          <TableCell className="sticky left-0 z-10 bg-card">
                            <span className="text-sm text-foreground" title={FLAG_META[f].description}>
                              {flagLabel(f)}
                            </span>
                          </TableCell>
                          {plans.map((plan) => {
                            const archived = plan.archivedAt !== null;
                            return (
                              <TableCell key={plan.id} className="text-center">
                                <div className="flex justify-center">
                                  <Toggle
                                    checked={plan.featureFlags[f] === true}
                                    disabled={pending === `${plan.id}:${f}` || archived}
                                    onChange={(next) => void toggleFlag(plan, f, next)}
                                    label={`${plan.displayName}: ${flagLabel(f)}`}
                                  />
                                </div>
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create plan */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} className="max-w-md bg-card p-6 text-card-foreground">
        <form onSubmit={createPlan} className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-foreground">New plan</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The key must match the network&apos;s plan name; set pricing and limits after creating.
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

      {/* Edit plan */}
      <Modal
        isOpen={editing !== null}
        onClose={() => {
          setEditing(null);
          setForm(null);
        }}
        className="max-h-[88vh] max-w-2xl overflow-y-auto bg-card p-6 text-card-foreground"
      >
        {editing && form ? (
          <form onSubmit={saveEdit} className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Edit plan</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Key <span className="font-mono">{editing.key}</span> is fixed. Pricing and limits show
                on the public pricing page; leave a price blank for &ldquo;no price&rdquo; and a limit
                blank for unlimited.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="e-name">Display name</Label>
                <Input id="e-name" value={form.displayName} onChange={(e) => patchForm({ displayName: e.target.value })} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="e-desc">Description</Label>
                <Input
                  id="e-desc"
                  value={form.description}
                  onChange={(e) => patchForm({ description: e.target.value })}
                  placeholder="For small teams and local campaigns"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="e-order">Display order</Label>
                <Input id="e-order" type="number" value={form.order} onChange={(e) => patchForm({ order: e.target.value })} />
              </div>
              <div className="flex items-end gap-6">
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <Toggle checked={form.popular} onChange={(v) => patchForm({ popular: v })} label="Popular" />
                  Popular
                </label>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <Toggle
                    checked={form.publiclyVisible}
                    onChange={(v) => patchForm({ publiclyVisible: v })}
                    label="Publicly visible"
                  />
                  Publicly visible
                </label>
              </div>
            </div>

            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pricing</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="e-pm">Monthly price ($)</Label>
                  <Input id="e-pm" type="number" value={form.priceMonthly} onChange={(e) => patchForm({ priceMonthly: e.target.value })} placeholder="49" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="e-pmo">Monthly original ($)</Label>
                  <Input id="e-pmo" type="number" value={form.priceMonthlyOriginal} onChange={(e) => patchForm({ priceMonthlyOriginal: e.target.value })} placeholder="59" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="e-pa">Annual price ($)</Label>
                  <Input id="e-pa" type="number" value={form.priceAnnually} onChange={(e) => patchForm({ priceAnnually: e.target.value })} placeholder="499" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="e-pao">Annual original ($)</Label>
                  <Input id="e-pao" type="number" value={form.priceAnnuallyOriginal} onChange={(e) => patchForm({ priceAnnuallyOriginal: e.target.value })} placeholder="708" />
                </div>
              </div>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Limits <span className="font-normal normal-case">(blank = unlimited; enforced for contacts &amp; team)</span>
              </legend>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="e-contacts">Contacts</Label>
                  <Input id="e-contacts" type="number" value={form.contacts} onChange={(e) => patchForm({ contacts: e.target.value })} placeholder="5000" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="e-team">Team members</Label>
                  <Input id="e-team" type="number" value={form.teamMembers} onChange={(e) => patchForm({ teamMembers: e.target.value })} placeholder="3" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="e-seg">Segments</Label>
                  <Input id="e-seg" type="number" value={form.segments} onChange={(e) => patchForm({ segments: e.target.value })} placeholder="5" />
                </div>
              </div>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Feature rows <span className="font-normal normal-case">(public pricing table)</span>
              </legend>
              <div className="space-y-2">
                {form.features.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={row.label}
                      onChange={(e) =>
                        patchForm({
                          features: form.features.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)),
                        })
                      }
                      placeholder="Feature name"
                      className="flex-1"
                    />
                    {row.mode === "tick" ? (
                      <Toggle
                        checked={row.bool}
                        onChange={(v) =>
                          patchForm({ features: form.features.map((r, j) => (j === i ? { ...r, bool: v } : r)) })
                        }
                        label={`${row.label} included`}
                      />
                    ) : (
                      <Input
                        value={row.text}
                        onChange={(e) =>
                          patchForm({ features: form.features.map((r, j) => (j === i ? { ...r, text: e.target.value } : r)) })
                        }
                        placeholder="Value"
                        className="w-32"
                      />
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        patchForm({
                          features: form.features.map((r, j) =>
                            j === i ? { ...r, mode: r.mode === "tick" ? "text" : "tick" } : r,
                          ),
                        })
                      }
                    >
                      {row.mode === "tick" ? "Tick" : "Text"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="Remove row"
                      onClick={() => patchForm({ features: form.features.filter((_, j) => j !== i) })}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    patchForm({ features: [...form.features, { label: "", mode: "tick", bool: true, text: "" }] })
                  }
                >
                  <Plus className="h-4 w-4" /> Add row
                </Button>
              </div>
            </fieldset>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditing(null);
                  setForm(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!form.displayName.trim() || pending === `save:${editing.id}`}>
                {pending === `save:${editing.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save changes
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </main>
  );
}
