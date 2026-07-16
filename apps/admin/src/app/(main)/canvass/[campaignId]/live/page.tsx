"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, Bell, DoorOpen, Radio, Users } from "lucide-react";
import { CampaignPageHeader } from "@/components/canvass/campaign-page-header";
import { getCampaignLive } from "@/lib/api/campaigns";
import { broadcastPush } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { StateRegion } from "@/components/shell/state-region";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { FormDialog } from "@/components/ui/form-dialog";
import { useToast } from "@/components/ui/toast";
import { KpiTile } from "@uprise/field";
import { SectionCard } from "@uprise/field";
import { DataTable } from "@uprise/field";
import { StatusBadge } from "@/components/ui/status-badge";

function ago(iso: string | null): string {
  if (!iso) return "—";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return mins < 1 ? "just now" : mins < 60 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`;
}

export default function LiveWarRoomPage() {
  // Undefined on the campaign-less aggregate route (/canvass/live) — then the war room spans
  // every campaign; defined on the [campaignId] scoped route.
  const { campaignId } = useParams<{ campaignId?: string }>();
  const { showToast } = useToast();
  // Poll the live snapshot every 10s (paused when the tab is hidden). useApi keeps prior
  // data on a failed refresh but still surfaces error/no-permission distinctly.
  const { data: live, loading, error, noPermission, refetch } = useApi(
    campaignId ? `/canvass/${campaignId}/live` : "/canvass/live",
    () => getCampaignLive(campaignId),
    { refetchInterval: 10_000 },
  );
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function sendBroadcast() {
    if (!message.trim()) return;
    setSending(true);
    const res = await broadcastPush({ title: "Message from your organiser", body: message.trim(), url: "/field" });
    setSending(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't send", description: res.error });
      return;
    }
    setBroadcastOpen(false);
    setMessage("");
    showToast(
      res.data.enabled
        ? { tone: "success", title: `Sent to ${res.data.sent} device${res.data.sent === 1 ? "" : "s"}` }
        : { tone: "warning", title: "Push not configured", description: "Set VAPID keys + FEATURE_PUSH_ENABLED." },
    );
  }

  if (!live) {
    return (
      <div className="page-stack">
        <CampaignPageHeader title="Live" icon={Radio} />
        <StateRegion
          loading={loading}
          error={error}
          noPermission={noPermission}
          onRetry={() => void refetch()}
          errorTitle="Can't load live view"
          skeleton={<Skeleton className="h-64 w-full" />}
        >
          {null}
        </StateRegion>
      </div>
    );
  }

  const out = live.volunteers.length;
  const idle = live.volunteers.filter((c) => c.idle);

  return (
    <div className="page-stack">
      <CampaignPageHeader
        title="Live"
        icon={Radio}
        actions={
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-container px-2.5 py-1 text-xs font-semibold text-success">
              <Radio className="h-3.5 w-3.5 animate-pulse" />
              Live · {out} out
            </span>
            <Button size="sm" variant="outline" onClick={() => setBroadcastOpen(true)}>
              <Bell className="mr-1.5 h-3.5 w-3.5" />
              Notify field
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiTile label="Volunteers out" value={out} icon={<Users className="h-4 w-4" />} />
        <KpiTile label="Doors today" value={live.doorsToday} icon={<DoorOpen className="h-4 w-4" />} />
        <KpiTile label="Idle" value={idle.length} icon={<AlertTriangle className="h-4 w-4" />} />
      </div>

      {idle.length > 0 ? (
        <SectionCard title="Alerts">
          <ul className="space-y-1.5">
            {idle.map((c) => (
              <li key={c.volunteerId} className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-warning-foreground" />
                <span className="text-foreground">
                  {c.name} idle on {c.turf} — no knock in 30+ min
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <SectionCard title="Volunteers">
          <DataTable
            rows={live.volunteers}
            rowKey={(c) => c.volunteerId}
            empty="No volunteers out right now."
            columns={[
              { key: "name", header: "Name", cell: (c) => c.name },
              { key: "turf", header: "Turf", cell: (c) => c.turf },
              { key: "doors", header: "Doors", numeric: true, cell: (c) => c.doorsToday },
              { key: "last", header: "Last action", cell: (c) => ago(c.lastActionAt) },
              {
                key: "status",
                header: "Status",
                cell: (c) => <StatusBadge status={c.idle ? "PENDING_SYNC" : "ACTIVE"} />,
              },
            ]}
          />
        </SectionCard>

        <SectionCard title="Recent knocks">
          {live.recentKnocks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No knocks yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {live.recentKnocks.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-foreground">
                    {(k.dispositionCode ?? "knock").replaceAll("_", " ")}
                    {k.volunteer ? ` · ${k.volunteer}` : ""}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{ago(k.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <FormDialog
        open={broadcastOpen}
        title="Message the field"
        description="Sends a push notification to every volunteer with notifications on."
        onClose={() => setBroadcastOpen(false)}
        onSubmit={sendBroadcast}
        submitLabel="Send"
        busy={sending}
        submitDisabled={!message.trim()}
      >
        <Field label="Message" htmlFor="broadcast-msg" required>
          <Textarea
            id="broadcast-msg"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. Great work — 30 mins left, push for the last doors!"
            rows={3}
            autoFocus
          />
        </Field>
      </FormDialog>
    </div>
  );
}
