"use client";

import { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import { CalendarPlus, MapPin, Pencil, Trash2 } from "lucide-react";
import { CampaignPageHeader } from "@/components/canvass/campaign-page-header";
import { createShift, deleteShift, listShifts, updateShift, type Shift } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { StateRegion } from "@/components/shell/state-region";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormDialog } from "@/components/ui/form-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard } from "@uprise/field";
import { useToast } from "@/components/ui/toast";

/** ISO → the value a <input type="datetime-local"> expects (local time, no seconds). */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const EMPTY = { name: "", location: "", startsAt: "", endsAt: "" };

export default function ShiftsPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const { showToast } = useToast();
  const { data, loading, error, noPermission, refetch } = useApi(
    `/canvass/${campaignId}/shifts`,
    () => listShifts(campaignId),
    { ttlMs: 30_000 },
  );
  const shifts: Shift[] = data ?? [];
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState<Shift | null>(null);
  const [editForm, setEditForm] = useState(EMPTY);
  const [editBusy, setEditBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Shift | null>(null);

  const add = useCallback(async () => {
    if (!form.name.trim() || !form.startsAt || !form.endsAt) {
      showToast({ tone: "warning", title: "Fill name, start and end" });
      return;
    }
    setBusy(true);
    const res = await createShift({
      campaignId,
      name: form.name.trim(),
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: new Date(form.endsAt).toISOString(),
      location: form.location.trim() || undefined,
    });
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
      location: s.location ?? "",
      startsAt: toLocalInput(s.startsAt),
      endsAt: toLocalInput(s.endsAt),
    });
  };

  const submitEdit = useCallback(async () => {
    if (!editing || !editForm.name.trim() || !editForm.startsAt || !editForm.endsAt) return;
    setEditBusy(true);
    const res = await updateShift(editing.id, {
      name: editForm.name.trim(),
      location: editForm.location.trim(),
      startsAt: new Date(editForm.startsAt).toISOString(),
      endsAt: new Date(editForm.endsAt).toISOString(),
    });
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

  return (
    <div className="page-stack">
      <CampaignPageHeader title="Shifts" icon={CalendarPlus} />

      <SectionCard title="Schedule a shift">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Shift name" htmlFor="shift-name" required>
            <Input id="shift-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Saturday AM" />
          </Field>
          <Field label="Staging location" htmlFor="shift-loc">
            <Input id="shift-loc" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="Optional" />
          </Field>
          <Field label="Starts" htmlFor="shift-start" required>
            <Input id="shift-start" type="datetime-local" value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} />
          </Field>
          <Field label="Ends" htmlFor="shift-end" required>
            <Input id="shift-end" type="datetime-local" value={form.endsAt} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} />
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
        <SectionCard title={`Upcoming shifts (${shifts.length})`}>
          <ul className="space-y-2">
            {shifts.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">{s.name}</p>
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    {new Date(s.startsAt).toLocaleString()} – {new Date(s.endsAt).toLocaleTimeString()}
                    {s.location ? (
                      <span className="flex items-center gap-0.5">
                        <MapPin className="h-3 w-3" />
                        {s.location}
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Edit shift"
                    onClick={() => openEdit(s)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Delete shift"
                    onClick={() => setDeleteTarget(s)}
                    className="text-muted-foreground hover:text-error"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
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
