"use client";

import { useEffect, useState } from "react";
import {
  createEvent,
  updateEvent,
  type EventDetail,
  type EventStatus,
  type EventSummary,
} from "@/lib/api";
import { FormDialog } from "@/components/ui/form-dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ImageCropUpload } from "@/components/branding/image-crop-upload";
import { CoverAssetPicker } from "@/components/events/cover-asset-picker";
import { useToast } from "@/components/ui/toast";

/** ISO → the value a <input type="datetime-local"> expects (local time, no seconds). */
function toLocalInput(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type FormState = {
  title: string;
  description: string;
  category: string;
  location: string;
  lat: string;
  lng: string;
  startsAt: string;
  endsAt: string;
  capacity: string;
  imageUrl: string;
  status: EventStatus;
  publicRsvpEnabled: boolean;
};

const EMPTY: FormState = {
  title: "",
  description: "",
  category: "",
  location: "",
  lat: "",
  lng: "",
  startsAt: "",
  endsAt: "",
  capacity: "",
  imageUrl: "",
  status: "DRAFT",
  publicRsvpEnabled: false,
};

/** Create/edit an event. Pass `event` to edit, or null/undefined to create. */
export function EventFormDialog({
  open,
  event,
  onClose,
  onSaved,
}: {
  open: boolean;
  event?: EventSummary | EventDetail | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const editing = !!event;

  useEffect(() => {
    if (!open) return;
    setForm(
      event
        ? {
            title: event.title,
            description: event.description ?? "",
            category: event.category ?? "",
            location: event.location ?? "",
            lat: event.lat != null ? String(event.lat) : "",
            lng: event.lng != null ? String(event.lng) : "",
            startsAt: toLocalInput(event.startsAt),
            endsAt: toLocalInput(event.endsAt),
            capacity: event.capacity != null ? String(event.capacity) : "",
            imageUrl: event.imageUrl ?? "",
            status: event.status,
            publicRsvpEnabled: event.publicRsvpEnabled,
          }
        : EMPTY,
    );
  }, [open, event]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.title.trim() || !form.startsAt || !form.endsAt) {
      showToast({ tone: "warning", title: "Fill title, start and end" });
      return;
    }
    setBusy(true);
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      category: form.category.trim() || undefined,
      location: form.location.trim() || undefined,
      lat: form.lat ? Number(form.lat) : undefined,
      lng: form.lng ? Number(form.lng) : undefined,
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: new Date(form.endsAt).toISOString(),
      capacity: form.capacity ? Number(form.capacity) : undefined,
      imageUrl: form.imageUrl.trim() || undefined,
      status: form.status,
      publicRsvpEnabled: form.publicRsvpEnabled,
    };
    const res = event ? await updateEvent(event.id, payload) : await createEvent(payload);
    setBusy(false);
    if (!res.ok) {
      showToast({ tone: "error", title: editing ? "Couldn't update event" : "Couldn't create event", description: res.error });
      return;
    }
    onClose();
    onSaved();
    showToast({ tone: "success", title: editing ? "Event updated" : "Event created" });
  };

  return (
    <FormDialog
      open={open}
      title={editing ? "Edit event" : "Create event"}
      onClose={onClose}
      onSubmit={submit}
      busy={busy}
      submitDisabled={!form.title.trim() || !form.startsAt || !form.endsAt}
    >
      <Field label="Title" htmlFor="ev-title" required>
        <Input id="ev-title" value={form.title} onChange={(e) => set("title", e.target.value)} autoFocus />
      </Field>
      <Field label="Description" htmlFor="ev-desc">
        <Textarea id="ev-desc" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category" htmlFor="ev-cat">
          <Input id="ev-cat" value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. Rally" />
        </Field>
        <Field label="Capacity" htmlFor="ev-cap">
          <Input id="ev-cap" type="number" min={0} value={form.capacity} onChange={(e) => set("capacity", e.target.value)} placeholder="Unlimited" />
        </Field>
      </div>
      <Field label="Location" htmlFor="ev-loc">
        <Input id="ev-loc" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Venue / address" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Latitude" htmlFor="ev-lat" hint="Optional — pins the map">
          <Input id="ev-lat" value={form.lat} onChange={(e) => set("lat", e.target.value)} placeholder="-37.80" />
        </Field>
        <Field label="Longitude" htmlFor="ev-lng">
          <Input id="ev-lng" value={form.lng} onChange={(e) => set("lng", e.target.value)} placeholder="144.98" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts" htmlFor="ev-start" required>
          <Input id="ev-start" type="datetime-local" value={form.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
        </Field>
        <Field label="Ends" htmlFor="ev-end" required>
          <Input id="ev-end" type="datetime-local" value={form.endsAt} onChange={(e) => set("endsAt", e.target.value)} />
        </Field>
      </div>
      <ImageCropUpload
        label="Cover image"
        value={form.imageUrl || null}
        onChange={(url) => set("imageUrl", url ?? "")}
        aspect={16 / 9}
        mimeType="image/jpeg"
        folder="event-covers"
        boxClassName="h-40"
        helpText="Recommended 1200×675 or larger. JPEG."
      />
      <div>
        <p className="mb-2 text-sm font-medium text-foreground">Suggested cover images</p>
        <CoverAssetPicker value={form.imageUrl || null} onSelect={(url) => set("imageUrl", url)} />
      </div>
      <Field label="Status" htmlFor="ev-status">
        <SegmentedControl
          value={form.status}
          onChange={(v) => set("status", v as EventStatus)}
          options={[
            { value: "DRAFT", label: "Draft" },
            { value: "PUBLISHED", label: "Published" },
            { value: "CANCELLED", label: "Cancelled" },
          ]}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={form.publicRsvpEnabled}
          onChange={(e) => set("publicRsvpEnabled", e.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
        Allow public RSVPs (tokenless registration link)
      </label>
    </FormDialog>
  );
}
