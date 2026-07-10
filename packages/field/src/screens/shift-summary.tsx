"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, PartyPopper } from "lucide-react";
import { Button, ConfirmDialog, Skeleton, useToast } from "@uprise/ui";
import { releaseTurf } from "../api";
import { useAssignments, useVolunteerMetrics } from "../hooks/use-canvass";
import { invalidateApi } from "../hooks/use-api";
import { getVolunteerId, getVolunteerName } from "../lib/volunteer";
import { KpiTile } from "../components/kpi-tile";
import { SectionCard } from "../components/section-card";

/**
 * End-of-shift wrap-up (Gap G5): today's tally, a "nice work" note, and release
 * the turf so it returns to the organiser. Reuses getVolunteerMetrics + releaseTurf
 * — no new backend. Reached from the sync centre's "Done for the day".
 */
export function ShiftSummary() {
  const router = useRouter();
  const { showToast } = useToast();
  const name = getVolunteerName();
  const [volunteerId] = useState(() => getVolunteerId());
  const m = useVolunteerMetrics(volunteerId ?? null);
  const a = useAssignments(volunteerId ?? null);
  const metrics = m.data ?? null;
  const assignments = a.data ?? [];
  const loading = m.loading || a.loading;
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [releasing, setReleasing] = useState(false);

  const releaseEverything = useCallback(async () => {
    setConfirmRelease(false);
    const volunteerId = getVolunteerId();
    if (!volunteerId) return;
    setReleasing(true);
    const results = await Promise.all(assignments.map((a) => releaseTurf(a.turfId, volunteerId)));
    setReleasing(false);
    if (results.some((r) => !r.ok)) {
      showToast({
        tone: "error",
        title: "Couldn't release every turf",
        description: "Try again from the sync centre.",
      });
      invalidateApi("/canvass"); // refetch the shared assignments cache after a partial release
      return;
    }
    invalidateApi("/canvass"); // all turfs released — clear them from every screen's cache
    showToast({ tone: "success", title: "Turf released — see you next shift" });
    router.push("/field");
  }, [assignments, router, showToast]);

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-5">
      <Link href="/field/me" className="flex items-center gap-1 text-sm font-medium">
        <ArrowLeft className="h-4 w-4" />
        Sync &amp; profile
      </Link>

      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <PartyPopper className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold leading-tight">Nice work{name ? `, ${name}` : ""}</h1>
          <p className="text-sm text-muted-foreground">Here&apos;s your day on the doors.</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <KpiTile label="doors knocked" value={metrics?.doorsToday ?? 0} />
        <KpiTile label="conversations" value={metrics?.conversationsToday ?? 0} />
        <KpiTile label="surveys done" value={metrics?.surveysToday ?? 0} />
      </div>

      <SectionCard title="Wrap up">
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No turf to release — you&apos;re all done.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Done knocking? Release your {assignments.length === 1 ? "turf" : `${assignments.length} turfs`} so an
              organiser can reassign{assignments.length === 1 ? " it" : " them"}. Sync first so nothing is lost.
            </p>
            <Button
              variant="outline"
              className="w-full border-error/40 text-error"
              disabled={releasing}
              onClick={() => setConfirmRelease(true)}
            >
              {releasing ? "Releasing…" : "Release turf & end shift"}
            </Button>
          </div>
        )}
      </SectionCard>

      <ConfirmDialog
        open={confirmRelease}
        title="Release your turf?"
        description="It returns to the organiser to reassign. Make sure your knocks are synced first."
        confirmLabel="Release & end shift"
        onConfirm={releaseEverything}
        onCancel={() => setConfirmRelease(false)}
      />
    </div>
  );
}
