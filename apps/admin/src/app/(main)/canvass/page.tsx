"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, DoorOpen, MapPin, MapPinned, Pencil, Plus, PlusCircle, Target, Trash2, TrendingUp, Users } from "lucide-react";
import { listTurfs, type TurfSummary } from "@/lib/api";
import {
  createCampaign,
  deleteCampaign,
  getCampaignSummary,
  listCampaigns,
  updateCampaign,
  type CampaignChannel,
  type CampaignKpis,
  type CampaignStatus,
  type CampaignSummary,
} from "@/lib/api/campaigns";
import { Button } from "@/components/ui/button";
import { CampaignSwitcher } from "@/components/canvass/campaign-switcher";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { FormDialog } from "@/components/ui/form-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiTile } from "@uprise/field";
import { MapThumbnail } from "@uprise/field";
import { ProgressBar } from "@uprise/field";
import { CampaignNavCards } from "@uprise/field";
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
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Campaign create/edit dialog.
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CampaignSummary | null>(null);
  const [form, setForm] = useState({ name: "", status: "ACTIVE" as CampaignStatus, channel: "BOTH" as CampaignChannel, doors: "", conversations: "", openJoin: false, selfClaim: false });

  // Load the campaign list once; the active campaign comes from ?campaign= when
  // it names a real campaign (shareable/deep-linkable), else the first campaign.
  // window.location instead of useSearchParams: this page prerenders statically,
  // and useSearchParams would force a Suspense boundary for one mount-time read.
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
      const urlId = new URLSearchParams(window.location.search).get("campaign");
      const fromUrl = urlId && res.data.some((c) => c.id === urlId) ? urlId : "";
      setActiveId((cur) => cur || fromUrl || res.data[0]?.id || "");
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Reflect the selection in the URL so reloads and shared links keep it.
  useEffect(() => {
    if (!activeId) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("campaign") === activeId) return;
    url.searchParams.set("campaign", activeId);
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
  }, [activeId, router]);

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

  // "New campaign" mirrors "New blast": create a campaign with a default name and
  // drop the user straight into it (cut turf). Works from any state — no modal to
  // mount — so the empty-state CTA and the header button both use it. Rename/goals
  // happen via the edit dialog (the pencil) once the campaign exists.
  const onNewCampaign = async () => {
    setCreating(true);
    const res = await createCampaign({ name: "New campaign", status: "ACTIVE" });
    setCreating(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't create campaign", description: res.error });
      return;
    }
    showToast({ tone: "success", title: "Campaign created", description: "Now cut some turf." });
    router.push(`/canvass/${res.data.id}/turf`);
  };

  const openEdit = () => {
    const c = campaigns.find((x) => x.id === activeId);
    if (!c) return;
    const goals = (c.goals ?? {}) as { doors?: number; conversations?: number };
    setEditing(c);
    setForm({
      name: c.name,
      status: c.status,
      channel: c.channel,
      doors: goals.doors != null ? String(goals.doors) : "",
      conversations: goals.conversations != null ? String(goals.conversations) : "",
      openJoin: c.openJoinEnabled,
      selfClaim: c.volunteerCanSelfClaimTurf ?? false,
    });
    setDialogOpen(true);
  };

  // Delete the active campaign. Its turf/walk lists survive (schema SetNull); we just
  // drop it from the list and fall back to the next campaign (or the empty state).
  const onDeleteCampaign = async () => {
    const c = campaigns.find((x) => x.id === activeId);
    if (!c) return;
    setDeleting(true);
    const res = await deleteCampaign(c.id);
    setDeleting(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't delete campaign", description: res.error });
      return;
    }
    setConfirmDelete(false);
    const remaining = campaigns.filter((x) => x.id !== c.id);
    setCampaigns(remaining);
    setActiveId(remaining[0]?.id ?? "");
    showToast({ tone: "success", title: "Campaign deleted", description: c.name });
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
      ? await updateCampaign(editing.id, { name: form.name.trim(), status: form.status, channel: form.channel, goals, openJoinEnabled: form.openJoin, volunteerCanSelfClaimTurf: form.selfClaim })
      : await createCampaign({ name: form.name.trim(), status: form.status, channel: form.channel, goals, openJoinEnabled: form.openJoin, volunteerCanSelfClaimTurf: form.selfClaim });
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

  // Shareable tokenless-join link for the open-join toggle (auth app, per campaign).
  const joinLink = editing
    ? `${process.env.NEXT_PUBLIC_AUTH_APP_URL || "http://localhost:3002"}/volunteer/${editing.id}`
    : "";

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
          <div className="flex items-center gap-2">
            <MapPin className="h-6 w-6 shrink-0 text-primary" />
            <h1 className="text-2xl font-extrabold">Canvassing</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Create a campaign to start cutting turf and assigning volunteers.
          </p>
        </div>
        <EmptyState
          title="No campaigns yet"
          description="A campaign holds your turf, walk lists and goals."
          ctaLabel="New campaign"
          onCta={() => void onNewCampaign()}
        />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <MapPin className="h-6 w-6 shrink-0 text-primary" />
            <h1 className="text-2xl font-extrabold">Canvassing</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Cut turf, build walk lists and track the doors.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CampaignSwitcher campaigns={campaigns} activeId={activeId} onSelect={setActiveId} />
          <Button variant="outline" onClick={() => void onNewCampaign()} disabled={creating}>
            <PlusCircle className="mr-1.5 h-4 w-4" />
            New campaign
          </Button>
          {activeId ? (
            <Button variant="ghost" size="icon" aria-label="Edit campaign" onClick={openEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
          ) : null}
          {activeId ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete campaign"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4 text-error" />
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
        <Field label="Medium" htmlFor="camp-channel">
          <Select
            id="camp-channel"
            value={form.channel}
            onValueChange={(v) => setForm((f) => ({ ...f, channel: v as CampaignChannel }))}
          >
            <SelectItem value="BOTH">Doors + SMS</SelectItem>
            <SelectItem value="DOOR">Doors</SelectItem>
            <SelectItem value="SMS">SMS</SelectItem>
          </Select>
        </Field>
        {editing ? (
          <Field label="Open join" htmlFor="camp-open-join">
            <label className="flex items-start gap-2.5 text-sm">
              <input
                id="camp-open-join"
                type="checkbox"
                checked={form.openJoin}
                onChange={(e) => setForm((f) => ({ ...f, openJoin: e.target.checked }))}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span className="text-muted-foreground">
                Let anyone with the link join this campaign as a canvasser – no invite needed. Needs an
                <span className="font-medium text-foreground"> Active</span> campaign.
              </span>
            </label>
          </Field>
        ) : null}
        {editing && form.openJoin ? (
          <Field label="Shareable join link" htmlFor="camp-join-link">
            <div className="flex gap-2">
              <Input id="camp-join-link" readOnly value={joinLink} onFocus={(e) => e.currentTarget.select()} />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard?.writeText(joinLink);
                  showToast({ tone: "success", title: "Link copied" });
                }}
              >
                Copy
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Save to activate. Anyone with this link can join as a canvasser, and each join uses a team seat –
              share carefully.
            </p>
          </Field>
        ) : null}
        {editing ? (
          <Field label="Volunteer self-serve turf" htmlFor="camp-self-claim">
            <label className="flex items-start gap-2.5 text-sm">
              <input
                id="camp-self-claim"
                type="checkbox"
                checked={form.selfClaim}
                onChange={(e) => setForm((f) => ({ ...f, selfClaim: e.target.checked }))}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span className="text-muted-foreground">
                Let volunteers claim or cut their own turf – within the campaign
                <span className="font-medium text-foreground"> boundary</span> – without waiting for an
                organiser. Set a boundary first.
              </span>
            </label>
          </Field>
        ) : null}
        {editing ? (
          <Field label="Campaign boundary" htmlFor="camp-boundary">
            <Link
              href={`/canvass/${editing.id}/boundary`}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-variant"
            >
              <MapPinned className="h-4 w-4" />
              {editing.hasBoundary ? "Edit boundary" : "Set boundary"}
            </Link>
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

      <ConfirmDialog
        open={confirmDelete}
        title="Delete campaign"
        description={`Permanently delete "${campaigns.find((c) => c.id === activeId)?.name ?? "this campaign"}"? This can't be undone. Its turf and walk lists are kept but will no longer belong to a campaign.`}
        confirmLabel="Delete campaign"
        onConfirm={() => void onDeleteCampaign()}
        onCancel={() => setConfirmDelete(false)}
        busy={deleting}
      />
    </div>
  );
}
