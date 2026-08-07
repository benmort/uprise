"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, MapPin, ShieldAlert } from "lucide-react";
import { Button, Card, useToast } from "@uprise/ui";
import { DispositionPad, SurveyRunner, type SurveyAnswer } from "@uprise/field";
import { DEMO_ASSIGNMENT, DEMO_DISPOSITIONS, DEMO_SURVEY } from "../../fixture";

// Mirrors the live door screen's rule: "Spoke to …" reveals the survey, everything else
// is a one-tap outcome.
const SURVEY_TRIGGER_CODES = new Set(["spoke_to_target", "spoke_to_other"]);

/**
 * The demo door — what happens after a visitor taps Knock on the demo walk view.
 *
 * Assembled from the REAL door components (<DispositionPad>, <SurveyRunner>) over fixture
 * data, in the live screen's layout, so the tour shows the actual knock experience: outcome
 * pad first, "Spoke to …" opens the campaign survey, notes and the safety flag underneath.
 * What it deliberately does not carry from the live screen (`DoorEntry`): the offline sync
 * queue, GPS capture, the photo control and household add — those are write paths, and this
 * page's contract is that a knock ends in a toast, not a record.
 */
export function DemoDoor({ stopId, embedded }: { stopId: string; embedded: boolean }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [chosenCode, setChosenCode] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [notes, setNotes] = useState("");
  const [safetyFlag, setSafetyFlag] = useState(false);

  const backHref = embedded ? "/demo?embed=1" : "/demo";

  const stop = useMemo(() => {
    const items = DEMO_ASSIGNMENT.walkLists.flatMap((wl) => wl.items);
    return items.find((it) => it.id === stopId) ?? null;
  }, [stopId]);

  /** Every path out of the door: name the outcome, say it's demo-only, go back to the walk. */
  function finish(code: string, answers?: SurveyAnswer[]) {
    const label =
      DEMO_DISPOSITIONS.find((d) => d.code === code)?.label ?? code.replaceAll("_", " ");
    showToast(
      answers?.length
        ? {
            tone: "success",
            title: "Conversation + survey logged",
            description: "Demo only — nothing is saved.",
          }
        : { tone: "success", title: `Logged: ${label}`, description: "Demo only — nothing is saved." },
    );
    router.push(backHref);
  }

  if (!stop) {
    return (
      <Card className="space-y-3 p-4">
        <p className="text-sm text-muted-foreground">This door isn&apos;t in the demo walk list.</p>
        <Button className="w-full" onClick={() => router.push(backHref)}>
          Back to walk list
        </Button>
      </Card>
    );
  }

  const contact = stop.contact;
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Resident";
  const showSurvey = Boolean(chosenCode);

  return (
    <div className="space-y-4">
      {embedded ? null : (
        <div className="rounded-xl border border-border bg-surface-variant px-3.5 py-2.5">
          <p className="text-xs font-semibold text-foreground">Demo data</p>
          <p className="text-xs text-muted-foreground">
            An invented resident — tap any outcome to see the flow. Nothing is saved.
          </p>
        </div>
      )}

      <div className="flex items-start gap-3">
        <button
          type="button"
          aria-label="Back"
          onClick={() => router.push(backHref)}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface text-foreground"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-extrabold text-foreground">{name}</h1>
          <p className="truncate text-sm text-muted-foreground">
            {typeof contact.address === "string" && contact.address ? contact.address : "No address"}
          </p>
        </div>
      </div>

      {!showSurvey ? (
        <div className="space-y-4">
          <h2 className="text-lg font-extrabold text-foreground">What happened at the door?</h2>
          <DispositionPad
            options={DEMO_DISPOSITIONS}
            firstName={typeof contact.firstName === "string" ? contact.firstName : null}
            consent={consent}
            onConsentChange={setConsent}
            orgName="the campaign"
            onSelect={(code) => {
              if (SURVEY_TRIGGER_CODES.has(code)) setChosenCode(code);
              else finish(code);
            }}
          />
          <p className="flex items-center justify-center gap-1.5 pt-1 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            In the live app, GPS is captured automatically · one tap logs &amp; advances
          </p>
        </div>
      ) : (
        <SurveyRunner
          schema={DEMO_SURVEY}
          onCancel={() => setChosenCode(null)}
          onComplete={(answers) => finish(chosenCode!, answers)}
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
      </div>

      <Button variant="ghost" className="w-full" onClick={() => router.push(backHref)}>
        Back to walk list
      </Button>
    </div>
  );
}
