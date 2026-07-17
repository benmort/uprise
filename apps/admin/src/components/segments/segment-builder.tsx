"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  CheckCircle2,
  Copy,
  GitBranch,
  Info,
  List,
  Loader2,
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

import type {
  CatalogueEntry,
  SegmentCatalogueResponse,
  SegmentCustomClause,
  SegmentDetail,
  SegmentPolicy,
  SegmentPreview,
} from "@uprise/segmentation";
import { DEFAULT_SEGMENT_POLICY } from "@uprise/segmentation";
import {
  createSegmentDefinition,
  getSegmentCatalogue,
  previewSegment,
  updateSegmentDefinition,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { FormDialog } from "@/components/ui/form-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  builderToFilter,
  filterToBuilder,
  rowForEntry,
  rowToCondition,
  type BuilderGroup,
  type ConditionRowModel,
} from "./condition-io";
import { SegmentPrompt } from "./segment-prompt";
import { CustomQueryLane, type ClauseCandidate } from "./custom-query-lane";
import { generateSegment } from "@/lib/api";

// The react-flow canvas is heavy — load it only when the organiser switches views.
const SegmentCanvas = dynamic(
  () => import("./graph/segment-canvas").then((m) => m.SegmentCanvas),
  { ssr: false, loading: () => <Skeleton className="h-[480px] w-full rounded-lg" /> },
);

const KIND_ICON: Record<string, typeof MapPin> = {
  contact: Users,
  tag: Tag,
  consent: Shield,
  source: Activity,
  activity: Zap,
  geo: MapPin,
  insights: Activity,
  custom: Zap,
};

const MATCHES: { value: BuilderGroup["match"]; label: string }[] = [
  { value: "all", label: "ALL" },
  { value: "any", label: "ANY" },
  { value: "none", label: "NONE" },
];

const OPERATOR_LABELS: Record<string, string> = {
  in: "is any of",
  notIn: "is none of",
  eq: "is exactly",
  contains: "contains",
  is: "has",
  isNot: "has not",
  within: "in the last",
  before: "before",
  after: "after",
  between: "between",
};

const CAP_LABEL: Record<string, string> = { pending: "Coming soon", gated: "Coming soon" };

// Advanced types authored via other lanes, not the catalogue dialog.
const DIALOG_EXCLUDED = new Set(["custom.clause", "insights.pollThreshold"]);

