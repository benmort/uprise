"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { createEvent, type EventStatus } from "@/lib/api";
import { PageShell } from "@/components/shell/page-shell";
import { Wizard, type WizardStep } from "@uprise/ui";
import { SectionCard } from "@uprise/field";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ImageCropUpload } from "@/components/branding/image-crop-upload";
import { CoverAssetPicker } from "@/components/events/cover-asset-picker";
import { useToast } from "@/components/ui/toast";

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

/**
 * Create an event — a full-page multi-step wizard (the reusable <Wizard>). The cover step
 * reuses the profile/branding ImageCropUpload plus a suggested-asset picker, and uploads
 * to the id-less /files store so a cover can be set before the event exists.
 */
export default function NewEventPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setBusy(true);
    const res = await createEvent({
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
    });
    setBusy(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't create event", description: res.error });
      return;
    }
    showToast({ tone: "success", title: "Event created" });
    router.push(`/canvass/events/${res.data.id}`);
  };

  const steps: WizardStep[] = [
    {
      key: "details",
      label: "Details",
      canAdvance: Boolean(form.title.trim()),
      content: (
        <SectionCard title="The basics" description="Name your event and describe what supporters are coming to.">
          <div className="space-y-4">
            <Field label="Title" htmlFor="ev-title" required>
              <Input id="ev-title" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Community town hall" autoFocus />
            </Field>
            <Field label="Category" htmlFor="ev-cat" hint="Optional — e.g. Rally, Town hall, Phone bank">
              <Input id="ev-cat" value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="Rally" />
            </Field>
            <Field label="Description" htmlFor="ev-desc">
              <Textarea id="ev-desc" rows={4} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="What's happening, who should come, what to expect." />
            </Field>
          </div>
        </SectionCard>
      ),
    },
    {
      key: "cover",
      label: "Cover & assets",
      content: (
        <SectionCard
          title="Cover image"
          description="A landscape (16:9) cover shows on the public event page and in listings. Upload one or pick a suggested image from your library."
        >
          <div className="space-y-5">
            <ImageCropUpload
              label="Event cover"
              value={form.imageUrl || null}
              onChange={(url) => set("imageUrl", url ?? "")}
              aspect={16 / 9}
              mimeType="image/jpeg"
              folder="event-covers"
              boxClassName="h-48"
              helpText="Recommended 1200×675 or larger. JPEG."
            />
            <div>
              <p className="mb-2 text-sm font-medium text-foreground">Suggested cover images</p>
              <CoverAssetPicker value={form.imageUrl || null} onSelect={(url) => set("imageUrl", url)} />
            </div>
          </div>
        </SectionCard>
      ),
    },
    {
      key: "when",
      label: "When & where",
      canAdvance: Boolean(form.startsAt && form.endsAt),
      content: (
        <SectionCard title="When & where" description="Set the schedule and location. Coordinates pin the map on the public page.">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Starts" htmlFor="ev-start" required>
                <Input id="ev-start" type="datetime-local" value={form.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
              </Field>
              <Field label="Ends" htmlFor="ev-end" required>
                <Input id="ev-end" type="datetime-local" value={form.endsAt} onChange={(e) => set("endsAt", e.target.value)} />
              </Field>
            </div>
            <Field label="Location" htmlFor="ev-loc">
              <Input id="ev-loc" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Venue / address" />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Latitude" htmlFor="ev-lat" hint="Optional">
                <Input id="ev-lat" value={form.lat} onChange={(e) => set("lat", e.target.value)} placeholder="-37.80" />
              </Field>
              <Field label="Longitude" htmlFor="ev-lng" hint="Optional">
                <Input id="ev-lng" value={form.lng} onChange={(e) => set("lng", e.target.value)} placeholder="144.98" />
              </Field>
              <Field label="Capacity" htmlFor="ev-cap" hint="Blank = unlimited">
                <Input id="ev-cap" type="number" min={0} value={form.capacity} onChange={(e) => set("capacity", e.target.value)} placeholder="Unlimited" />
              </Field>
            </div>
          </div>
        </SectionCard>
      ),
    },
    {
      key: "publish",
      label: "Publish",
      content: (
        <SectionCard title="Publishing" description="Draft keeps it private; publish to make it live. Turn on public RSVPs for a tokenless registration link.">
          <div className="space-y-4">
            <Field label="Status" htmlFor="ev-status">
              <SegmentedControl
                value={form.status}
                onChange={(v) => set("status", v as EventStatus)}
                options={[
                  { value: "DRAFT", label: "Draft" },
                  { value: "PUBLISHED", label: "Published" },
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
          </div>
        </SectionCard>
      ),
    },
  ];

  return (
    <PageShell
      icon={CalendarClock}
      title="Create event"
      description="Rallies, town halls, launches and phone banks — the public happenings your volunteers staff and your supporters RSVP to."
      backHref="/canvass/events"
      backLabel="Events"
    >
      <div className="max-w-3xl">
        <Wizard steps={steps} onComplete={() => void submit()} completeLabel="Create event" busy={busy} />
      </div>
    </PageShell>
  );
}
