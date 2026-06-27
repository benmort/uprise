"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, DoorOpen, Pencil, Plus, Target, TrendingUp, Users } from "lucide-react";
import { listTurfs, type TurfSummary } from "@/lib/api";
import {
  createCampaign,
  getCampaignSummary,
  listCampaigns,
  updateCampaign,
  type CampaignKpis,
  type CampaignStatus,
  type CampaignSummary,
} from "@/lib/api/campaigns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { FormDialog } from "@/components/ui/form-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiTile } from "@/components/canvass/kpi-tile";
import { MapThumbnail } from "@/components/canvass/map-thumbnail";
import { ProgressBar } from "@/components/canvass/progress-bar";
import { CampaignNavCards } from "@/components/canvass/campaign-nav-cards";
import { useToast } from "@/components/ui/toast";
import { outerRing } from "@/lib/geometry";

export default function CanvassPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [kpis, setKpis] = useState<CampaignKpis | null>(null);
  const [turfs, setTurfs] = useState<TurfSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  // Campaign create/edit dialog.
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CampaignSummary | null>(null);
  const [form, setForm] = useState({ name: "", status: "ACTIVE" as CampaignStatus, doors: "", conversations: "" });

  // Load the campaign list once, default to the first.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await listCampaigns();
      if (!alive) return;
      if (!res.ok) {
        setError(res.error);
        setLoading(false);
        return;
      }
      setCampaigns(res.data);
      setActiveId((cur) => cur || res.data[0]?.id || "");
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Load KPIs + turf for the active campaign.
  useEffect(() => {
    if (!activeId) {
      setKpis(null);
      setTurfs([]);
      return;
    }
    let alive = true;
    void (async () => {
      const [s, t] = await Promise.all([getCampaignSummary(activeId), listTurfs(activeId)]);
      if (!alive) return;
      if (s.ok) setKpis(s.data);
      if (t.ok) setTurfs(t.data);
    })();
    return () => {
      alive = false;
    };
  }, [activeId]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", status: "ACTIVE", doors: "", conversations: "" });
    setDialogOpen(true);
  };

  const openEdit = () => {
    const c = campaigns.find((x) => x.id === activeId);
    if (!c) return;
    const goals = (c.goals ?? {}) as { doors?: number; conversations?: number };
    setEditing(c);
    setForm({
      name: c.name,
      status: c.status,
      doors: goals.doors != null ? String(goals.doors) : "",
      conversations: goals.conversations != null ? String(goals.conversations) : "",
    });
    setDialogOpen(true);
  };

  const submitCampaign = useCallback(async () => {
    if (!form.name.trim()) return;
    const goals =
      form.doors || form.conversations
        ? {
            ...(form.doors ? { doors: Number(form.doors) } : {}),
            ...(form.conversations ? { conversations: Number(form.conversations) } : {}),
          }
        : undefined;
    setCreating(true);
    const res = editing
      ? await updateCampaign(editing.id, { name: form.name.trim(), status: form.status, goals })
      : await createCampaign({ name: form.name.trim(), status: form.status, goals });
    setCreating(false);
    if (!res.ok) {
      showToast({ tone: "error", title: editing ? "Couldn't update" : "Couldn't create campaign", description: res.error });
      return;
    }
    setDialogOpen(false);
    setCampaigns((cur) => (editing ? cur.map((c) => (c.id === res.data.id ? res.data : c)) : [res.data, ...cur]));
    setActiveId(res.data.id);
    showToast({ tone: "success", title: editing ? "Campaign updated" : "Campaign created", description: res.data.name });
  }, [editing, form, showToast]);

  if (loading) {
    return (
      <div className="page-stack">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-stack">
        <EmptyState title="Can't load canvassing" description={error} />
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="page-stack">
        <div>
          <h1 className="text-2xl font-extrabold">Canvassing</h1>
          <p className="text-sm text-muted-foreground">
            Create a campaign to start cutting turf and assigning volunteers.
          </p>
        </div>
        <EmptyState
          title="No campaigns yet"
          description="A campaign holds your turf, walk lists and goals."
          ctaLabel="New campaign"
          onCta={openCreate}
        />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Canvassing</h1>
          <p className="text-sm text-muted-foreground">
            Cut turf, build walk lists and track the doors.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={activeId}
            onChange={(e) => setActiveId(e.target.value)}
            className="h-9 rounded-[11px] border border-border bg-surface px-3 text-sm font-semibold text-foreground"
            aria-label="Campaign"
          >
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Button variant="outline" onClick={openCreate} disabled={creating}>
            <Plus className="mr-1.5 h-4 w-4" />
            New campaign
          </Button>
          {activeId ? (
            <Button variant="ghost" size="icon" aria-label="Edit campaign" onClick={openEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
          ) : null}
          {activeId ? (
            <Button asChild>
              <Link href={`/canvass/${activeId}/turf`}>
                <Plus className="mr-1.5 h-4 w-4" />
                Cut new turf
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {activeId ? <CampaignNavCards campaignId={activeId} id="tour-canvass-ops" /> : null}

      <div id="tour-canvass-kpis" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Doors today"
          value={kpis?.doorsToday ?? "—"}
          icon={<DoorOpen className="h-4 w-4" />}
        />
        <KpiTile
          label="Turf complete"
          value={kpis ? `${kpis.turfCompletePct}%` : "—"}
          icon={<Target className="h-4 w-4" />}
        />
        <KpiTile
          label="Contact rate"
          value={kpis ? `${kpis.contactRate}%` : "—"}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <KpiTile
          label="Volunteers out"
          value={kpis?.volunteersOut ?? "—"}
          icon={<Users className="h-4 w-4" />}
        />
      </div>

      {turfs.length === 0 ? (
        <EmptyState
          title="No turf in this campaign"
          description="Draw turf on the map, then build a walk list and assign a volunteer."
          ctaLabel={activeId ? "Cut new turf" : undefined}
          onCta={activeId ? () => router.push(`/canvass/${activeId}/turf`) : undefined}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {turfs.map((t) => {
            const pct =
              t.totalStops > 0 ? Math.round((t.visitedStops / t.totalStops) * 100) : 0;
            const status =
              t.totalStops > 0 && t.visitedStops >= t.totalStops
                ? "COMPLETED"
                : t.assignedTo
                  ? "IN_PROGRESS"
                  : "UNASSIGNED";
            return (
              <div key={t.id} className="rounded-2xl border border-border bg-surface p-3 shadow-sm">
                <MapThumbnail polygon={outerRing(t.geometry)} className="h-24 w-full" />
                <div className="mt-3 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-foreground">{t.name}</h3>
                    {t.assignedTo ? (
                      <p className="text-xs text-muted-foreground">{t.assignedTo.name}</p>
                    ) : null}
                  </div>
                  <StatusBadge status={status} />
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground tabular-nums">
                  <Users className="h-3.5 w-3.5" />
                  {t.contactCount} doors · {t.walkListCount} walk list
                  {t.walkListCount === 1 ? "" : "s"}
                </p>
                <ProgressBar
                  className="mt-3"
                  value={t.visitedStops}
                  max={t.totalStops || 1}
                  label={
                    <>
                      <span>Knocked</span>
                      <span>
                        {t.visitedStops}/{t.totalStops} · {pct}%
                      </span>
                    </>
                  }
                />
                <div className="mt-3 flex justify-end">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/canvass/${t.campaignId ?? activeId}/walklists?turfId=${t.id}`}>
                      Manage
                      <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <FormDialog
        open={dialogOpen}
        title={editing ? "Edit campaign" : "New campaign"}
        onClose={() => setDialogOpen(false)}
        onSubmit={submitCampaign}
        submitLabel={editing ? "Save" : "Create"}
        busy={creating}
        submitDisabled={!form.name.trim()}
      >
        <Field label="Campaign name" htmlFor="camp-name" required>
          <Input
            id="camp-name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Spring doorknock"
            autoFocus
          />
        </Field>
        {editing ? (
          <Field label="Status" htmlFor="camp-status">
            <Select
              id="camp-status"
              value={form.status}
              onValueChange={(v) => setForm((f) => ({ ...f, status: v as CampaignStatus }))}
            >
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="ARCHIVED">Archived</SelectItem>
            </Select>
          </Field>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Doors goal" htmlFor="camp-doors">
            <Input
              id="camp-doors"
              type="number"
              value={form.doors}
              onChange={(e) => setForm((f) => ({ ...f, doors: e.target.value }))}
              placeholder="Optional"
            />
          </Field>
          <Field label="Conversations goal" htmlFor="camp-conv">
            <Input
              id="camp-conv"
              type="number"
              value={form.conversations}
              onChange={(e) => setForm((f) => ({ ...f, conversations: e.target.value }))}
              placeholder="Optional"
            />
          </Field>
        </div>
      </FormDialog>
    </div>
  );
}
