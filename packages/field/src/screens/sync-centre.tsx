"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Bell, BellRing, CheckCircle2, CloudOff, DoorOpen, LogOut, RefreshCw, X } from "lucide-react";
import { Button, Skeleton, ConfirmDialog, useToast } from "@uprise/ui";
import { useFieldPush } from "../hooks/use-field-push";
import { releaseTurf } from "../api";
import { useAssignments } from "../hooks/use-canvass";
import { invalidateApi } from "../hooks/use-api";
import { getVolunteerId, getVolunteerName, greeting } from "../lib/volunteer";
import { logout } from "../lib/session";
import { useSyncQueue } from "../hooks/use-sync-queue";
import { SectionCard } from "../components/section-card";
import { SyncStatusBadge } from "../components/sync-status-badge";

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs}h ago` : `${Math.round(hrs / 24)}d ago`;
}

/** `onClose`, when given, renders this inside the fullscreen "me" drawer — the header's
 *  back-to-turf link becomes a Close button that dismisses the drawer. */
export function SyncCentre({ onClose }: { onClose?: () => void } = {}) {
  const { counts, pending, conflicts, online, flush, retryConflict, discardConflict } = useSyncQueue();
  const { showToast } = useToast();
  const push = useFieldPush();
  const [volunteerId] = useState(() => getVolunteerId());
  const name = getVolunteerName();
  const a = useAssignments(volunteerId ?? null);
  const assignments = a.data ?? [];
  const loading = a.loading;
  const [syncing, setSyncing] = useState(false);
  const [releaseId, setReleaseId] = useState<string | null>(null);
  const [releasing, setReleasing] = useState(false);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    await flush();
    setSyncing(false);
    showToast({ tone: "success", title: "Synced", description: "Pending knocks pushed." });
  }, [flush, showToast]);

  const handleRelease = useCallback(async () => {
    const turfId = releaseId;
    if (!turfId) return;
    const volunteerId = getVolunteerId();
    if (!volunteerId) {
      setReleaseId(null);
      return;
    }
    // Hold the confirm dialog open + show the in-button spinner while the release is in flight,
    // then dismiss — the canvasser sees it working, not a dialog that vanishes with no feedback.
    setReleasing(true);
    const res = await releaseTurf(turfId, volunteerId);
    setReleasing(false);
    setReleaseId(null);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't release turf", description: res.error });
      return;
    }
    invalidateApi("/canvass"); // drop the released turf from every screen's shared cache
    showToast({ tone: "success", title: "Turf released" });
  }, [releaseId, showToast]);

  const unsynced = counts.PENDING + counts.SYNCING;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {onClose ? (
          <button type="button" onClick={onClose} className="flex items-center gap-1 text-sm font-medium">
            <X className="h-4 w-4" />
            Close
          </button>
        ) : (
          <Link href="/" className="flex items-center gap-1 text-sm font-medium">
            <ArrowLeft className="h-4 w-4" />
            Turf
          </Link>
        )}
      </div>

      <h1 className="text-2xl font-extrabold">
        {greeting()}
        {name ? `, ${name}` : ""}
      </h1>

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

      <SectionCard
        title="Data Sync"
        action={
          <div className="flex items-center gap-2">
            {/* The sync-state chip (Synced / N pending / Offline) lives here now, not the header. */}
            <SyncStatusBadge counts={counts} online={online} />
            <Button size="sm" variant="outline" onClick={handleSync} disabled={syncing || unsynced === 0}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              {syncing ? "Syncing…" : "Sync now"}
            </Button>
          </div>
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

      <Link
        href="/wrap"
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-secondary text-base font-bold text-secondary-foreground transition-colors hover:bg-secondary/90"
      >
        <CheckCircle2 className="h-4 w-4" />
        Done for the day
      </Link>

      {/* Same full-width pill as "Done for the day", bordered so it reads quieter than it. */}
      <button
        type="button"
        onClick={() => void logout()}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border text-base font-bold text-foreground"
      >
        <LogOut className="h-4 w-4" />
        Log out
      </button>

      <ConfirmDialog
        open={releaseId !== null}
        title="Release this turf?"
        description="It returns to the organiser to reassign. Sync your knocks first so nothing is lost."
        confirmLabel="Release turf"
        onConfirm={handleRelease}
        onCancel={() => setReleaseId(null)}
        busy={releasing}
        busyLabel="Releasing…"
      />
    </div>
  );
}
