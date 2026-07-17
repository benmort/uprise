"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarClock, ChevronLeft, Loader2, MapPin, Users } from "lucide-react";
import { Button, EmptyState, Skeleton } from "@uprise/ui";
import {
  getAvailableShifts,
  getMyShifts,
  signUpShift,
  releaseShift,
  type AvailableShift,
  type MyShift,
} from "../api/shifts";

function when(startsAt: string, endsAt: string): string {
  const s = new Date(startsAt);
  const e = new Date(endsAt);
  return `${s.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}, ${s.toLocaleTimeString(
    undefined,
    { hour: "2-digit", minute: "2-digit" },
  )} – ${e.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

/**
 * Volunteer "Pick a shift" — the shift analogue of GetTurf. Lists open shifts in a
 * campaign (gated by the campaign's self-serve switch) with seat counts; sign-up lands
 * ASSIGNED, or REQUESTED when the campaign requires organiser approval. `?campaignId=`
 * scopes the available list; "My shifts" spans every campaign.
 */
export function Shifts() {
  const router = useRouter();
  const params = useSearchParams();
  const campaignId = params.get("campaignId") ?? "";

  const [available, setAvailable] = useState<AvailableShift[] | null>(null);
  const [mine, setMine] = useState<MyShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [av, my] = await Promise.all([
      campaignId ? getAvailableShifts(campaignId) : Promise.resolve(null),
      getMyShifts(),
    ]);
    if (av && !av.ok) setError(av.error);
    setAvailable(av && av.ok ? av.data : []);
    if (my.ok) setMine(my.data);
    setLoading(false);
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  const doSignUp = async (shiftId: string) => {
    setBusy(shiftId);
    const res = await signUpShift(campaignId, shiftId);
    setBusy(null);
    if (res.ok) void load();
  };

  const doRelease = async (campaign: string | null, shiftId: string) => {
    if (!campaign) return;
    setBusy(shiftId);
    const res = await releaseShift(campaign, shiftId);
    setBusy(null);
    if (res.ok) void load();
  };

  return (
    <div className="mx-auto max-w-xl px-4 pb-24 pt-4">
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-bold">Shifts</h1>
      </div>

      {/* My shifts */}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">My upcoming shifts</h2>
        {loading ? (
          <Skeleton className="h-20 w-full" />
        ) : mine.length === 0 ? (
          <p className="text-sm text-muted-foreground">You haven&apos;t signed up for any shifts yet.</p>
        ) : (
          <ul className="space-y-2">
            {mine.map((m) => (
              <li key={m.assignmentId} className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{m.shift.name}</p>
                    <p className="text-xs text-muted-foreground">{when(m.shift.startsAt, m.shift.endsAt)}</p>
                    <p className="text-xs font-medium text-primary">{m.status === "REQUESTED" ? "Requested — awaiting approval" : "Confirmed"}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy === m.shift.id}
                    onClick={() => doRelease(m.shift.campaignId, m.shift.id)}
                  >
                    Cancel
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Available shifts */}
      <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Available shifts</h2>
      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : !campaignId ? (
        <EmptyState title="No campaign selected" description="Open this from a campaign to browse its open shifts." />
      ) : error ? (
        <EmptyState title="Can't load shifts" description={error} />
      ) : (available?.length ?? 0) === 0 ? (
        <EmptyState title="No open shifts" description="There are no shifts to sign up for right now." />
      ) : (
        <ul className="space-y-2">
          {available!.map((s) => (
            <li key={s.id} className="rounded-xl border border-border p-3">
              <p className="text-sm font-semibold">{s.name}</p>
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-0.5">
                  <CalendarClock className="h-3 w-3" />
                  {when(s.startsAt, s.endsAt)}
                </span>
                {s.location ? (
                  <span className="flex items-center gap-0.5">
                    <MapPin className="h-3 w-3" />
                    {s.location}
                  </span>
                ) : null}
                <span className="flex items-center gap-0.5">
                  <Users className="h-3 w-3" />
                  {s.assignedCount}
                  {s.capacity != null ? `/${s.capacity}` : ""}
                </span>
              </p>
              <div className="mt-2">
                {s.mine ? (
                  <Button variant="outline" size="sm" disabled={busy === s.id} onClick={() => doRelease(s.campaignId, s.id)}>
                    {s.mine === "REQUESTED" ? "Requested — cancel" : "You're on — cancel"}
                  </Button>
                ) : s.isFull ? (
                  <Button variant="outline" size="sm" disabled>
                    Full
                  </Button>
                ) : (
                  <Button size="sm" disabled={busy === s.id} onClick={() => doSignUp(s.id)}>
                    {busy === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign up"}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
