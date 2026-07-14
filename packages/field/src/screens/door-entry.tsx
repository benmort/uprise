"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ChevronLeft, MapPin, ShieldAlert, UserPlus } from "lucide-react";
import { Card, Button, Skeleton, useToast } from "@uprise/ui";
import { createDoorContact, uploadDoorPhoto, type CanvassAssignment } from "../api";
import {
  useAssignments,
  useContactProfile,
  useDispositions,
  useSurvey,
  useSurveys,
} from "../hooks/use-canvass";
import { getVolunteerId, newLocalId } from "../lib/volunteer";
import { useGeolocation } from "../hooks/use-geolocation";
import { useSyncQueue } from "../hooks/use-sync-queue";
import { DispositionPad } from "../components/disposition-pad";
import { PriorContactStrip } from "../components/prior-contact-strip";
import { SupportPill } from "../components/support-pill";
import { SurveyRunner, type SurveyAnswer, type SurveySchema } from "../components/survey-runner";

// "Spoke to someone" codes reveal the survey; everything else is a 1-tap knock.
const SURVEY_TRIGGER_CODES = new Set(["spoke_to_target", "spoke_to_other"]);

export function DoorEntry({ turfId, stopId }: { turfId: string; stopId: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const { capture } = useGeolocation();
  const { enqueue } = useSyncQueue();

  // Assignment + dispositions come from the SHARED cache — arriving here from the walk
  // view is instant (the turf is already cached), and the disposition catalogue is
  // reference data cached across doors. Survey + profile are per-door (below).
  const [volunteerId] = useState(() => getVolunteerId());
  const a = useAssignments(volunteerId ?? null);
  const d = useDispositions("DOOR");
  const assignment: CanvassAssignment | null = a.data?.find((x) => x.turfId === turfId) ?? null;
  const dispositions = d.data ?? [];
  const loading = a.loading;
  const [chosenCode, setChosenCode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState("");
  const [safetyFlag, setSafetyFlag] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const submittingRef = useRef(false);

  const stop = useMemo(() => {
    const items = assignment?.walkLists.flatMap((wl) => wl.items) ?? [];
    return items.find((it) => it.id === stopId) ?? null;
  }, [assignment, stopId]);

  // The campaign's survey (real question/option ids) so answers persist as QuestionResponses.
  // Routed through the cached hooks (not a raw per-door fetch) so the schema lands in the
  // durable cache and a door opened offline still shows its questions. No survey on the
  // campaign → door is disposition-only.
  const campaignId = assignment?.turf.campaignId ?? null;
  const surveyList = useSurveys();
  const surveyMatch = campaignId ? (surveyList.data ?? []).find((s) => s.campaignId === campaignId) ?? null : null;
  const surveyFull = useSurvey(surveyMatch?.id ?? null);
  const survey = useMemo<SurveySchema | null>(() => {
    if (!surveyMatch || !surveyFull.data) return null;
    return {
      category: surveyMatch.name ?? "Survey",
      questions: surveyFull.data.questions
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
            .map((o) => ({
              id: String(o.id),
              value: o.value,
              label: o.label,
              // "Author once, use everywhere": surface the option's dual-channel mapping under
              // each choice — the door-button label and the SMS canned reply it logs.
              hint: o.cannedReplyText ? `Door: "${o.label}" · SMS: "${o.cannedReplyText}"` : `Door: "${o.label}"`,
            })),
        })),
    };
  }, [surveyMatch, surveyFull.data]);

  // The informed knock: this resident's recent contact history — cached + durable so it
  // survives going offline.
  const contactId = stop?.contact.id as string | undefined;
  const profile = useContactProfile(contactId ?? null).data ?? null;

  async function record(code: string, answers?: SurveyAnswer[]) {
    if (!stop) return;
    // Guard against a double-tap recording two knocks (distinct localIds) before
    // the first enqueue completes — the server would accept both as separate knocks.
    if (submittingRef.current) return;
    // A knock without a volunteer id is rejected server-side as a terminal CONFLICT,
    // stranding it in the sync centre. Bail with a clear message instead.
    const volunteerId = getVolunteerId();
    if (!volunteerId) {
      showToast({
        tone: "error",
        title: "Not signed in",
        description: "Your volunteer session was lost — sign in again to record knocks.",
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
          volunteerId,
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
      // IDB write failed — let the volunteer retry rather than silently lose the knock.
      submittingRef.current = false;
      setSaving(false);
      showToast({
        tone: "error",
        title: "Couldn't save knock",
        description: error instanceof Error ? error.message : "Try again.",
      });
      return;
    }
    // Match the comp's logging language: name the outcome, reassure it's saved
    // offline-first (written to this phone before any sync).
    const label = dispositions.find((d) => d.code === code)?.label ?? code.replaceAll("_", " ");
    showToast(
      answers?.length
        ? { tone: "success", title: "Conversation + survey logged", description: "Saved offline" }
        : { tone: "success", title: `Logged: ${label}`, description: "Saved offline" },
    );
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
      <div className="flex items-start gap-3">
        <button
          type="button"
          aria-label="Back"
          onClick={() => router.push(`/field/${turfId}`)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-foreground"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-extrabold">{name}</h1>
          <p className="text-sm text-muted-foreground">{(contact.address as string) ?? "No address"}</p>
        </div>
        {profile?.contact.supportLevel ? (
          <SupportPill level={profile.contact.supportLevel} />
        ) : null}
      </div>

      {profile ? <PriorContactStrip timeline={profile.timeline} /> : null}

      {!showSurvey ? (
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">What happened at the door?</h2>
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
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            GPS captured automatically · one tap logs &amp; advances
          </p>
        </div>
      ) : (
        <SurveyRunner
          schema={survey!}
          onCancel={() => setChosenCode(null)}
          onComplete={(answers) => void record(chosenCode!, answers)}
        />
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
    const volunteerId = getVolunteerId();
    if (!volunteerId || !name.trim()) return;
    setBusy(true);
    const [firstName, ...rest] = name.trim().split(/\s+/);
    const res = await createDoorContact({
      volunteerId,
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
