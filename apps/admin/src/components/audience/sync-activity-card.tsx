"use client";

import { useMemo, useState } from "react";
import {
  integrations,
  type IntegrationDataSyncSettings,
  type PushDeliveryRecord,
  type SyncStreamKey,
} from "@uprise/api-client";
import { useApi, invalidateApi } from "@/lib/use-api";
import {
  canRetryDelivery,
  deriveDeliveryBadge,
  describeDeliveryError,
  DELIVERY_STREAM_LABELS,
  STREAM_LABELS,
  summariseDelivery,
} from "@/lib/sync-activity";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTable, RefreshButton, ToggleRow } from "@uprise/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import type { IntegrationConnectionRow } from "@/lib/api";

/**
 * "Sync activity — what uprise sent back." The write-back's transparency surface:
 * per-stream toggles (opt-outs shown always-on: pushing a STOP to the org's CRM is a
 * compliance duty, not a preference) and the delivery ledger with per-row reasons and
 * a Retry for FAILED rows. Polls gently — the ledger updates as canvassers knock.
 */
export function SyncActivityCard({ connections }: { connections: IntegrationConnectionRow[] }) {
  const { showToast } = useToast();
  const nbConnections = useMemo(() => connections.filter((c) => c.type === "NATION_BUILDER"), [connections]);
  const [connectionId, setConnectionId] = useState(nbConnections[0]?.id ?? "");
  const active = nbConnections.find((c) => c.id === connectionId) ?? nbConnections[0];
  const [streamFilter, setStreamFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [retrying, setRetrying] = useState("");
  const [savingStream, setSavingStream] = useState("");

  const deliveriesKey = active
    ? `/integrations/push-deliveries?c=${active.id}&s=${streamFilter}&st=${statusFilter}`
    : null;
  const deliveries = useApi(
    deliveriesKey,
    () =>
      integrations.listPushDeliveries({
        connectionId: active!.id,
        stream: streamFilter || undefined,
        status: statusFilter || undefined,
        limit: 25,
      }),
    { refetchInterval: 10_000 },
  );

  // The stored settings ride the connection row's settings JSON; parse the push half
  // with safe defaults matching the api's parser.
  const settings = useMemo(() => parsePushSettings(active?.settings), [active]);

  const toggleStream = async (key: SyncStreamKey, next: boolean) => {
    if (!active) return;
    setSavingStream(key);
    const res = await integrations.updateDataSyncSettings(active.id, { push: { streams: { [key]: next } } });
    setSavingStream("");
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't save the setting", description: res.error });
      return;
    }
    invalidateApi("/integrations/connections");
  };

  const togglePush = async (next: boolean) => {
    if (!active) return;
    setSavingStream("enabled");
    const res = await integrations.updateDataSyncSettings(active.id, { push: { enabled: next } });
    setSavingStream("");
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't save the setting", description: res.error });
      return;
    }
    invalidateApi("/integrations/connections");
    showToast({
      tone: "success",
      title: next ? "Push to NationBuilder is on" : "Push to NationBuilder is off",
      description: next
        ? "Door-knocks, survey answers and opt-outs will flow back to this nation."
        : "Nothing further will be sent; queued updates stop.",
    });
  };

  const retry = async (row: PushDeliveryRecord) => {
    setRetrying(row.id);
    const res = await integrations.retryPushDelivery(row.id);
    setRetrying("");
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't retry", description: res.error });
      return;
    }
    deliveries.mutate?.((prev) => ({
      total: prev?.total ?? 0,
      rows: (prev?.rows ?? []).map((r) => (r.id === row.id ? { ...r, status: "PENDING" as const } : r)),
    }));
    showToast({ tone: "success", title: "Retry queued" });
  };

  if (nbConnections.length === 0) return null;

  return (
    <Card id="data-sync-activity">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Sync activity – what uprise sent back</CardTitle>
        {nbConnections.length > 1 && (
          <Select
            value={active?.id ?? ""}
            onValueChange={setConnectionId}
            title="Which nation's activity to show"
            className="w-52"
          >
            {nbConnections.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </Select>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Master switch + stream toggles */}
        <div className="space-y-2 rounded-lg border border-border p-3">
          <ToggleRow
            label={<span className="font-semibold">Push to NationBuilder</span>}
            checked={settings.enabled}
            busy={savingStream === "enabled"}
            onCheckedChange={(v) => void togglePush(v)}
            aria-label="Push to NationBuilder"
          />
          <div className="grid gap-1.5 sm:grid-cols-2">
            {(Object.keys(STREAM_LABELS) as SyncStreamKey[]).map((key) => (
              <ToggleRow
                key={key}
                label={<span className={settings.enabled ? "" : "text-muted-foreground"}>{STREAM_LABELS[key]}</span>}
                checked={settings.streams[key]}
                disabled={!settings.enabled}
                busy={savingStream === key}
                onCheckedChange={(v) => void toggleStream(key, v)}
                aria-label={STREAM_LABELS[key]}
              />
            ))}
            {/* A STOP must reach the org's CRM — shown checked and immovable. */}
            <ToggleRow
              label={
                <span className={settings.enabled ? "" : "text-muted-foreground"}>
                  Opt-outs <span className="text-xs text-muted-foreground">(always on)</span>
                </span>
              }
              checked
              disabled
              onCheckedChange={() => {}}
              aria-label="Opt-outs (always on)"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Support levels are only ever sent for door-knocks where consent was recorded, and only while
            the door-knock stream is on.
          </p>
        </div>

        {/* Delivery log */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={streamFilter} onValueChange={setStreamFilter} title="Filter by stream" className="w-44" placeholder="All streams">
            <SelectItem value="">All streams</SelectItem>
            {Object.entries(DELIVERY_STREAM_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter} title="Filter by status" className="w-40" placeholder="All statuses">
            <SelectItem value="">All statuses</SelectItem>
            {["SUCCEEDED", "FAILED", "SKIPPED", "HELD", "PENDING"].map((s) => (
              <SelectItem key={s} value={s}>
                {s === "SUCCEEDED" ? "Sent" : s === "HELD" ? "On hold" : s.charAt(0) + s.slice(1).toLowerCase()}
              </SelectItem>
            ))}
          </Select>
          <RefreshButton onClick={() => void deliveries.refetch?.()} refreshing={deliveries.loading} />
        </div>

        {deliveries.loading && !deliveries.data ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : deliveries.error ? (
          <EmptyState title="We couldn't load the delivery log" description={deliveries.error} />
        ) : (deliveries.data?.rows.length ?? 0) === 0 ? (
          <EmptyState
            title="Nothing sent back yet"
            description="Once people in a synced audience are door-knocked, texted or opt out, each update to NationBuilder appears here."
          />
        ) : (
          <div>
            <DataTable
              aria-label="Delivery log"
              rows={deliveries.data!.rows}
              rowKey={(row) => row.id}
              pageSize={0}
              columns={[
                {
                  key: "when",
                  header: "When",
                  cell: (row) => <span className="text-muted-foreground">{new Date(row.createdAt).toLocaleString()}</span>,
                },
                { key: "what", header: "What", cell: (row) => summariseDelivery(row) },
                { key: "status", header: "Status", cell: (row) => <StatusBadge status={deriveDeliveryBadge(row.status)} /> },
                {
                  key: "why",
                  header: "Why",
                  cell: (row) => (
                    <span className="block max-w-[320px] text-xs text-muted-foreground">{describeDeliveryError(row)}</span>
                  ),
                },
                {
                  key: "retry",
                  header: "",
                  numeric: true,
                  cell: (row) =>
                    canRetryDelivery(row) ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={retrying === row.id}
                        onClick={() => void retry(row)}
                      >
                        Retry
                      </Button>
                    ) : null,
                },
              ]}
            />
            <p className="pt-2 text-xs text-muted-foreground">
              Showing {deliveries.data!.rows.length} of {deliveries.data!.total.toLocaleString()}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** The stored push settings with the api parser's defaults (absent blob = fresh connection). */
function parsePushSettings(settings: Record<string, unknown> | null | undefined): {
  enabled: boolean;
  streams: Record<SyncStreamKey, boolean>;
} {
  const push =
    settings && typeof settings === "object"
      ? ((settings as { dataSync?: { push?: Partial<IntegrationDataSyncSettings["push"]> } }).dataSync?.push ?? {})
      : {};
  const streams = (push.streams ?? {}) as Partial<Record<SyncStreamKey, boolean>>;
  return {
    enabled: push.enabled === true,
    streams: {
      dispositions: streams.dispositions !== false,
      surveyAnswers: streams.surveyAnswers !== false,
      tags: streams.tags !== false,
      textReplies: streams.textReplies === true,
      rsvps: streams.rsvps !== false,
    },
  };
}
