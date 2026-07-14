"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ListOrdered, Lock, Navigation, RefreshCw, UserMinus, UserPlus } from "lucide-react";
import { CampaignPageHeader } from "@/components/canvass/campaign-page-header";
import {
  assignTurf,
  createWalkList,
  getTurfRoute,
  listVolunteers,
  listTurfContacts,
  listTurfs,
  listWalkLists,
  reassignTurf,
  unassignTurf,
  updateWalkList,
  type TurfContact,
  type TurfRoute,
  type TurfSummary,
  type WalkListSummary,
} from "@/lib/api";
import { optimiseRoute, formatDistance, formatDuration, type Stop, WalkView, type CanvassAssignment } from "@uprise/field";
import { buildWalkGroups, doorNumber, stopLabel } from "@/lib/canvass/walk-list";
import { FormSelect } from "@uprise/ui";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { FormDialog } from "@/components/ui/form-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { StatusBadge } from "@/components/ui/status-badge";
import { SectionCard } from "@uprise/field";
import { StateRegion } from "@/components/shell/state-region";
import { Pencil } from "lucide-react";
import { useToast } from "@/components/ui/toast";

type Volunteer = { id: string; displayName: string; email: string | null; role: string };
type ListType = "STATIC" | "DYNAMIC";

// A turf can hold thousands of doors; the route is grouped by street, and we render a page of
// street GROUPS at a time so a big list doesn't stall the page (the whole route is optimised + saved).
const GROUPS_PER_PAGE = 20;

