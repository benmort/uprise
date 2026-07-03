"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Copy,
  Eye,
  Info,
  MapPin,
  Pencil,
  Plus,
  Save,
  Shield,
  Tag,
  Trash2,
  Users,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { FormDialog } from "@/components/ui/form-dialog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  CATALOGUE,
  CATALOGUE_ITEMS,
  OPERATOR_LABELS,
  POPULATION,
  estimateReach,
  labelValue,
  type CatalogueItem,
  type Condition,
  type FilterGroup,
  type MatchKind,
  type Segment,
} from "../_data/mock";

const FIELD_ICON: Record<string, typeof MapPin> = {
  "member.locState": MapPin,
  "member.ageGroup": Users,
  "member.donorStatus": Activity,
  "tag.has": Tag,
  "activity.lastActiveWithin": Activity,
  "action.taken": Zap,
  "fru.donatedToCampaign": Zap,
  "cs.signedPetition": Zap,
};

const MATCHES: { value: MatchKind; label: string }[] = [
  { value: "all", label: "ALL" },
  { value: "any", label: "ANY" },
  { value: "none", label: "NONE" },
];

const CAP_LABEL: Record<string, string> = { pending: "Seed data", gated: "Coming soon" };

let counter = 100;
const cid = () => `c_${(counter += 1)}`;

