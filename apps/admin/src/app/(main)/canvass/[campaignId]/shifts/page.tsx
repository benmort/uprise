"use client";

import { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import { CalendarPlus, MapPin, Pencil, Trash2, Users } from "lucide-react";
import { CampaignPageHeader } from "@/components/canvass/campaign-page-header";
import {
  createShift,
  deleteShift,
  listEvents,
  listShifts,
  listVolunteers,
  updateShift,
  type Shift,
  type ShiftType,
} from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { StateRegion } from "@/components/shell/state-region";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Select, SelectItem } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { FormDialog } from "@/components/ui/form-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard } from "@uprise/field";
import { useToast } from "@/components/ui/toast";
import { ShiftRoster } from "@/components/canvass/shift-roster";

/** ISO → the value a <input type="datetime-local"> expects (local time, no seconds). */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const TYPE_OPTIONS: { value: ShiftType; label: string }[] = [
  { value: "CANVASS", label: "Canvass" },
  { value: "POLLING_BOOTH", label: "Polling booth" },
  { value: "EVENT", label: "Event" },
  { value: "GENERAL", label: "General" },
];
const TYPE_LABEL: Record<ShiftType, string> = {
  CANVASS: "Canvass",
  POLLING_BOOTH: "Polling booth",
  EVENT: "Event",
  GENERAL: "General",
};

const EMPTY = {
  name: "",
  type: "CANVASS" as ShiftType,
  location: "",
  startsAt: "",
  endsAt: "",
  capacity: "",
  eventId: "",
  pollingPlaceId: "",
};
type ShiftForm = typeof EMPTY;