export default function WalkListBuilderPage() {
  const params = useParams<{ campaignId: string }>();
  const campaignId = params.campaignId;
  const search = useSearchParams();
  const { showToast } = useToast();

  const [turfs, setTurfs] = useState<TurfSummary[]>([]);
  const [turfId, setTurfId] = useState<string>(search.get("turfId") ?? "");
  const [contacts, setContacts] = useState<TurfContact[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [route, setRoute] = useState<TurfRoute | null>(null);
  const [walkLists, setWalkLists] = useState<WalkListSummary[]>([]);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [listType, setListType] = useState<ListType>("STATIC");
  const [name, setName] = useState("");
  const [selectedVolunteer, setSelectedVolunteer] = useState("");
  const [loading, setLoading] = useState(true);
  const [turfLoading, setTurfLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noPermission, setNoPermission] = useState(false);

  const [showPreview, setShowPreview] = useState(true);
  const [editingWl, setEditingWl] = useState<WalkListSummary | null>(null);
  const [wlForm, setWlForm] = useState<{ name: string; listType: ListType }>({ name: "", listType: "STATIC" });
  const [wlBusy, setWlBusy] = useState(false);

  const activeTurf = turfs.find((t) => t.id === turfId) ?? null;

  // Bootstrap: turfs + volunteers. Surfaces load failures instead of swallowing
  // them – turfs is the primary resource, so its error drives the page state.
  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNoPermission(false);
    const [t, c] = await Promise.all([listTurfs(campaignId), listVolunteers()]);
    if (!t.ok) {
      setNoPermission(t.status === 403);
      setError(t.error);
      setLoading(false);
      return;
    }
    setTurfs(t.data);
    setTurfId((cur) => cur || t.data[0]?.id || "");
    if (c.ok) setVolunteers(c.data);
    setLoading(false);
  }, [campaignId]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // Client-side fallback ordering (no legs) — used only if the server route endpoint fails.
  const optimise = useCallback((cs: TurfContact[]) => {
    const stops: Stop[] = cs.map((c) => ({ id: c.id, lat: c.lat ?? NaN, lng: c.lng ?? NaN }));
    setOrder(optimiseRoute(stops).map((s) => s.id));
  }, []);

  // The optimised order + per-leg walking metrics come from the server (real Mapbox walking,
  // batched). Falls back to client-side ordering (no legs) if the endpoint is unavailable.
  const loadRoute = useCallback(
    async (cs: TurfContact[]) => {
      const r = await getTurfRoute(turfId);
      if (r.ok) {
        setRoute(r.data);
        setOrder(r.data.ordered);
      } else {
        setRoute(null);
        optimise(cs);
      }
    },
    [turfId, optimise],
  );

  // Load the selected turf's contacts + existing walk lists + the optimised route.
  const loadTurf = useCallback(async () => {
    if (!turfId) return;
    setTurfLoading(true);
    try {
      const [cs, wls] = await Promise.all([listTurfContacts(turfId), listWalkLists(turfId)]);
      if (cs.ok) {
        setContacts(cs.data);
        await loadRoute(cs.data);
      }
      if (wls.ok) setWalkLists(wls.data);
    } finally {
      setTurfLoading(false);
    }
  }, [turfId, loadRoute]);

  const reoptimise = useCallback(async () => {
    setTurfLoading(true);
    try {
      await loadRoute(contacts);
    } finally {
      setTurfLoading(false);
    }
  }, [loadRoute, contacts]);

  useEffect(() => {
    void loadTurf();
  }, [loadTurf]);

  const orderedContacts = useMemo(() => {
    const byId = new Map(contacts.map((c) => [c.id, c]));
    return order.map((id) => byId.get(id)).filter((c): c is TurfContact => Boolean(c));
  }, [order, contacts]);

  // Group consecutive stops on the same street (fallback suburb), in walking order, with the
  // leaving-leg attached to each group. The classic walk-list shape.
  const groups = useMemo(
    () => buildWalkGroups(contacts, order, route?.legs ?? []).groups,
    [contacts, order, route],
  );
  // Render a page of street groups at a time (a big turf can hold thousands of stops).
  const pagedGroups = useMemo(
    () => groups.slice(page * GROUPS_PER_PAGE, page * GROUPS_PER_PAGE + GROUPS_PER_PAGE),
    [groups, page],
  );
  // Back to the first page when the turf or the route order changes.
  useEffect(() => setPage(0), [turfId, order]);

  // Synthesise the canvasser's assignment so we can embed the SAME field WalkView
  // (map + walking directions) here, read-only — one component, zero duplication.
  const previewAssignment = useMemo<CanvassAssignment | null>(() => {
    if (!activeTurf) return null;
    return {
      turfId: activeTurf.id,
      lockedUntil: null,
      turf: {
        id: activeTurf.id,
        name: activeTurf.name,
        geometry: activeTurf.geometry,
        campaignId,
      },
      walkLists: [
        {
          id: "preview",
          name: "Preview",
          items: orderedContacts.map((c, i) => ({
            id: c.id,
            orderIndex: i,
            status: "PENDING" as const,
            contact: {
              id: c.id,
              firstName: c.firstName,
              lastName: c.lastName,
              address: c.address,
              lat: c.lat,
              lng: c.lng,
            },
          })),
        },
      ],
    };
  }, [activeTurf, orderedContacts, campaignId]);

  const handleCreate = useCallback(async () => {
    if (!turfId || orderedContacts.length === 0) return;
    const listName = name.trim() || `${activeTurf?.name ?? "Turf"} walk list`;
    setBusy(true);
    const res = await createWalkList(
      listName,
      orderedContacts.map((c) => c.id),
      turfId,
      campaignId,
      listType,
    );
    setBusy(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't build walk list", description: res.error });
      return;
    }
    setName("");
    await loadTurf();
    showToast({ tone: "success", title: `Built “${listName}”`, description: `${orderedContacts.length} stops.` });
  }, [turfId, orderedContacts, name, activeTurf, campaignId, listType, loadTurf, showToast]);

  const openEditWl = (w: WalkListSummary) => {
    setEditingWl(w);
    setWlForm({ name: w.name, listType: w.listType });
  };

  const submitEditWl = useCallback(async () => {
    if (!editingWl || !wlForm.name.trim()) return;
    setWlBusy(true);
    const res = await updateWalkList(editingWl.id, { name: wlForm.name.trim(), listType: wlForm.listType });
    setWlBusy(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't update walk list", description: res.error });
      return;
    }
    setEditingWl(null);
    await loadTurf();
    showToast({ tone: "success", title: "Walk list updated" });
  }, [editingWl, wlForm, loadTurf, showToast]);

  const handleAssign = useCallback(async () => {
    if (!turfId || !selectedVolunteer) return;
    setBusy(true);
    const res = await assignTurf(turfId, selectedVolunteer);
    setBusy(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't assign turf", description: res.error });
      return;
    }
    const [t] = await Promise.all([listTurfs(campaignId), loadTurf()]);
    if (t.ok) setTurfs(t.data);
    showToast({ tone: "success", title: "Turf assigned" });
  }, [turfId, selectedVolunteer, campaignId, loadTurf, showToast]);

  const handleUnassign = useCallback(async () => {
    if (!turfId) return;
    setBusy(true);
    const res = await unassignTurf(turfId);
    setBusy(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't unassign turf", description: res.error });
      return;
    }
    const [t] = await Promise.all([listTurfs(campaignId), loadTurf()]);
    if (t.ok) setTurfs(t.data);
    showToast({ tone: "success", title: "Turf unassigned" });
  }, [turfId, campaignId, loadTurf, showToast]);

  const handleReassign = useCallback(async () => {
    if (!turfId || !selectedVolunteer) return;
    setBusy(true);
    const res = await reassignTurf(turfId, selectedVolunteer);
    setBusy(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't reassign turf", description: res.error });
      return;
    }
    setSelectedVolunteer("");
    const [t] = await Promise.all([listTurfs(campaignId), loadTurf()]);
    if (t.ok) setTurfs(t.data);
    showToast({ tone: "success", title: "Turf reassigned" });
  }, [turfId, selectedVolunteer, campaignId, loadTurf, showToast]);

  if (loading) {
    return (
      <div className="page-stack">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-[50vh] w-full" />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <CampaignPageHeader
        title="Walk lists"
        icon={ListOrdered}
        actions={
          <Select value={turfId} onValueChange={setTurfId} className="max-w-xs font-semibold" aria-label="Turf">
            {turfs.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </Select>
        }
      />

      <StateRegion error={error} noPermission={noPermission} onRetry={() => void bootstrap()}>
      {turfs.length === 0 ? (
        <SectionCard title="No turf yet">
          <p className="text-sm text-muted-foreground">
            Cut turf first, then come back to build and assign walk lists.
          </p>
          <Button asChild className="mt-3">
            <Link href={`/canvass/${campaignId}/turf`}>Cut turf</Link>
          </Button>
        </SectionCard>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <SectionCard
            title="Optimised route"
            description={
              route
                ? `${orderedContacts.length} stops · ${groups.length} street${groups.length === 1 ? "" : "s"} · ${formatDistance(route.totalM)} · ${formatDuration(route.totalS)}${route.source === "crowflies" ? " (estimated)" : ""}`
                : `${orderedContacts.length} stops · shortest walking path`
            }
            action={
              <Button variant="outline" size="sm" onClick={() => void reoptimise()} disabled={turfLoading}>
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${turfLoading ? "animate-spin" : ""}`} />
                Re-optimise
              </Button>
            }
          >
            {turfLoading ? (
              <div className="space-y-1.5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-xl" />
                ))}
              </div>
            ) : orderedContacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No contacts bucketed into this turf. Re-bucket it from the turf-cutting map.
              </p>
            ) : (
              <>
                <ol className="space-y-2.5">
                  {pagedGroups.map((g) => (
                    <li key={g.key + g.stops[0].id}>
                      {/* Street header */}
                      <div className="flex items-baseline gap-2 px-1">
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 px-1 text-[11px] font-bold tabular-nums text-primary dark:bg-primary/20">
                          {g.stops[0].seq}
                        </span>
                        <h3 className="truncate text-sm font-extrabold text-foreground">
                          {g.street ?? g.locality ?? "Unknown street"}
                          {g.street && g.locality ? (
                            <span className="ml-1.5 text-xs font-medium text-muted-foreground">{g.locality}</span>
                          ) : null}
                        </h3>
                        <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
                          {g.stops.length} door{g.stops.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      {/* Doors on this street, in walking order */}
                      <ul className="mt-1 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
                        {g.stops.map((s) => {
                          const name = [s.firstName, s.lastName].filter(Boolean).join(" ");
                          return (
                            <li key={s.id} className="flex items-center gap-3 px-3 py-1.5">
                              <span className="w-10 shrink-0 text-sm font-bold tabular-nums text-foreground">
                                {doorNumber(s)}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                                {name || <span className="text-muted-foreground">{stopLabel(s)}</span>}
                              </span>
                              {name ? (
                                <span className="shrink-0 rounded-full bg-surface-variant px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                                  Known
                                </span>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                      {/* Walking leg to the next street group */}
                      {g.legToNext ? (
                        <div className="flex items-center gap-1.5 py-1 pl-3 text-[11px] font-medium text-muted-foreground">
                          <Navigation className="h-3 w-3 shrink-0 text-primary" aria-hidden />
                          {formatDistance(g.legToNext.distanceM)} · {formatDuration(g.legToNext.durationS)} to the next street
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ol>
                {groups.length > GROUPS_PER_PAGE ? (
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <p className="text-xs tabular-nums text-muted-foreground">
                      Streets {page * GROUPS_PER_PAGE + 1}–{Math.min((page + 1) * GROUPS_PER_PAGE, groups.length)} of{" "}
                      {groups.length}
                    </p>
                    <PaginationControls
                      page={page}
                      pageSize={GROUPS_PER_PAGE}
                      total={groups.length}
                      onPrev={() => setPage((p) => Math.max(0, p - 1))}
                      onNext={() => setPage((p) => p + 1)}
                    />
                  </div>
                ) : null}
              </>
            )}
          </SectionCard>

          <div className="space-y-4">
            <SectionCard title="Build walk list">
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
                Name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`${activeTurf?.name ?? "Turf"} walk list`}
              />
              <div className="mt-3">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
                  List type
                </span>
                <div className="flex rounded-xl border border-border p-0.5">
                  {(["STATIC", "DYNAMIC"] as ListType[]).map((lt) => (
                    <button
                      key={lt}
                      type="button"
                      onClick={() => setListType(lt)}
                      className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                        listType === lt ? "bg-primary text-white" : "text-foreground"
                      }`}
                    >
                      {lt === "STATIC" ? "Static" : "Dynamic"}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {listType === "DYNAMIC"
                    ? "Dynamic — auto-refreshes as the turf changes."
                    : "Static — a fixed snapshot of these stops."}
                </p>
              </div>
              <Button
                className="mt-3 w-full"
                onClick={handleCreate}
                disabled={busy || orderedContacts.length === 0}
              >
                <ListOrdered className="mr-1.5 h-4 w-4" />
                Build walk list
              </Button>
            </SectionCard>

            <SectionCard title="Assignment">
              {activeTurf?.assignedTo ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-border bg-surface/60 p-3">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      <Lock className="h-3.5 w-3.5 text-primary" />
                      Locked to {activeTurf.assignedTo.name}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Server-held lock prevents double-assignment.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleUnassign}
                    disabled={busy}
                  >
                    <UserMinus className="mr-1.5 h-4 w-4" />
                    Unassign turf
                  </Button>
                  <div>
                    <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
                      Reassign to
                    </span>
                    <FormSelect
                      value={selectedVolunteer}
                      onChange={(e) => setSelectedVolunteer(e.target.value)}
                      placeholder="Select a volunteer…"
                      options={volunteers.map((v) => ({ value: v.id, label: v.displayName }))}
                    />
                    <Button
                      className="mt-2 w-full"
                      onClick={handleReassign}
                      disabled={busy || !selectedVolunteer}
                    >
                      <UserPlus className="mr-1.5 h-4 w-4" />
                      Reassign turf
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <Select
                    value={selectedVolunteer}
                    onValueChange={setSelectedVolunteer}
                    placeholder="Select a volunteer…"
                  >
                    {volunteers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.displayName}
                      </SelectItem>
                    ))}
                  </Select>
                  <Button
                    className="mt-3 w-full"
                    onClick={handleAssign}
                    disabled={busy || !selectedVolunteer}
                  >
                    <UserPlus className="mr-1.5 h-4 w-4" />
                    Assign turf
                  </Button>
                </>
              )}
            </SectionCard>

            {walkLists.length > 0 ? (
              <SectionCard title={`Walk lists (${walkLists.length})`}>
                <ul className="space-y-2">
                  {walkLists.map((w) => (
                    <li key={w.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-medium text-foreground">{w.name}</span>
                      <span className="flex items-center gap-2">
                        <StatusBadge status={w.listType === "DYNAMIC" ? "PROCESSING" : "DRAFTED"} />
                        <span className="tabular-nums text-muted-foreground">
                          {w.visitedCount}/{w.stopCount}
                        </span>
                        <button
                          type="button"
                          aria-label="Edit walk list"
                          onClick={() => openEditWl(w)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            ) : null}
          </div>
        </div>
      )}

      {turfs.length > 0 && previewAssignment ? (
        <SectionCard
          title="Canvasser preview"
          description="The exact field walk view your canvassers see — map, optimised route and walking directions. Read-only."
          action={
            <Button variant="outline" size="sm" onClick={() => setShowPreview((v) => !v)}>
              {showPreview ? (
                <>
                  <EyeOff className="mr-1.5 h-3.5 w-3.5" />
                  Hide preview
                </>
              ) : (
                <>
                  <Eye className="mr-1.5 h-3.5 w-3.5" />
                  Preview walk view
                </>
              )}
            </Button>
          }
        >
          {showPreview ? (
            <div className="mx-auto max-w-[420px] rounded-2xl border border-border bg-background p-3">
              <WalkView turfId={turfId} readOnly assignment={previewAssignment} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Show the canvasser&apos;s-eye view of <span className="font-medium text-foreground">{activeTurf?.name}</span> —
              switch to the Map tab inside it for turn-by-turn walking directions to the next stop.
            </p>
          )}
        </SectionCard>
      ) : null}
      </StateRegion>

      <FormDialog
        open={!!editingWl}
        title="Edit walk list"
        onClose={() => setEditingWl(null)}
        onSubmit={submitEditWl}
        busy={wlBusy}
        submitDisabled={!wlForm.name.trim()}
      >
        <Field label="Name" htmlFor="wl-name" required>
          <Input
            id="wl-name"
            value={wlForm.name}
            onChange={(e) => setWlForm((f) => ({ ...f, name: e.target.value }))}
            autoFocus
          />
        </Field>
        <Field label="List type" htmlFor="wl-type" hint="Dynamic auto-refreshes as the turf changes.">
          <Select
            id="wl-type"
            value={wlForm.listType}
            onValueChange={(v) => setWlForm((f) => ({ ...f, listType: v as ListType }))}
          >
            <SelectItem value="STATIC">Static</SelectItem>
            <SelectItem value="DYNAMIC">Dynamic</SelectItem>
          </Select>
        </Field>
      </FormDialog>
    </div>
  );
}
