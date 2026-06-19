"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, GitBranch, Play, Plus, Save, Trash2, Workflow, Zap } from "lucide-react";
import {
  createJourney,
  deleteJourney,
  dryRunJourney,
  getJourneyStats,
  listJourneys,
  setJourneyStatus,
  updateJourney,
  type Journey,
  type JourneyRung,
  type JourneyRungType,
  type JourneyStats,
  type JourneyTriggerType,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { SectionCard } from "@/components/canvass/section-card";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const TRIGGERS: Array<{ value: JourneyTriggerType; label: string }> = [
  { value: "disposition_set", label: "Disposition set" },
  { value: "message_received", label: "Message received" },
  { value: "survey_answer", label: "Survey answer" },
  { value: "tag_added", label: "Tag added" },
  { value: "no_answer_after", label: "No answer after" },
];

const RUNG_META: Record<JourneyRungType, { label: string; icon: typeof Clock; tint: string }> = {
  wait: { label: "Wait", icon: Clock, tint: "border-warning/40 bg-warning-container/40" },
  condition: { label: "Condition", icon: GitBranch, tint: "border-primary/40 bg-primary-container/40" },
  action: { label: "Action", icon: Zap, tint: "border-[hsl(var(--knock))]/40 bg-[hsl(var(--knock))]/[0.07]" },
};

function rungSummary(r: JourneyRung): string {
  if (r.type === "wait") return `${(r.config.minutes as number) ?? 0} min`;
  if (r.type === "action") return String(r.config.kind ?? "send_text");
  return String(r.config.expr ?? "—");
}

export default function JourneysPage() {
  const { showToast } = useToast();
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>("");
  const [draft, setDraft] = useState<Journey | null>(null);
  const [stats, setStats] = useState<JourneyStats | null>(null);
  const [preview, setPreview] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await listJourneys();
    if (res.ok) {
      setJourneys(res.data);
      setSelectedId((cur) => cur || res.data[0]?.id || "");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Sync the editable draft + stats when selection changes.
  useEffect(() => {
    const j = journeys.find((x) => x.id === selectedId) ?? null;
    setDraft(j ? structuredClone(j) : null);
    setPreview(null);
    if (selectedId) void getJourneyStats(selectedId).then((r) => r.ok && setStats(r.data));
    else setStats(null);
  }, [selectedId, journeys]);

  const handleCreate = useCallback(async () => {
    const name = window.prompt("Name this journey");
    if (!name?.trim()) return;
    const res = await createJourney({ name: name.trim(), triggerType: "disposition_set" });
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't create", description: res.error });
      return;
    }
    await load();
    setSelectedId(res.data.id);
  }, [load, showToast]);

  const addRung = (type: JourneyRungType) => {
    if (!draft) return;
    // Defaults match the backend's expected config shape (journeys.service.ts:
    // executeAction kinds p2p_text/to_inbox/door_task/tag; evaluateCondition
    // kinds disposition/answered) so an unedited rung isn't silently a no-op.
    const config: Record<string, unknown> =
      type === "wait"
        ? { minutes: 60 }
        : type === "action"
          ? { kind: "p2p_text", body: "" }
          : { kind: "disposition", code: "" };
    setDraft({
      ...draft,
      rungs: [...draft.rungs, { rungIndex: draft.rungs.length, type, config }],
    });
  };

  const removeRung = (idx: number) => {
    if (!draft) return;
    setDraft({
      ...draft,
      rungs: draft.rungs.filter((_, i) => i !== idx).map((r, i) => ({ ...r, rungIndex: i })),
    });
  };

  const setRungConfig = (idx: number, config: Record<string, unknown>) => {
    if (!draft) return;
    setDraft({
      ...draft,
      rungs: draft.rungs.map((r, i) => (i === idx ? { ...r, config } : r)),
    });
  };

  const handleSave = useCallback(async () => {
    if (!draft) return;
    // Validate before persisting — the backend accepts any rung array, so a broken
    // config (no steps, non-positive wait, empty text/condition) would save and then
    // silently fail at run time.
    const problem = validateRungs(draft.rungs);
    if (problem) {
      showToast({ tone: "error", title: "Can't save journey", description: problem });
      return;
    }
    setBusy(true);
    const res = await updateJourney(draft.id, {
      name: draft.name,
      triggerType: draft.triggerType,
      rungs: draft.rungs.map((r, i) => ({ rungIndex: i, type: r.type, config: r.config })),
    });
    setBusy(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't save", description: res.error });
      return;
    }
    await load();
    showToast({ tone: "success", title: "Journey saved" });
  }, [draft, load, showToast]);

  const toggleStatus = useCallback(async () => {
    if (!draft) return;
    const next = draft.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    const res = await setJourneyStatus(draft.id, next);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't change status", description: res.error });
      return;
    }
    await load();
    showToast({ tone: "success", title: next === "ACTIVE" ? "Journey activated" : "Journey paused" });
  }, [draft, load, showToast]);

  const handleDryRun = useCallback(async () => {
    if (!draft) return;
    const res = await dryRunJourney(draft.id);
    if (!res.ok) {
      showToast({ tone: "error", title: "Dry run failed", description: res.error });
      return;
    }
    setPreview([
      `Trigger: ${res.data.trigger.type}`,
      ...res.data.steps.map((s) => `${s.rungIndex + 1}. ${s.label}`),
    ]);
  }, [draft, showToast]);

  const handleDelete = useCallback(async () => {
    if (!draft || !window.confirm(`Delete “${draft.name}”?`)) return;
    const res = await deleteJourney(draft.id);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't delete", description: res.error });
      return;
    }
    setSelectedId("");
    await load();
    showToast({ tone: "success", title: "Journey deleted" });
  }, [draft, load, showToast]);

  if (loading) return <div className="page-stack"><Skeleton className="h-64 w-full" /></div>;

  return (
    <div className="page-stack">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">Journeys</h1>
          <p className="text-sm text-muted-foreground">Cross-channel automations.</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-1.5 h-4 w-4" />
          New journey
        </Button>
      </div>

      {journeys.length === 0 ? (
        <EmptyState
          title="No journeys yet"
          description="Build a trigger → wait → action flow to automate follow-up."
          ctaLabel="New journey"
          onCta={handleCreate}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          {/* Journey list */}
          <div className="space-y-2">
            {journeys.map((j) => (
              <button
                key={j.id}
                type="button"
                onClick={() => setSelectedId(j.id)}
                className={cn(
                  "w-full rounded-xl border p-3 text-left transition",
                  j.id === selectedId ? "border-primary bg-[#eef2fd]" : "border-border bg-white hover:bg-surface-variant",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-semibold text-foreground">
                    <Workflow className="h-3.5 w-3.5 text-primary" />
                    {j.name}
                  </span>
                  <StatusBadge status={j.status === "ACTIVE" ? "ACTIVE" : "DRAFTED"} />
                </div>
              </button>
            ))}
          </div>

          {/* Builder */}
          {draft ? (
            <SectionCard
              title={
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="h-8 max-w-xs"
                />
              }
              action={
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={handleDryRun}>
                    <Play className="mr-1.5 h-3.5 w-3.5" />
                    Dry run
                  </Button>
                  <Button size="sm" variant="outline" onClick={toggleStatus}>
                    {draft.status === "ACTIVE" ? "Pause" : "Activate"}
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={busy}>
                    <Save className="mr-1.5 h-3.5 w-3.5" />
                    Save
                  </Button>
                </div>
              }
            >
              {stats ? (
                <p className="mb-3 text-sm text-muted-foreground tabular-nums">
                  {stats.enrolled} enrolled · {stats.completed} completed · {stats.conversionPct}% conversion
                </p>
              ) : null}

              {/* Trigger node */}
              <div className="rounded-xl border border-success/40 bg-success-container/40 p-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-success">Trigger</p>
                <select
                  value={draft.triggerType}
                  onChange={(e) => setDraft({ ...draft, triggerType: e.target.value as JourneyTriggerType })}
                  className="mt-1 h-9 w-full rounded-lg border border-border bg-white px-2 text-sm"
                >
                  {TRIGGERS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Rung nodes */}
              {draft.rungs.map((r, i) => {
                const meta = RUNG_META[r.type];
                const Icon = meta.icon;
                return (
                  <div key={i}>
                    <div className="mx-auto my-1 h-3 w-px bg-border" />
                    <div className={cn("flex items-center gap-3 rounded-xl border p-3", meta.tint)}>
                      <Icon className="h-4 w-4 shrink-0 text-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">{meta.label}</p>
                        <RungConfigEditor rung={r} onChange={(c) => setRungConfig(i, c)} />
                      </div>
                      <span className="text-xs text-muted-foreground">{rungSummary(r)}</span>
                      <button
                        type="button"
                        aria-label="Remove step"
                        onClick={() => removeRung(i)}
                        className="text-muted-foreground hover:text-error"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Palette */}
              <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
                <span className="text-xs font-semibold text-muted-foreground">Add step:</span>
                {(["wait", "condition", "action"] as JourneyRungType[]).map((t) => (
                  <Button key={t} size="sm" variant="outline" onClick={() => addRung(t)}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    {RUNG_META[t].label}
                  </Button>
                ))}
                <Button size="sm" variant="ghost" className="ml-auto text-error" onClick={handleDelete}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Delete journey
                </Button>
              </div>

              {preview ? (
                <div className="mt-4 rounded-xl border border-border bg-surface/60 p-3">
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
                    Dry run
                  </p>
                  <ul className="space-y-0.5 text-sm text-foreground">
                    {preview.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </SectionCard>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Tiny per-type config input so each node is editable inline. */
function RungConfigEditor({
  rung,
  onChange,
}: {
  rung: JourneyRung;
  onChange: (config: Record<string, unknown>) => void;
}) {
  if (rung.type === "wait") {
    return (
      <input
        type="number"
        value={Number(rung.config.minutes ?? 0)}
        onChange={(e) => onChange({ minutes: Number(e.target.value) })}
        className="mt-1 h-7 w-24 rounded border border-border px-2 text-xs"
        aria-label="Wait minutes"
      />
    );
  }
  if (rung.type === "action") {
    const kind = String(rung.config.kind ?? "p2p_text");
    return (
      <div className="mt-1 space-y-1">
        <select
          value={kind}
          onChange={(e) => onChange({ ...rung.config, kind: e.target.value })}
          className="h-7 rounded border border-border px-2 text-xs"
          aria-label="Action kind"
        >
          <option value="p2p_text">Queue P2P text</option>
          <option value="to_inbox">Hand to inbox</option>
          <option value="door_task">Create door task</option>
          <option value="tag">Add tag</option>
        </select>
        {kind === "p2p_text" ? (
          <textarea
            value={String(rung.config.body ?? "")}
            onChange={(e) => onChange({ ...rung.config, body: e.target.value })}
            placeholder="Message body"
            rows={2}
            className="w-full rounded border border-border px-2 py-1 text-xs"
            aria-label="Text message body"
          />
        ) : null}
        {kind === "tag" ? (
          <input
            type="text"
            value={String(rung.config.tag ?? "")}
            onChange={(e) => onChange({ ...rung.config, tag: e.target.value })}
            placeholder="Tag"
            className="h-7 w-full rounded border border-border px-2 text-xs"
            aria-label="Tag"
          />
        ) : null}
      </div>
    );
  }
  // Condition: backend evaluateCondition switches on `kind` (disposition | answered).
  const ckind = String(rung.config.kind ?? "disposition");
  return (
    <div className="mt-1 space-y-1">
      <select
        value={ckind}
        onChange={(e) => onChange({ ...rung.config, kind: e.target.value })}
        className="h-7 rounded border border-border px-2 text-xs"
        aria-label="Condition kind"
      >
        <option value="disposition">Has disposition</option>
        <option value="answered">Answered a question</option>
      </select>
      {ckind === "disposition" ? (
        <input
          type="text"
          value={String(rung.config.code ?? "")}
          onChange={(e) => onChange({ ...rung.config, code: e.target.value })}
          placeholder="disposition code, e.g. spoke_to_target"
          className="h-7 w-full rounded border border-border px-2 text-xs"
          aria-label="Disposition code"
        />
      ) : (
        <input
          type="text"
          value={String(rung.config.questionId ?? "")}
          onChange={(e) => onChange({ ...rung.config, questionId: e.target.value })}
          placeholder="question id (optional — any answer if blank)"
          className="h-7 w-full rounded border border-border px-2 text-xs"
          aria-label="Question id"
        />
      )}
    </div>
  );
}

/** Validate rungs before save — returns a human message if invalid, else null. */
function validateRungs(rungs: JourneyRung[]): string | null {
  if (!rungs.length) return "Add at least one step (wait, condition or action) before saving.";
  for (let i = 0; i < rungs.length; i += 1) {
    const { type, config } = rungs[i];
    const at = `Step ${i + 1}`;
    if (type === "wait" && !(Number(config.minutes) >= 1)) return `${at}: wait must be at least 1 minute.`;
    if (type === "action") {
      const kind = String(config.kind ?? "");
      if (!kind) return `${at}: choose an action.`;
      if (kind === "p2p_text" && !String(config.body ?? "").trim()) return `${at}: enter the text message body.`;
      if (kind === "tag" && !String(config.tag ?? "").trim()) return `${at}: enter a tag.`;
    }
    if (type === "condition" && !String(config.kind ?? "").trim()) return `${at}: choose a condition.`;
  }
  return null;
}