export default function ShiftsPage() {
  const { campaignId } = useParams<{ campaignId?: string }>();
  const { showToast } = useToast();
  const { data, loading, error, noPermission, refetch } = useApi(
    campaignId ? `/canvass/${campaignId}/shifts` : "/canvass/shifts",
    () => listShifts(campaignId),
    { ttlMs: 30_000 },
  );
  const shifts: Shift[] = data ?? [];

  const volunteersApi = useApi("/canvass/volunteers", () => listVolunteers(), { ttlMs: 60_000 });
  const volunteers = volunteersApi.data ?? [];
  const eventsApi = useApi("/events", () => listEvents(), { ttlMs: 60_000 });
  const events = eventsApi.data ?? [];

  const [form, setForm] = useState<ShiftForm>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Shift | null>(null);
  const [editForm, setEditForm] = useState<ShiftForm>(EMPTY);
  const [editBusy, setEditBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Shift | null>(null);
  const [openRoster, setOpenRoster] = useState<string | null>(null);

  const setField = <K extends keyof ShiftForm>(k: K, v: ShiftForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const buildPayload = (f: ShiftForm) => ({
    type: f.type,
    name: f.name.trim(),
    location: f.location.trim() || undefined,
    startsAt: new Date(f.startsAt).toISOString(),
    endsAt: new Date(f.endsAt).toISOString(),
    capacity: f.capacity ? Number(f.capacity) : undefined,
    eventId: f.type === "EVENT" && f.eventId ? f.eventId : undefined,
    pollingPlaceId: f.type === "POLLING_BOOTH" && f.pollingPlaceId ? f.pollingPlaceId.trim() : undefined,
  });

  const add = useCallback(async () => {
    if (!form.name.trim() || !form.startsAt || !form.endsAt) {
      showToast({ tone: "warning", title: "Fill name, start and end" });
      return;
    }
    setBusy(true);
    const res = await createShift({ ...buildPayload(form), campaignId: campaignId || undefined });
    setBusy(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't add shift", description: res.error });
      return;
    }
    setForm(EMPTY);
    void refetch();
    showToast({ tone: "success", title: "Shift scheduled" });
  }, [campaignId, form, refetch, showToast]);

  const openEdit = (s: Shift) => {
    setEditing(s);
    setEditForm({
      name: s.name,
      type: s.type,
      location: s.location ?? "",
      startsAt: toLocalInput(s.startsAt),
      endsAt: toLocalInput(s.endsAt),
      capacity: s.capacity != null ? String(s.capacity) : "",
      eventId: s.eventId ?? "",
      pollingPlaceId: s.pollingPlaceId ?? "",
    });
  };

  const submitEdit = useCallback(async () => {
    if (!editing || !editForm.name.trim() || !editForm.startsAt || !editForm.endsAt) return;
    setEditBusy(true);
    const res = await updateShift(editing.id, buildPayload(editForm));
    setEditBusy(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't update shift", description: res.error });
      return;
    }
    setEditing(null);
    void refetch();
    showToast({ tone: "success", title: "Shift updated" });
  }, [editing, editForm, refetch, showToast]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setBusy(true);
    const res = await deleteShift(deleteTarget.id);
    setBusy(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't delete", description: res.error });
      return;
    }
    setDeleteTarget(null);
    void refetch();
  }, [deleteTarget, refetch, showToast]);

  const renderTypeFields = (f: ShiftForm, set: (k: keyof ShiftForm, v: string) => void) => (
    <>
      <Field label="Type" htmlFor="shift-type">
        <SegmentedControl value={f.type} onChange={(v) => set("type", v)} options={TYPE_OPTIONS} />
      </Field>
      {f.type === "EVENT" ? (
        <Field label="Event" htmlFor="shift-event">
          <Select value={f.eventId} onValueChange={(v) => set("eventId", v)} placeholder="Link an event…">
            {events.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.title}
              </SelectItem>
            ))}
          </Select>
        </Field>
      ) : null}
      {f.type === "POLLING_BOOTH" ? (
        <Field label="Polling place" htmlFor="shift-booth">
          <Input value={f.pollingPlaceId} onChange={(e) => set("pollingPlaceId", e.target.value)} placeholder="Polling place id / name" />
        </Field>
      ) : null}
    </>
  );

  return (
    <div className="page-stack">
      <CampaignPageHeader title="Shifts" icon={CalendarPlus} />

      <SectionCard title="Schedule a shift">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Shift name" htmlFor="shift-name" required>
            <Input id="shift-name" value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="e.g. Saturday AM" />
          </Field>
          <Field label="Staging location" htmlFor="shift-loc">
            <Input id="shift-loc" value={form.location} onChange={(e) => setField("location", e.target.value)} placeholder="Optional" />
          </Field>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {renderTypeFields(form, (k, v) => setField(k as keyof ShiftForm, v as never))}
          <Field label="Capacity" htmlFor="shift-cap">
            <Input id="shift-cap" type="number" min={1} value={form.capacity} onChange={(e) => setField("capacity", e.target.value)} placeholder="Unlimited" />
          </Field>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Starts" htmlFor="shift-start" required>
            <Input id="shift-start" type="datetime-local" value={form.startsAt} onChange={(e) => setField("startsAt", e.target.value)} />
          </Field>
          <Field label="Ends" htmlFor="shift-end" required>
            <Input id="shift-end" type="datetime-local" value={form.endsAt} onChange={(e) => setField("endsAt", e.target.value)} />
          </Field>
        </div>
        <Button className="mt-3" onClick={add} disabled={busy}>
          <CalendarPlus className="mr-1.5 h-4 w-4" />
          Add shift
        </Button>
      </SectionCard>

      <StateRegion
        loading={loading}
        error={error}
        noPermission={noPermission}
        onRetry={() => void refetch()}
        empty={shifts.length === 0}
        emptyTitle="No shifts scheduled"
        skeleton={<Skeleton className="h-32 w-full" />}
      >
        <SectionCard title={`Shifts (${shifts.length})`}>
          <ul className="space-y-2">
            {shifts.map((s) => (
              <li key={s.id} className="rounded-xl border border-border px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      {s.name}
                      <span className="rounded-full bg-surface-variant px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {TYPE_LABEL[s.type]}
                      </span>
                    </p>
                    <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {new Date(s.startsAt).toLocaleString()} – {new Date(s.endsAt).toLocaleTimeString()}
                      {s.location ? (
                        <span className="flex items-center gap-0.5">
                          <MapPin className="h-3 w-3" />
                          {s.location}
                        </span>
                      ) : null}
                      <span className={`flex items-center gap-0.5 ${s.isFull ? "text-error" : ""}`}>
                        <Users className="h-3 w-3" />
                        {s.assignedCount}
                        {s.capacity != null ? `/${s.capacity}` : ""}
                        {s.isFull ? " · full" : ""}
                        {s.requestedCount > 0 ? ` · ${s.requestedCount} pending` : ""}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setOpenRoster((id) => (id === s.id ? null : s.id))}>
                      {openRoster === s.id ? "Hide roster" : "Manage roster"}
                    </Button>
                    <button type="button" aria-label="Edit shift" onClick={() => openEdit(s)} className="text-muted-foreground hover:text-foreground">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" aria-label="Delete shift" onClick={() => setDeleteTarget(s)} className="text-muted-foreground hover:text-error">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {openRoster === s.id ? (
                  <ShiftRoster shiftId={s.id} volunteers={volunteers} onChange={() => void refetch()} />
                ) : null}
              </li>
            ))}
          </ul>
        </SectionCard>
      </StateRegion>

      <FormDialog
        open={!!editing}
        title="Edit shift"
        onClose={() => setEditing(null)}
        onSubmit={submitEdit}
        busy={editBusy}
        submitDisabled={!editForm.name.trim() || !editForm.startsAt || !editForm.endsAt}
      >
        <Field label="Shift name" htmlFor="shift-edit-name" required>
          <Input id="shift-edit-name" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} autoFocus />
        </Field>
        <Field label="Staging location" htmlFor="shift-edit-loc">
          <Input id="shift-edit-loc" value={editForm.location} onChange={(e) => setEditForm((f) => ({ ...f, location: e.target.value }))} placeholder="Optional" />
        </Field>
        {renderTypeFields(editForm, (k, v) => setEditForm((f) => ({ ...f, [k]: v })))}
        <Field label="Capacity" htmlFor="shift-edit-cap">
          <Input id="shift-edit-cap" type="number" min={1} value={editForm.capacity} onChange={(e) => setEditForm((f) => ({ ...f, capacity: e.target.value }))} placeholder="Unlimited" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts" htmlFor="shift-edit-start" required>
            <Input id="shift-edit-start" type="datetime-local" value={editForm.startsAt} onChange={(e) => setEditForm((f) => ({ ...f, startsAt: e.target.value }))} />
          </Field>
          <Field label="Ends" htmlFor="shift-edit-end" required>
            <Input id="shift-edit-end" type="datetime-local" value={editForm.endsAt} onChange={(e) => setEditForm((f) => ({ ...f, endsAt: e.target.value }))} />
          </Field>
        </div>
      </FormDialog>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete shift"
        description={deleteTarget ? `Delete “${deleteTarget.name}”?` : ""}
        confirmLabel="Delete"
        busy={busy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