export function SegmentBuilder({ segment }: { segment?: SegmentDetail }) {
  const router = useRouter();
  const { showToast } = useToast();

  const [catalogue, setCatalogue] = useState<SegmentCatalogueResponse | null>(null);
  const [catalogueError, setCatalogueError] = useState<{ message: string; status?: number } | null>(null);

  const [name, setName] = useState(segment?.name ?? "New audience definition");
  const [builder, setBuilder] = useState<BuilderGroup>(() =>
    segment ? filterToBuilder(segment.filter) : { match: "all", rows: [], groups: [] },
  );
  const [policy, setPolicy] = useState<SegmentPolicy>(segment?.policy ?? DEFAULT_SEGMENT_POLICY);
  const [customClauses, setCustomClauses] = useState<SegmentCustomClause[]>(
    segment?.customClauses ?? [],
  );
  const [candidates, setCandidates] = useState<ClauseCandidate[]>([]);
  const [view, setView] = useState<"tree" | "canvas">("tree");
  const [addTarget, setAddTarget] = useState<"root" | number | null>(null);
  const [preview, setPreview] = useState<SegmentPreview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [promptValue, setPromptValue] = useState("");
  const [promptBusy, setPromptBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSegmentCatalogue().then((result) => {
      if (cancelled) return;
      if (result.ok) setCatalogue(result.data);
      else setCatalogueError({ message: result.error, status: result.status });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const catalogueByType = useMemo(() => {
    const map: Record<string, CatalogueEntry> = {};
    for (const section of catalogue?.sections ?? [])
      for (const entry of section.entries) map[entry.type] = entry;
    return map;
  }, [catalogue]);

  const filter = useMemo(() => builderToFilter(builder), [builder]);

  // Debounced live preview — the real engine counts, not an estimate.
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!catalogue) return;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      setPreviewBusy(true);
      const result = await previewSegment({
        filter,
        policy,
        customClauses,
        seed: segment?.id ? undefined : undefined,
      });
      setPreviewBusy(false);
      if (result.ok) setPreview(result.data);
    }, 400);
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, [filter, policy, customClauses, catalogue, segment?.id]);

  // ── tree editing ─────────────────────────────────────────────────────────
  const patchRow = (groupIdx: number | "root", id: string, patch: Partial<ConditionRowModel>) =>
    setBuilder((b) => {
      const next = structuredClone(b);
      const rows = groupIdx === "root" ? next.rows : next.groups[groupIdx]?.rows;
      const row = rows?.find((r) => r.id === id);
      if (row) Object.assign(row, patch);
      return next;
    });

  const removeRow = (groupIdx: number | "root", id: string) =>
    setBuilder((b) => {
      const next = structuredClone(b);
      if (groupIdx === "root") next.rows = next.rows.filter((r) => r.id !== id);
      else if (next.groups[groupIdx])
        next.groups[groupIdx].rows = next.groups[groupIdx].rows.filter((r) => r.id !== id);
      return next;
    });

  const duplicateRow = (groupIdx: number | "root", id: string) =>
    setBuilder((b) => {
      const next = structuredClone(b);
      const rows = groupIdx === "root" ? next.rows : next.groups[groupIdx]?.rows;
      const row = rows?.find((r) => r.id === id);
      if (rows && row) rows.push({ ...row, id: `row_dup_${Date.now()}`, values: [...row.values] });
      return next;
    });

  const addRowFor = (entry: CatalogueEntry) => {
    if (entry.capability !== "now") return;
    setBuilder((b) => {
      const next = structuredClone(b);
      const row = rowForEntry(entry);
      if (addTarget === "root" || addTarget === null) next.rows.push(row);
      else next.groups[addTarget]?.rows.push(row);
      return next;
    });
    setAddTarget(null);
  };

  // ── AI prompt ─────────────────────────────────────────────────────────────
  const handleGenerate = async (prompt: string) => {
    setPromptBusy(true);
    const result = await generateSegment(prompt);
    setPromptBusy(false);
    if (!result.ok) {
      showToast({ tone: "error", title: "Couldn't build filters", description: result.error });
      return;
    }
    setBuilder(filterToBuilder(result.data.tree));
    if (name === "New audience definition" && result.data.name) setName(result.data.name);
    if (result.data.customClauses.length) {
      setCandidates((prev) => [
        ...prev,
        ...result.data.customClauses.map((c) => ({ ...c, status: "idle" as const })),
      ]);
      showToast({
        tone: "info",
        title: `${result.data.customClauses.length} idea(s) need a custom query`,
        description: "Compile them in the Custom queries lane below.",
      });
    }
  };

  // ── custom clauses ────────────────────────────────────────────────────────
  const attachClause = (clause: SegmentCustomClause) => {
    setCustomClauses((prev) => [...prev, clause]);
    setBuilder((b) => ({
      ...b,
      rows: [
        ...b.rows,
        { id: `row_cq_${clause.id}`, type: "custom.clause", operator: "is", param: clause.id, values: [] },
      ],
    }));
  };

  const detachClause = (clauseId: string) => {
    setCustomClauses((prev) => prev.filter((c) => c.id !== clauseId));
    setBuilder((b) => ({
      ...b,
      rows: b.rows.filter((r) => !(r.type === "custom.clause" && r.param === clauseId)),
      groups: b.groups.map((g) => ({
        ...g,
        rows: g.rows.filter((r) => !(r.type === "custom.clause" && r.param === clauseId)),
      })),
    }));
  };

  // ── save ──────────────────────────────────────────────────────────────────
  const save = async () => {
    setSaving(true);
    const payload = { name: name.trim(), filter, policy, customClauses };
    const result = segment
      ? await updateSegmentDefinition(segment.id, payload)
      : await createSegmentDefinition(payload);
    setSaving(false);
    if (!result.ok) {
      showToast({ tone: "error", title: "Save failed", description: result.error });
      return;
    }
    showToast({ tone: "success", title: segment ? "Search updated" : "Search created" });
    router.push("/audience/segments");
  };

  // ── canvas bridge (paths → builder positions) ────────────────────────────
  const canvasFormat = useCallback(
    (condition: unknown) => {
      const c = condition as { type: string } & Record<string, unknown>;
      const entry = catalogueByType[c.type];
      const label = entry?.label ?? c.type;
      if (Array.isArray(c.values)) return `${label}: ${c.values.slice(0, 3).join(", ")}${c.values.length > 3 ? "…" : ""}`;
      if (typeof c.days === "number") return `${label}: last ${c.days} days`;
      if (typeof c.value === "string") return `${label}: ${c.value}`;
      return label;
    },
    [catalogueByType],
  );

  // ── feedback states ───────────────────────────────────────────────────────
  if (catalogueError) {
    return (
      <EmptyState
        title={catalogueError.status === 403 ? "No permission" : "Couldn't load the catalogue"}
        description={
          catalogueError.status === 403
            ? "You need audience access to build searches."
            : catalogueError.message
        }
      />
    );
  }
  if (!catalogue) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-64 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="pb-16">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Search definition
          </p>
          <div className="mt-1 flex items-center gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-auto max-w-lg border-0 bg-transparent px-0 text-2xl font-semibold shadow-none focus-visible:ring-0"
              aria-label="Search name"
            />
            <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            A reusable audience query over your contacts. You define the intent; policy and the
            compliance floor apply at send time.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <div className="inline-flex overflow-hidden rounded-md border border-border">
            <button
              type="button"
              onClick={() => setView("tree")}
              className={cn(
                "flex h-9 items-center gap-1.5 px-3 text-xs font-medium",
                view === "tree" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-surface-variant",
              )}
            >
              <List className="h-3.5 w-3.5" /> Tree
            </button>
            <button
              type="button"
              onClick={() => setView("canvas")}
              className={cn(
                "flex h-9 items-center gap-1.5 px-3 text-xs font-medium",
                view === "canvas" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-surface-variant",
              )}
            >
              <GitBranch className="h-3.5 w-3.5" /> Canvas
            </button>
          </div>
          <Button onClick={save} disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
            Save search
          </Button>
        </div>
      </div>

      <div className="mb-4">
        <SegmentPrompt value={promptValue} busy={promptBusy} onChange={setPromptValue} onGenerate={handleGenerate} />
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-4">
          {view === "canvas" ? (
            <Card>
              <div className="h-[520px] w-full">
                <SegmentCanvas
                  tree={filter}
                  catalogueByType={catalogueByType}
                  formatCondition={canvasFormat}
                  onChange={(tree) => setBuilder(filterToBuilder(tree))}
                  onEditCondition={() => setView("tree")}
                  onAddCondition={(path) => setAddTarget(path.length === 0 ? "root" : path[0])}
                  counts={preview ? { matched: preview.matched, sendable: preview.sendable } : null}
                />
              </div>
            </Card>
          ) : (
            <Card>
              <div className="flex items-center gap-2 border-b border-border p-4">
                <LayerBadge n={1} />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">Your intent</p>
                  <p className="text-xs text-muted-foreground">Who you want to reach</p>
                </div>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  You define this
                </span>
              </div>
              <CardContent className="space-y-4 p-4">
                <MatchToggle value={builder.match} onChange={(m) => setBuilder((b) => ({ ...b, match: m }))} />
                {builder.rows.length === 0 && builder.groups.length === 0 && (
                  <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                    No conditions yet — this matches everyone. Add a condition or describe your
                    audience above.
                  </p>
                )}
                {builder.rows.map((row) => (
                  <ConditionRow
                    key={row.id}
                    row={row}
                    catalogue={catalogue}
                    entry={catalogueByType[row.type]}
                    clauses={customClauses}
                    onChange={(patch) => patchRow("root", row.id, patch)}
                    onDuplicate={() => duplicateRow("root", row.id)}
                    onRemove={() => removeRow("root", row.id)}
                  />
                ))}

                {builder.groups.map((group, idx) => (
                  <div key={idx} className="rounded-lg border border-border bg-surface-variant/40 p-3">
                    <div className="mb-3 flex items-center justify-between">
                      <MatchToggle
                        small
                        value={group.match}
                        onChange={(m) =>
                          setBuilder((b) => {
                            const next = structuredClone(b);
                            next.groups[idx].match = m;
                            return next;
                          })
                        }
                      />
                      <button
                        type="button"
                        aria-label="Remove group"
                        className="text-muted-foreground hover:text-error"
                        onClick={() =>
                          setBuilder((b) => ({ ...b, groups: b.groups.filter((_, i) => i !== idx) }))
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="space-y-3">
                      {group.rows.map((row) => (
                        <ConditionRow
                          key={row.id}
                          row={row}
                          catalogue={catalogue}
                          entry={catalogueByType[row.type]}
                          clauses={customClauses}
                          onChange={(patch) => patchRow(idx, row.id, patch)}
                          onDuplicate={() => duplicateRow(idx, row.id)}
                          onRemove={() => removeRow(idx, row.id)}
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setBuilder((b) => ({ ...b, groups: [...b.groups, { match: "any", rows: [] }] }))
                    }
                  >
                    <Plus className="mr-1.5 h-4 w-4" /> Add match group
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <PolicyBand policy={policy} onChange={setPolicy} />
          <ComplianceBand />
          <CustomQueryLane
            candidates={candidates}
            clauses={customClauses}
            onCandidatesChange={setCandidates}
            onAttach={attachClause}
            onDetach={detachClause}
          />
        </div>

        {/* Right: live preview */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <PreviewPanel preview={preview} busy={previewBusy} />
        </div>
      </div>

      <FormDialog
        open={addTarget !== null}
        title="Add a condition"
        description="Pick from the condition vocabulary."
        size="lg"
        submitLabel="Done"
        onSubmit={() => setAddTarget(null)}
        onClose={() => setAddTarget(null)}
      >
        <div className="space-y-4">
          {catalogue.sections.map((section) => (
            <div key={section.group}>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {section.group}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {section.entries
                  .filter((entry) => !DIALOG_EXCLUDED.has(entry.type))
                  .map((entry) => (
                    <button
                      key={entry.type}
                      type="button"
                      disabled={entry.capability !== "now"}
                      onClick={() => addRowFor(entry)}
                      className={cn(
                        "flex flex-col rounded-lg border border-border p-3 text-left transition",
                        entry.capability === "now"
                          ? "hover:border-primary hover:bg-surface-variant"
                          : "cursor-not-allowed opacity-60",
                      )}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                        {entry.label}
                        {entry.capability !== "now" && <CapBadge cap={entry.capability} />}
                      </span>
                      <span className="mt-0.5 text-xs text-muted-foreground">{entry.description}</span>
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
  value: BuilderGroup["match"];
  onChange: (m: BuilderGroup["match"]) => void;
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
              value === m.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-surface-variant",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Which feed a bespoke type's entity picker draws from. */
const PARAM_FEED: Record<string, keyof SegmentCatalogueResponse["feeds"]> = {
  "survey.responded": "surveys",
  "survey.answered": "questions",
  "event.rsvped": "events",
  "blast.received": "blasts",
  "blast.replied": "blasts",
  "journey.enrolled": "journeys",
};

function ConditionRow({
  row,
  entry,
  catalogue,
  clauses,
  onChange,
  onDuplicate,
  onRemove,
}: {
  row: ConditionRowModel;
  entry?: CatalogueEntry;
  catalogue: SegmentCatalogueResponse;
  clauses: SegmentCustomClause[];
  onChange: (patch: Partial<ConditionRowModel>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  if (!entry) {
    if (row.type === "custom.clause") {
      const clause = clauses.find((c) => c.id === row.param);
      return (
        <div className="flex items-center justify-between rounded-lg border border-border bg-background p-3">
          <span className="flex items-center gap-2 text-sm text-foreground">
            <Zap className="h-4 w-4 text-primary" /> Custom query: {clause?.label ?? row.param}
          </span>
          <button type="button" aria-label="Remove" className="text-muted-foreground hover:text-error" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      );
    }
    return null;
  }

  const Icon = KIND_ICON[entry.kind] ?? Tag;
  const draft = rowToCondition(row) == null;
  const options =
    entry.options ??
    (entry.optionsFeed ? catalogue.feeds[entry.optionsFeed as keyof typeof catalogue.feeds] : undefined);

  const feedKey = PARAM_FEED[row.type];
  const paramOptions = feedKey ? catalogue.feeds[feedKey] : undefined;
  // survey.answered / event.rsvped values come from the picked entity or static options.
  const valueOptions =
    row.type === "survey.answered"
      ? (catalogue.feeds.questions.find((q) => q.value === row.param)?.options ?? [])
      : row.type === "geo.area"
        ? undefined
        : (options as Array<{ value: string; label: string }> | undefined);

  const toggleValue = (v: string) => {
    const has = row.values.includes(v);
    onChange({ values: has ? row.values.filter((x) => x !== v) : [...row.values, v] });
  };

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border bg-background p-3",
        draft ? "border-dashed border-warning-container" : "border-border",
      )}
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{entry.label}</span>
          {draft && (
            <span className="rounded-full bg-warning-container px-1.5 py-0.5 text-[10px] font-medium text-warning-foreground">
              Incomplete
            </span>
          )}
          {entry.operators.length > 0 && (
            <Select
              value={row.operator}
              onValueChange={(op) => onChange({ operator: op })}
              aria-label="Operator"
              className="h-8 w-[140px]"
            >
              {entry.operators.map((op) => (
                <SelectItem key={op} value={op}>
                  {OPERATOR_LABELS[op] ?? op}
                </SelectItem>
              ))}
            </Select>
          )}
        </div>

        {/* Entity picker for bespoke verbs */}
        {paramOptions && (
          <Select
            value={row.param ?? ""}
            onValueChange={(v) => onChange({ param: v, values: row.type === "survey.answered" ? [] : row.values })}
            aria-label="Entity"
            className="h-8 w-[240px]"
          >
            <SelectItem value="">
              {row.type === "survey.answered" ? "Pick a question…" : "Any"}
            </SelectItem>
            {paramOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </Select>
        )}

        {/* geo.area layer picker */}
        {row.type === "geo.area" && (
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={row.param ?? ""}
              onValueChange={(v) => onChange({ param: v })}
              aria-label="Layer"
              className="h-8 w-[220px]"
            >
              <SelectItem value="">Pick a layer…</SelectItem>
              {(entry.options ?? []).map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </Select>
            <Input
              value={row.values.join(", ")}
              placeholder="Area codes, comma-separated"
              className="h-8 w-[240px]"
              onChange={(e) =>
                onChange({ values: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })
              }
            />
          </div>
        )}

        {/* Value editors by input kind */}
        {row.type !== "geo.area" && entry.valueInput === "multi" && valueOptions && valueOptions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {valueOptions.map((opt) => {
              const on = row.values.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleValue(opt.value)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs",
                    on
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-surface-variant",
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}
        {row.type !== "geo.area" && entry.valueInput === "multi" && (!valueOptions || valueOptions.length === 0) && (
          <Input
            value={row.values.join(", ")}
            placeholder="Values, comma-separated"
            className="h-8 w-[280px]"
            onChange={(e) =>
              onChange({ values: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })
            }
          />
        )}
        {entry.valueInput === "text" && (
          <Input
            value={row.values[0] ?? ""}
            placeholder={entry.label}
            className="h-8 w-[240px]"
            onChange={(e) => onChange({ values: [e.target.value] })}
          />
        )}
        {entry.valueInput === "window" && (
          <WindowEditor row={row} onChange={onChange} />
        )}
        {entry.valueInput === "single" && row.type === "event.rsvped" && entry.options && (
          <div className="flex flex-wrap gap-1.5">
            {entry.options.map((opt) => {
              const on = row.values.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleValue(opt.value)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs",
                    on
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-surface-variant",
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}
        {(row.type === "blast.received" || row.type === "blast.replied") && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            in the last
            <Input
              value={row.values[0] ?? ""}
              placeholder="any time"
              className="h-8 w-[90px]"
              onChange={(e) => onChange({ values: e.target.value ? [e.target.value] : [] })}
            />
            days
          </div>
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

function WindowEditor({
  row,
  onChange,
}: {
  row: ConditionRowModel;
  onChange: (patch: Partial<ConditionRowModel>) => void;
}) {
  if (row.operator === "before" || row.operator === "after") {
    return (
      <Input
        type="date"
        value={row.values[0] ?? ""}
        className="h-8 w-[180px]"
        onChange={(e) => onChange({ values: [e.target.value] })}
      />
    );
  }
  if (row.operator === "between") {
    return (
      <div className="flex items-center gap-2">
        <Input
          type="date"
          value={row.values[0] ?? ""}
          className="h-8 w-[170px]"
          onChange={(e) => onChange({ values: [e.target.value, row.values[1] ?? ""] })}
        />
        <span className="text-xs text-muted-foreground">to</span>
        <Input
          type="date"
          value={row.values[1] ?? ""}
          className="h-8 w-[170px]"
          onChange={(e) => onChange({ values: [row.values[0] ?? "", e.target.value] })}
        />
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Input
        value={row.values[0] ?? ""}
        className="h-8 w-[90px]"
        onChange={(e) => onChange({ values: [e.target.value] })}
      />
      days
    </div>
  );
}

function PolicyBand({
  policy,
  onChange,
}: {
  policy: SegmentPolicy;
  onChange: (p: SegmentPolicy) => void;
}) {
  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-border p-4">
        <LayerBadge n={2} />
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Policy</p>
          <p className="text-xs text-muted-foreground">Org rules — you can toggle these off</p>
        </div>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
          Overridable
        </span>
      </div>
      <CardContent className="divide-y divide-border p-0">
        <PolicyToggle
          label="Active members only"
          hint="Exclude contacts with no engagement in the last 12 months."
          checked={policy.isActive.enabled}
          onChange={(v) => onChange({ ...policy, isActive: { ...policy.isActive, enabled: v } })}
        />
        <PolicyToggle
          label="Fatigue cap"
          hint={`Skip anyone sent ${policy.fatigue.maxSends}+ blasts in the last ${policy.fatigue.windowHours}h.`}
          checked={policy.fatigue.enabled}
          onChange={(v) => onChange({ ...policy, fatigue: { ...policy.fatigue, enabled: v } })}
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
  const items = ["Channel consent", "Not suppressed", "Reachable"];
  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-border p-4">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
          <Shield className="h-3.5 w-3.5" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Compliance floor</p>
          <p className="text-xs text-muted-foreground">System layer — always applied at send</p>
        </div>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
          Locked
        </span>
      </div>
      <CardContent className="flex flex-wrap gap-2 p-4">
        {items.map((label) => (
          <span
            key={label}
            className="inline-flex items-center gap-1 rounded-full bg-surface-variant px-2.5 py-1 text-xs text-foreground"
          >
            <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--success))]" /> {label}
          </span>
        ))}
      </CardContent>
    </Card>
  );
}

function PreviewPanel({ preview, busy }: { preview: SegmentPreview | null; busy: boolean }) {
  const rows = preview
    ? [
        { label: "Match your intent", count: preview.matched },
        { label: "After policy", count: preview.shaped },
        { label: "Sendable (after the compliance floor)", count: preview.sendable },
      ]
    : [];
  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Live count {busy && <Loader2 className="h-3 w-3 animate-spin" />}
          </p>
          <p className="mt-1 font-mono text-4xl font-bold text-primary">
            {preview ? preview.sendable.toLocaleString() : "—"}
          </p>
          <p className="text-sm text-muted-foreground">people reachable now</p>
        </div>
        {preview && (
          <div className="space-y-2.5">
            {rows.map((r) => (
              <div key={r.label}>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{r.label}</span>
                  <span className="font-mono font-medium text-foreground">{r.count.toLocaleString()}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-variant">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${preview.total ? Math.round((r.count / preview.total) * 100) : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        {preview?.clauseErrors?.length ? (
          <p className="rounded-md bg-warning-container px-3 py-2 text-xs text-warning-foreground">
            {preview.clauseErrors.length} custom clause(s) failed — check the Custom queries lane.
          </p>
        ) : null}
        {preview && preview.sample.length > 0 && (
          <div className="border-t border-border pt-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Sample (send order)
            </p>
            <ul className="space-y-1">
              {preview.sample.slice(0, 6).map((s) => (
                <li key={s.contactId} className="flex items-center justify-between text-xs">
                  <span className="truncate text-foreground">{s.name ?? "—"}</span>
                  <span className="font-mono text-muted-foreground">{s.maskedPhone ?? s.maskedEmail ?? ""}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="flex items-start gap-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Counts are live engine results; the audience re-materialises at send time.
        </p>
      </CardContent>
    </Card>
  );
}
