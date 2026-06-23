"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { getSurvey, listSurveys } from "@/lib/api/engagement";
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
  const [survey, setSurvey] = useState<SurveySchema | null>(null);
  const [profile, setProfile] = useState<ContactProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [chosenCode, setChosenCode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState("");
  const [safetyFlag, setSafetyFlag] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const submittingRef = useRef(false);

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

  // Load the campaign's survey (real question/option ids) so answers persist as
  // QuestionResponses. No survey on the campaign → door is disposition-only.
  const campaignId = assignment?.turf.campaignId ?? null;
  useEffect(() => {
    if (!campaignId) {
      setSurvey(null);
      return;
    }
    let alive = true;
    void (async () => {
      const list = await listSurveys();
      if (!alive || !list.ok) return;
      const match = list.data.find((s) => s.campaignId === campaignId);
      if (!match) {
        setSurvey(null);
        return;
      }
      const full = await getSurvey(match.id);
      if (!alive || !full.ok) return;
      setSurvey({
        questions: full.data.questions
          .filter((q) => q.id)
          .map((q) => ({
            id: String(q.id),
            prompt: q.prompt,
            type: q.type,
            required: q.required,
            scaleMin: q.scaleMin ?? undefined,
            scaleMax: q.scaleMax ?? undefined,
            options: q.options
              ?.filter((o) => o.id)
              .map((o) => ({ id: String(o.id), value: o.value, label: o.label })),
          })),
      });
    })();
    return () => {
      alive = false;
    };
  }, [campaignId]);

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

  async function record(code: string, answers?: SurveyAnswer[]) {
    if (!stop) return;
    // Guard against a double-tap recording two knocks (distinct localIds) before
    // the first enqueue completes — the server would accept both as separate knocks.
    if (submittingRef.current) return;
    // A knock without a canvasser id is rejected server-side as a terminal CONFLICT,
    // stranding it in the sync centre. Bail with a clear message instead.
    const canvasserId = getCanvasserId();
    if (!canvasserId) {
      showToast({
        tone: "error",
        title: "Not signed in",
        description: "Your canvasser session was lost — sign in again to record knocks.",
      });
      return;
    }
    submittingRef.current = true;
    setSaving(true);
    const gps = await capture(); // one-shot GPS at the door
    // One id for both the outbox key and the payload, so a re-synced knock is
    // deduped server-side (DoorKnock unique on (org, localId)).
    const localId = newLocalId();
    const capturedAt = new Date().toISOString();
    try {
      await enqueue(
        localId,
        {
          contactId: stop.contact.id as string,
          canvasserId,
          localId,
          dispositionCode: code,
          walkListItemId: stop.id,
          lat: gps?.lat,
          lng: gps?.lng,
          notes: notes.trim() || undefined,
          safetyFlag: safetyFlag || undefined,
          photoUrl: photoUrl || undefined,
          surveyAnswers: answers?.length ? answers : undefined,
          clientCapturedAt: capturedAt,
        },
        capturedAt,
      );
    } catch (error) {
      // IDB write failed — let the canvasser retry rather than silently lose the knock.
      submittingRef.current = false;
      setSaving(false);
      showToast({
        tone: "error",
        title: "Couldn't save knock",
        description: error instanceof Error ? error.message : "Try again.",
      });
      return;
    }
    showToast({ tone: "success", title: "Knock saved", description: "Will sync when online." });
    router.push(`/field/${turfId}`);
  }

  if (loading) return <Skeleton className="h-64 w-full" />;
  if (!stop) {
    return (
      <Card className="space-y-3 p-4">
        <p className="text-sm text-muted-foreground">
          This stop isn’t in your current walk list — the turf may have been reassigned or updated.
        </p>
        <Button className="w-full" onClick={() => router.push(`/field/${turfId}`)}>
          Back to walk list
        </Button>
      </Card>
    );
  }

  const contact = stop.contact as Record<string, unknown>;
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Resident";
  const hasSurvey = Boolean(survey && survey.questions.length > 0);
  const showSurvey = Boolean(chosenCode && hasSurvey);

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
            // "Spoke to someone" reveals the survey — but only if the campaign has
            // one; otherwise it's a plain disposition-only knock.
            if (SURVEY_TRIGGER_CODES.has(code) && hasSurvey) setChosenCode(code);
            else void record(code);
          }}
        />
      ) : (
        <Card className="p-4">
          <SurveyRunner
            schema={survey!}
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
          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
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
