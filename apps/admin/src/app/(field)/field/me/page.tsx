"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Bell, BellRing, CloudOff, DoorOpen, RefreshCw } from "lucide-react";
import { useFieldPush } from "@/hooks/use-field-push";
import {
  getCanvassAssignments,
  releaseTurf,
  type CanvassAssignment,
} from "@/lib/api";
import { getVolunteerId } from "@/lib/canvass/volunteer";
import { useSyncQueue } from "@/hooks/use-sync-queue";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { KpiTile } from "@/components/canvass/kpi-tile";
import { SectionCard } from "@/components/canvass/section-card";
import { SyncStatusBadge } from "@/components/canvass/sync-status-badge";
import { useToast } from "@/components/ui/toast";

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs}h ago` : `${Math.round(hrs / 24)}d ago`;
}

export default function SyncCentrePage() {
  const { counts, pending, conflicts, online, flush, retryConflict, discardConflict } = useSyncQueue();
  const { showToast } = useToast();
  const push = useFieldPush();
  const [assignments, setAssignments] = useState<CanvassAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [releaseId, setReleaseId] = useState<string | null>(null);

  const loadAssignments = useCallback(async () => {
    const volunteerId = getVolunteerId();
    if (!volunteerId) {
      setLoading(false);
      return;
    }
    const res = await getCanvassAssignments(volunteerId);
    if (res.ok) setAssignments(res.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  const tally = useMemo(() => {
    const items = assignments.flatMap((a) => a.walkLists.flatMap((wl) => wl.items));
    return {
      done: items.filter((i) => i.status !== "PENDING").length,
      total: items.length,
    };
  }, [assignments]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    await flush();
    setSyncing(false);
    showToast({ tone: "success", title: "Synced", description: "Pending knocks pushed." });
  }, [flush, showToast]);

  const handleRelease = useCallback(async () => {
    const turfId = releaseId;
    setReleaseId(null);
    if (!turfId) return;
    const volunteerId = getVolunteerId();
    if (!volunteerId) return;
    const res = await releaseTurf(turfId, volunteerId);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't release turf", description: res.error });
      return;
    }
    await loadAssignments();
    showToast({ tone: "success", title: "Turf released" });
  }, [releaseId, loadAssignments, showToast]);

  const unsynced = counts.PENDING + counts.SYNCING;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/field" className="flex items-center gap-1 text-sm font-medium">
          <ArrowLeft className="h-4 w-4" />
          Turf
        </Link>
        <SyncStatusBadge counts={counts} online={online} />
      </div>

      <h1 className="text-2xl font-extrabold">Sync &amp; profile</h1>

      <div className="grid grid-cols-3 gap-2">
        <KpiTile label="Doors done" value={tally.done} />
        <KpiTile label="To sync" value={unsynced} />
        <KpiTile label="Conflicts" value={counts.CONFLICT} />
      </div>

      <SectionCard
        title="Unsynced records"
        action={
          <Button size="sm" variant="outline" onClick={handleSync} disabled={syncing || unsynced === 0}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            {syncing ? "Syncing…" : "Sync now"}
          </Button>
        }
      >
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">Everything is synced.</p>
        ) : (
          <ul className="space-y-2">
            {pending.map((r) => (
              <li key={r.localId} className="flex items-center gap-2 text-sm">
                <CloudOff className="h-4 w-4 shrink-0 text-warning-foreground" />
                <span className="flex-1 truncate text-foreground">
                  {String(r.payload.dispositionCode ?? "Door knock").replaceAll("_", " ")}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {ago(r.clientCapturedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {conflicts.length > 0 ? (
        <SectionCard title={`Needs attention (${conflicts.length})`}>
          <p className="mb-2 text-xs text-muted-foreground">
            The server rejected these (e.g. the turf was reassigned). Retry, or discard if no longer valid.
          </p>
          <ul className="space-y-2">
            {conflicts.map((r) => (
              <li key={r.localId} className="flex items-center gap-2 rounded-xl border border-error/30 bg-error-container/40 px-3 py-2 text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0 text-error" />
                <span className="flex-1 truncate text-foreground">
                  {String(r.payload.dispositionCode ?? "Door knock").replaceAll("_", " ")}
                </span>
                <button
                  type="button"
                  onClick={() => void retryConflict(r.localId)}
                  className="text-xs font-semibold text-primary"
                >
                  Retry
                </button>
                <button
                  type="button"
                  onClick={() => void discardConflict(r.localId)}
                  className="text-xs font-semibold text-error"
                >
                  Discard
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      {push.enabled ? (
        <SectionCard title="Notifications">
          {push.subscribed ? (
            <p className="flex items-center gap-2 text-sm text-success">
              <BellRing className="h-4 w-4" />
              Notifications on for this device.
            </p>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Get pinged when an organiser sends the team a message.
              </p>
              <Button
                size="sm"
                disabled={push.busy || push.permission === "denied"}
                onClick={async () => {
                  const ok = await push.enable();
                  showToast(
                    ok
                      ? { tone: "success", title: "Notifications on" }
                      : { tone: "error", title: "Couldn't enable", description: "Permission denied or unsupported." },
                  );
                }}
              >
                <Bell className="mr-1.5 h-4 w-4" />
                {push.busy ? "Enabling…" : "Enable"}
              </Button>
            </div>
          )}
        </SectionCard>
      ) : null}

      <SectionCard title="Turf">
        {loading ? (
          <Skeleton className="h-16 w-full" />
        ) : assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No turf currently assigned to you.</p>
        ) : (
          <ul className="space-y-2">
            {assignments.map((a) => (
              <li key={a.turfId} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <DoorOpen className="h-4 w-4 text-primary" />
                  {a.turf.name}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-error/40 text-error"
                  onClick={() => setReleaseId(a.turfId)}
                >
                  Release
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <ConfirmDialog
        open={releaseId !== null}
        title="Release this turf?"
        description="It returns to the organiser to reassign. Sync your knocks first so nothing is lost."
        confirmLabel="Release turf"
        onConfirm={handleRelease}
        onCancel={() => setReleaseId(null)}
      />
    </div>
  );
}
