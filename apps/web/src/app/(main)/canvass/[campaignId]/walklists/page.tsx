"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, ListOrdered, Lock, RefreshCw, UserPlus } from "lucide-react";
import {
  assignTurf,
  createWalkList,
  listCanvassers,
  listTurfContacts,
  listTurfs,
  listWalkLists,
  updateWalkList,
  type TurfContact,
  type TurfSummary,
  type WalkListSummary,
} from "@/lib/api";
import { optimiseRoute, type Stop } from "@/lib/canvass/route";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { FormDialog } from "@/components/ui/form-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { SectionCard } from "@/components/canvass/section-card";
import { Pencil } from "lucide-react";
import { useToast } from "@/components/ui/toast";

type Canvasser = { id: string; displayName: string; email: string | null; role: string };
type ListType = "STATIC" | "DYNAMIC";

function contactName(c: TurfContact): string {
  return [c.firstName, c.lastName].filter(Boolean).join(" ") || c.address || "Unknown resident";
}

export default function WalkListBuilderPage() {
  const params = useParams<{ campaignId: string }>();
  const campaignId = params.campaignId;
  const search = useSearchParams();
  const { showToast } = useToast();

  const [turfs, setTurfs] = useState<TurfSummary[]>([]);
  const [turfId, setTurfId] = useState<string>(search.get("turfId") ?? "");
  const [contacts, setContacts] = useState<TurfContact[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [walkLists, setWalkLists] = useState<WalkListSummary[]>([]);
  const [canvassers, setCanvassers] = useState<Canvasser[]>([]);
  const [listType, setListType] = useState<ListType>("STATIC");
  const [name, setName] = useState("");
  const [selectedCanvasser, setSelectedCanvasser] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [editingWl, setEditingWl] = useState<WalkListSummary | null>(null);
  const [wlForm, setWlForm] = useState<{ name: string; listType: ListType }>({ name: "", listType: "STATIC" });
  const [wlBusy, setWlBusy] = useState(false);

  const activeTurf = turfs.find((t) => t.id === turfId) ?? null;

  // Bootstrap: turfs + canvassers.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [t, c] = await Promise.all([listTurfs(campaignId), listCanvassers()]);
      if (!alive) return;
      if (t.ok) {
        setTurfs(t.data);
        setTurfId((cur) => cur || t.data[0]?.id || "");
      }
      if (c.ok) setCanvassers(c.data);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [campaignId]);

  const optimise = useCallback((cs: TurfContact[]) => {
    const stops: Stop[] = cs.map((c) => ({ id: c.id, lat: c.lat ?? NaN, lng: c.lng ?? NaN }));
    setOrder(optimiseRoute(stops).map((s) => s.id));
  }, []);

  // Load the selected turf's contacts + existing walk lists.
  const loadTurf = useCallback(async () => {
    if (!turfId) return;
    const [cs, wls] = await Promise.all([listTurfContacts(turfId), listWalkLists(turfId)]);
    if (cs.ok) {
      setContacts(cs.data);
      optimise(cs.data);
    }
    if (wls.ok) setWalkLists(wls.data);
  }, [turfId, optimise]);

  useEffect(() => {
    void loadTurf();
  }, [loadTurf]);

  const orderedContacts = useMemo(() => {
    const byId = new Map(contacts.map((c) => [c.id, c]));
    return order.map((id) => byId.get(id)).filter((c): c is TurfContact => Boolean(c));
  }, [order, contacts]);

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
    if (!turfId || !selectedCanvasser) return;
    setBusy(true);
    const res = await assignTurf(turfId, selectedCanvasser);
    setBusy(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't assign turf", description: res.error });
      return;
    }
    const [t] = await Promise.all([listTurfs(campaignId), loadTurf()]);
    if (t.ok) setTurfs(t.data);
    showToast({ tone: "success", title: "Turf assigned" });
  }, [turfId, selectedCanvasser, campaignId, loadTurf, showToast]);

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
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/canvass">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Canvass
          </Link>
        </Button>
        <h1 className="text-2xl font-extrabold">Walk lists</h1>
        <Select
          value={turfId}
          onValueChange={setTurfId}
          className="ml-auto max-w-xs font-semibold"
          aria-label="Turf"
        >
          {turfs.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name}
            </SelectItem>
          ))}
        </Select>
      </div>

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
            description={`${orderedContacts.length} stops · shortest walking path`}
            action={
              <Button variant="outline" size="sm" onClick={() => optimise(contacts)}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Re-optimise
              </Button>
            }
          >
            {orderedContacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No contacts bucketed into this turf. Re-bucket it from the turf-cutting map.
              </p>
            ) : (
              <ol className="space-y-1.5">
                {orderedContacts.map((c, i) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-white px-3 py-2"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#eef2fd] text-xs font-bold tabular-nums text-primary">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{contactName(c)}</p>
                      {c.address ? (
                        <p className="truncate text-xs text-muted-foreground">{c.address}</p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
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
                <div className="rounded-xl border border-border bg-surface/60 p-3">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Lock className="h-3.5 w-3.5 text-primary" />
                    Locked to {activeTurf.assignedTo.name}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Server-held lock prevents double-assignment. Release from the field app to reassign.
                  </p>
                </div>
              ) : (
                <>
                  <Select
                    value={selectedCanvasser}
                    onValueChange={setSelectedCanvasser}
                    placeholder="Select a canvasser…"
                  >
                    {canvassers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.displayName}
                      </SelectItem>
                    ))}
                  </Select>
                  <Button
                    className="mt-3 w-full"
                    onClick={handleAssign}
                    disabled={busy || !selectedCanvasser}
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