export function SegmentBuilder({ initial }: { initial: Segment }) {
  const { showToast } = useToast();
  const [name, setName] = useState(initial.name);
  const [tree, setTree] = useState<FilterGroup>(initial.tree);
  const [policy, setPolicy] = useState(initial.policy);
  const [addTarget, setAddTarget] = useState<"root" | number | null>(null);

  const reach = useMemo(() => estimateReach(tree, policy), [tree, policy]);
  const afterCompliance = Math.round(reach * 0.94);
  const sendable = Math.round(afterCompliance * 0.88);

  const editRoot = (patch: Partial<FilterGroup>) => setTree((t) => ({ ...t, ...patch }));

  const addCondition = (item: CatalogueItem) => {
    const cond: Condition = {
      id: cid(),
      field: item.field,
      operator: item.operators[0],
      values: item.valueKind === "multi" || !item.options ? [] : [item.options[0]],
    };
    setTree((t) => {
      const next = structuredClone(t);
      if (addTarget === "root") next.conditions.push(cond);
      else if (typeof addTarget === "number") next.groups[addTarget]?.conditions.push(cond);
      return next;
    });
    setAddTarget(null);
  };

  const updateCondition = (groupIdx: number | "root", id: string, patch: Partial<Condition>) =>
    setTree((t) => {
      const next = structuredClone(t);
      const g = groupIdx === "root" ? next : next.groups[groupIdx];
      const c = g?.conditions.find((x) => x.id === id);
      if (c) Object.assign(c, patch);
      return next;
    });

  const removeCondition = (groupIdx: number | "root", id: string) =>
    setTree((t) => {
      const next = structuredClone(t);
      const g = groupIdx === "root" ? next : next.groups[groupIdx];
      if (g) g.conditions = g.conditions.filter((x) => x.id !== id);
      return next;
    });

  const duplicateCondition = (groupIdx: number | "root", id: string) =>
    setTree((t) => {
      const next = structuredClone(t);
      const g = groupIdx === "root" ? next : next.groups[groupIdx];
      const c = g?.conditions.find((x) => x.id === id);
      if (g && c) g.conditions.push({ ...c, id: cid(), values: [...c.values] });
      return next;
    });

  const addGroup = () =>
    setTree((t) => ({ ...t, groups: [...t.groups, { match: "all", conditions: [], groups: [] }] }));

  const removeGroup = (idx: number) =>
    setTree((t) => ({ ...t, groups: t.groups.filter((_, i) => i !== idx) }));

  const editGroup = (idx: number, patch: Partial<FilterGroup>) =>
    setTree((t) => {
      const next = structuredClone(t);
      if (next.groups[idx]) Object.assign(next.groups[idx], patch);
      return next;
    });

  return (
    <div className="pb-16">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Audience definition</p>
          <div className="mt-1 flex items-center gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-auto max-w-lg border-0 bg-transparent px-0 text-2xl font-semibold shadow-none focus-visible:ring-0"
              aria-label="Audience name"
            />
            <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            A reusable audience query. You define the intent; org policy and the compliance floor apply at send time.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={() => showToast({ tone: "info", title: "Summary is a mock" })}>
            <Eye className="mr-1.5 h-4 w-4" /> View summary
          </Button>
          <Button onClick={() => showToast({ tone: "success", title: "Saved (mock)" })}>
            <Save className="mr-1.5 h-4 w-4" /> Save audience
          </Button>
        </div>
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        {/* Left: L1 / L2 / L3 */}
        <div className="flex flex-col gap-4">
          {/* L1 intent */}
          <Card>
            <div className="flex items-center gap-2 border-b border-border p-4">
              <LayerBadge n={1} />
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">Your intent</p>
                <p className="text-xs text-muted-foreground">Who you want to reach</p>
              </div>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">You define this</span>
            </div>
            <CardContent className="space-y-4 p-4">
              <MatchToggle value={tree.match} onChange={(m) => editRoot({ match: m })} />
              {tree.conditions.length === 0 && tree.groups.length === 0 && (
                <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  No conditions yet — this matches everyone. Add a condition to narrow the audience.
                </p>
              )}
              {tree.conditions.map((c) => (
                <ConditionRow
                  key={c.id}
                  condition={c}
                  onChange={(patch) => updateCondition("root", c.id, patch)}
                  onDuplicate={() => duplicateCondition("root", c.id)}
                  onRemove={() => removeCondition("root", c.id)}
                />
              ))}

              {tree.groups.map((g, idx) => (
                <div key={idx} className="rounded-lg border border-border bg-surface-variant/40 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <MatchToggle value={g.match} onChange={(m) => editGroup(idx, { match: m })} small />
                    <button
                      type="button"
                      aria-label="Remove group"
                      className="text-muted-foreground hover:text-error"
                      onClick={() => removeGroup(idx)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="space-y-3">
                    {g.conditions.map((c) => (
                      <ConditionRow
                        key={c.id}
                        condition={c}
                        onChange={(patch) => updateCondition(idx, c.id, patch)}
                        onDuplicate={() => duplicateCondition(idx, c.id)}
                        onRemove={() => removeCondition(idx, c.id)}
                      />
                    ))}
                    <Button variant="ghost" size="sm" onClick={() => setAddTarget(idx)}>
                      <Plus className="mr-1.5 h-4 w-4" /> Add condition
                    </Button>
                  </div>
                </div>
              ))}

              <div className="flex flex-wrap gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => setAddTarget("root")}>
                  <Plus className="mr-1.5 h-4 w-4" /> Add condition
                </Button>
                <Button variant="ghost" size="sm" onClick={addGroup}>
                  <Plus className="mr-1.5 h-4 w-4" /> Add match group
                </Button>
              </div>
            </CardContent>
          </Card>

          <PolicyBand policy={policy} onChange={setPolicy} />
          <ComplianceBand />
        </div>

        {/* Right: live preview */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <PreviewPanel reach={reach} afterCompliance={afterCompliance} sendable={sendable} />
        </div>
      </div>

      <FormDialog
        open={addTarget !== null}
        title="Add a condition"
        description="Pick from the closed condition vocabulary."
        size="lg"
        submitLabel="Done"
        onSubmit={() => setAddTarget(null)}
        onClose={() => setAddTarget(null)}
      >
        <div className="space-y-4">
          {CATALOGUE.map((section) => (
            <div key={section.section}>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{section.section}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {section.items.map((item) => (
                  <button
                    key={item.field}
                    type="button"
                    onClick={() => addCondition(item)}
                    className="flex flex-col rounded-lg border border-border p-3 text-left transition hover:border-primary hover:bg-surface-variant"
                  >
                    <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                      {item.label}
                      {item.capability !== "now" && <CapBadge cap={item.capability} />}
                    </span>
                    <span className="mt-0.5 text-xs text-muted-foreground">{item.description}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </FormDialog>
    </div>
  );
}

function LayerBadge({ n }: { n: number }) {
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
      {n}
    </span>
  );
}

function CapBadge({ cap }: { cap: string }) {
  return (
    <span className="rounded-full bg-warning-container px-1.5 py-0.5 text-[10px] font-medium text-warning-foreground">
      {CAP_LABEL[cap] ?? cap}
    </span>
  );
}

function MatchToggle({
  value,
  onChange,
  small,
}: {
  value: MatchKind;
  onChange: (m: MatchKind) => void;
  small?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Match</span>
      <div className="inline-flex overflow-hidden rounded-md border border-border">
        {MATCHES.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => onChange(m.value)}
            className={cn(
              "px-2.5 font-medium",
              small ? "h-7 text-[11px]" : "h-8 text-xs",
              value === m.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-surface-variant",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ConditionRow({
  condition,
  onChange,
  onDuplicate,
  onRemove,
}: {
  condition: Condition;
  onChange: (patch: Partial<Condition>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const item = CATALOGUE_ITEMS[condition.field];
  const Icon = FIELD_ICON[condition.field] ?? Tag;
  if (!item) return null;

  const toggleValue = (v: string) => {
    const has = condition.values.includes(v);
    onChange({ values: has ? condition.values.filter((x) => x !== v) : [...condition.values, v] });
  };

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-background p-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{item.label}</span>
          {item.capability !== "now" && <CapBadge cap={item.capability} />}
          <Select
            value={condition.operator}
            onValueChange={(op) => onChange({ operator: op })}
            aria-label="Operator"
            className="h-8 w-[130px]"
          >
            {item.operators.map((op) => (
              <SelectItem key={op} value={op}>
                {OPERATOR_LABELS[op] ?? op}
              </SelectItem>
            ))}
          </Select>
        </div>

        {/* Value editor */}
        {item.valueKind === "multi" && item.options && (
          <div className="flex flex-wrap gap-1.5">
            {item.options.map((opt) => {
              const on = condition.values.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggleValue(opt)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs",
                    on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-surface-variant",
                  )}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        )}
        {(item.valueKind === "single" || item.valueKind === "window") && item.options && (
          <Select
            value={condition.values[0] ?? item.options[0]}
            onValueChange={(v) => onChange({ values: [v] })}
            aria-label="Value"
            className="h-8 w-[200px]"
          >
            {item.options.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {labelValue(condition.field, opt)}
              </SelectItem>
            ))}
          </Select>
        )}
        {!item.options && (
          <span className="inline-block rounded-md border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground">
            Any {item.field.startsWith("cs.") ? "petition" : "campaign"} (pick specific — mock)
          </span>
        )}
      </div>

      <div className="flex shrink-0 gap-1">
        <button type="button" aria-label="Duplicate" className="text-muted-foreground hover:text-foreground" onClick={onDuplicate}>
          <Copy className="h-4 w-4" />
        </button>
        <button type="button" aria-label="Remove" className="text-muted-foreground hover:text-error" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function PolicyBand({
  policy,
  onChange,
}: {
  policy: Segment["policy"];
  onChange: (p: Segment["policy"]) => void;
}) {
  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-border p-4">
        <LayerBadge n={2} />
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Policy</p>
          <p className="text-xs text-muted-foreground">Org rules — overridable with permission</p>
        </div>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">Overridable</span>
      </div>
      <CardContent className="divide-y divide-border p-0">
        <PolicyToggle
          label="Active members only"
          hint="Exclude members outside the org's active-member window."
          checked={policy.activeOnly}
          onChange={(v) => onChange({ ...policy, activeOnly: v })}
        />
        <PolicyToggle
          label="Fatigue cap"
          hint={`No more than one send per ${policy.fatigueWindowHours}h.`}
          checked={policy.fatigueEnabled}
          onChange={(v) => onChange({ ...policy, fatigueEnabled: v })}
        />
      </CardContent>
    </Card>
  );
}

function PolicyToggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 p-4">
      <span>
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-surface-variant",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform",
            checked ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        />
      </button>
    </label>
  );
}

function ComplianceBand() {
  const items = ["Subscribed", "Deliverable", "Not suppressed", "Not deceased"];
  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-border p-4">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
          <Shield className="h-3.5 w-3.5" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Compliance floor</p>
          <p className="text-xs text-muted-foreground">System layer — always applied</p>
        </div>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">Locked</span>
      </div>
      <CardContent className="flex flex-wrap gap-2 p-4">
        {items.map((label) => (
          <span key={label} className="inline-flex items-center gap-1 rounded-full bg-surface-variant px-2.5 py-1 text-xs text-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--success))]" /> {label}
          </span>
        ))}
      </CardContent>
    </Card>
  );
}

function PreviewPanel({
  reach,
  afterCompliance,
  sendable,
}: {
  reach: number;
  afterCompliance: number;
  sendable: number;
}) {
  const rows = [
    { label: "Match your audience (intent + policy)", count: reach },
    { label: "After the compliance floor", count: afterCompliance },
    { label: "Sendable now (excludes already-contacted)", count: sendable },
  ];
  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Live estimate</p>
          <p className="mt-1 font-mono text-4xl font-bold text-primary">{sendable.toLocaleString()}</p>
          <p className="text-sm text-muted-foreground">people reachable now</p>
        </div>
        <div className="space-y-2.5">
          {rows.map((r) => (
            <div key={r.label}>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{r.label}</span>
                <span className="font-mono font-medium text-foreground">{r.count.toLocaleString()}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-variant">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((r.count / POPULATION) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
        <p className="flex items-start gap-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Estimate re-runs at send time against the live member base.
        </p>
      </CardContent>
    </Card>
  );
}
