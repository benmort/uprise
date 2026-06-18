"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Camera, ShieldAlert, UserPlus } from "lucide-react";
import {
  createDoorContact,
  getCanvassAssignments,
  listDispositions,
  uploadDoorPhoto,
  type CanvassAssignment,
  type DispositionDef,
} from "@/lib/api";
import { getContactProfile, type ContactProfile } from "@/lib/api/contacts";
import { getCanvasserId, newLocalId } from "@/lib/canvass/canvasser";
import { useGeolocation } from "@/hooks/use-geolocation";
import { useSyncQueue } from "@/hooks/use-sync-queue";
import { DispositionPad } from "@/components/canvass/disposition-pad";
import { PriorContactStrip } from "@/components/canvass/prior-contact-strip";
import { SupportPill } from "@/components/canvass/support-pill";
import { SurveyRunner, type SurveyAnswer, type SurveySchema } from "@/components/canvass/survey-runner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";

// "Spoke to someone" codes reveal the survey; everything else is a 1-tap knock.
const SURVEY_TRIGGER_CODES = new Set(["spoke_to_target", "spoke_to_other"]);

export default function DoorEntryPage() {
  const router = useRouter();
  const { turfId, stopId } = useParams<{ turfId: string; stopId: string }>();
  const { showToast } = useToast();
  const { capture } = useGeolocation();
  const { enqueue } = useSyncQueue();

  const [assignment, setAssignment] = useState<CanvassAssignment | null>(null);
  const [dispositions, setDispositions] = useState<DispositionDef[]>([]);
  const [profile, setProfile] = useState<ContactProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [chosenCode, setChosenCode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState("");
  const [safetyFlag, setSafetyFlag] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const canvasserId = getCanvasserId();
      const [aRes, dRes] = await Promise.all([
        canvasserId ? getCanvassAssignments(canvasserId) : Promise.resolve({ ok: false as const, error: "no id" }),
        listDispositions("DOOR"),
      ]);
      if (!alive) return;
      if (aRes.ok) setAssignment(aRes.data.find((a) => a.turfId === turfId) ?? null);
      if (dRes.ok) setDispositions(dRes.data);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [turfId]);

  const stop = useMemo(() => {
    const items = assignment?.walkLists.flatMap((wl) => wl.items) ?? [];
    return items.find((it) => it.id === stopId) ?? null;
  }, [assignment, stopId]);

  // The informed knock: pull this resident's recent contact history.
  const contactId = stop?.contact.id as string | undefined;
  useEffect(() => {
    if (!contactId) return;
    let alive = true;
    void (async () => {
      const res = await getContactProfile(contactId);
      if (alive && res.ok) setProfile(res.data);
    })();
    return () => {
      alive = false;
    };
  }, [contactId]);

  async function record(code: string, _answers?: SurveyAnswer[]) {
    if (!stop) return;
    setSaving(true);
    const gps = await capture(); // one-shot GPS at the door
    // One id for both the outbox key and the payload, so a re-synced knock is
    // deduped server-side (DoorKnock unique on (org, localId)).
    const localId = newLocalId();
    const capturedAt = new Date().toISOString();
    await enqueue(
      localId,
      {
        contactId: stop.contact.id as string,
        canvasserId: getCanvasserId() ?? "",
        localId,
        dispositionCode: code,
        walkListItemId: stop.id,
        lat: gps?.lat,
        lng: gps?.lng,
        notes: notes.trim() || undefined,
        safetyFlag: safetyFlag || undefined,
        photoUrl: photoUrl || undefined,
        clientCapturedAt: capturedAt,
      },
      capturedAt,
    );
    showToast({ tone: "success", title: "Knock saved", description: "Will sync when online." });
    router.push(`/field/${turfId}`);
  }

  if (loading) return <Skeleton className="h-64 w-full" />;
  if (!stop) return <Card className="p-4">Stop not found.</Card>;

  const contact = stop.contact as Record<string, unknown>;
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Resident";
  const showSurvey = chosenCode && SURVEY_TRIGGER_CODES.has(chosenCode);

  // A campaign survey would come from the assignment; a minimal default here.
  const survey: SurveySchema = {
    questions: [
      {
        id: "support",
        prompt: "How likely are they to support?",
        type: "scale",
        scaleMin: 1,
        scaleMax: 5,
      },
    ],
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold">{name}</h1>
          <p className="text-sm text-muted-foreground">{(contact.address as string) ?? "No address"}</p>
        </div>
        {profile?.contact.supportLevel ? (
          <SupportPill level={profile.contact.supportLevel} />
        ) : null}
      </div>

      {profile ? <PriorContactStrip timeline={profile.timeline} /> : null}

      {!showSurvey ? (
        <DispositionPad
          options={dispositions}
          disabled={saving}
          onSelect={(code) => {
            if (SURVEY_TRIGGER_CODES.has(code)) setChosenCode(code);
            else void record(code);
          }}
        />
      ) : (
        <Card className="p-4">
          <SurveyRunner
            schema={survey}
            onCancel={() => setChosenCode(null)}
            onComplete={(answers) => void record(chosenCode!, answers)}
          />
        </Card>
      )}

      <div className="space-y-2 rounded-2xl border border-border p-3">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)…"
          rows={2}
          className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-2 text-sm font-medium text-error">
          <input
            type="checkbox"
            checked={safetyFlag}
            onChange={(e) => setSafetyFlag(e.target.checked)}
            className="h-4 w-4"
          />
          <ShieldAlert className="h-4 w-4" />
          Not safe — do not return
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
          <Camera className="h-4 w-4 text-muted-foreground" />
          {photoBusy ? "Uploading…" : photoUrl ? "Photo attached ✓" : "Add photo"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setPhotoBusy(true);
              const res = await uploadDoorPhoto(file);
              setPhotoBusy(false);
              if (res.ok) setPhotoUrl(res.data.url);
              else
                showToast({
                  tone: "error",
                  title: "Photo not saved",
                  description: res.error.includes("not configured") ? "Photo storage isn't set up yet." : res.error,
                });
            }}
          />
        </label>
      </div>

      <AddHouseholdMember turfId={turfId} />

      <Button variant="ghost" className="w-full" onClick={() => router.push(`/field/${turfId}`)}>
        Back to walk list
      </Button>
    </div>
  );
}

/** G2: add an extra resident at this door (cold "addresses without contacts" universe). */
function AddHouseholdMember({ turfId }: { turfId: string }) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    const canvasserId = getCanvasserId();
    if (!canvasserId || !name.trim()) return;
    setBusy(true);
    const [firstName, ...rest] = name.trim().split(/\s+/);
    const res = await createDoorContact({
      canvasserId,
      turfId,
      firstName,
      lastName: rest.join(" ") || undefined,
    });
    setBusy(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't add resident", description: res.error });
      return;
    }
    setName("");
    setOpen(false);
    showToast({ tone: "success", title: "Resident added to this turf" });
  }

  if (!open) {
    return (
      <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
        <UserPlus className="mr-1.5 h-4 w-4" />
        Add household member
      </Button>
    );
  }
  return (
    <div className="flex gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Resident name"
        className="h-11 flex-1 rounded-xl border border-border px-3 text-sm"
      />
      <Button onClick={add} disabled={busy || !name.trim()}>
        Add
      </Button>
    </div>
  );
}
