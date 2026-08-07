"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  getApiUrl,
  getBlastActivity,
  getBlastKpis,
  getBlastStatusDistribution,
  getBlastTrend,
  getRealtimeStreamToken,
  listBlasts,
  retryBlast,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { StateRegion } from "@/components/shell/state-region";
import { EmptyState } from "@/components/ui/empty-state";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipHint } from "@/components/ui/tooltip-hint";
import { getTwilioErrorCodeDescription } from "@/lib/twilio-error-codes";
import { PageHeader } from "@/components/shell/page-header";
import { KpiTile, DataTable, ListFooter } from "@uprise/ui";

type TrendWindow = "all" | "15" | "60" | "240";

export default function BlastDetailsPage() {
  const params = useParams<{ id: string }>();
  const blastId = typeof params?.id === "string" ? params.id : "";
  const [blastTitle, setBlastTitle] = useState("Blast");
  const [blastStatus, setBlastStatus] = useState("DRAFTED");
  const [kpis, setKpis] = useState<Record<string, number>>({});
  const [trend, setTrend] = useState<Array<Record<string, unknown>>>([]);
  const [activity, setActivity] = useState<Array<Record<string, unknown>>>([]);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityPage, setActivityPage] = useState(0);
  const [activityPageSize, setActivityPageSize] = useState(10);
  const [trendWindow, setTrendWindow] = useState<TrendWindow>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [noPermission, setNoPermission] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [statusDistribution, setStatusDistribution] = useState<Array<Record<string, unknown>>>([]);
  const [streamStatus, setStreamStatus] = useState("idle");
  const trendRange: number | "all" = trendWindow === "all" ? "all" : Number(trendWindow);

  const loadForBlast = async (id: string, page = activityPage) => {
    setError("");
    // noPermission is sticky (set only on 403 below) — resetting it each poll would flash
    // the empty layout every 8s; the polling/SSE effects tear down once it's true.
    const [kpiRes, trendRes, activityRes, statusRes] = await Promise.all([
      getBlastKpis(id),
      getBlastTrend(id, trendRange),
      getBlastActivity(id, activityPageSize, page * activityPageSize),
      getBlastStatusDistribution(id),
    ]);
    if (!kpiRes.ok && kpiRes.status === 403) {
      setNoPermission(true);
      setLoading(false);
      return;
    }
    if (kpiRes.ok) setKpis(kpiRes.data as Record<string, number>);
    if (trendRes.ok) setTrend(trendRes.data);
    if (activityRes.ok) {
      setActivity(activityRes.data.rows);
      setActivityTotal(Number(activityRes.data.total || 0));
    }
    if (statusRes.ok) setStatusDistribution(statusRes.data);
    const firstFailure = [kpiRes, trendRes, activityRes, statusRes].find((result) => !result.ok);
    if (firstFailure && !firstFailure.ok) setError(firstFailure.error);
    if ([kpiRes, trendRes, activityRes, statusRes].every((result) => result.ok)) {
      setLastUpdatedAt(new Date());
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!blastId) return;
    listBlasts().then((res) => {
      if (!res.ok) {
        setError(res.error);
        setLoading(false);
        return;
      }
      const blast = res.data.find((row) => String((row as any).id) === blastId);
      if (!blast) return;
      setBlastTitle(String((blast as any).title || "Untitled Blast"));
      setBlastStatus(String((blast as any).status || "DRAFTED"));
    });
  }, [blastId]);

  useEffect(() => {
    if (!blastId || noPermission) return;
    setLoading(true);
    void loadForBlast(blastId, activityPage);
    const id = setInterval(() => void loadForBlast(blastId, activityPage), 8000);
    return () => clearInterval(id);
  }, [blastId, activityPage, trendWindow, activityPageSize, noPermission]);

  useEffect(() => {
    if (!blastId || noPermission) return;
    let source: EventSource | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    let reconnectAttempts = 0;

    const clearTimers = () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const closeSource = () => {
      source?.close();
      source = null;
    };

    const scheduleReconnect = (delayMs: number, connect: () => void) => {
      if (cancelled) return;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, delayMs);
    };

    const connect = async () => {
      if (cancelled) return;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      closeSource();
      const tokenRes = await getRealtimeStreamToken();
      if (cancelled) return;
      if (!tokenRes.ok) {
        setStreamStatus("auth_failed");
        scheduleReconnect(10000, () => {
          void connect();
        });
        return;
      }
      const expiresAtMs = Date.parse(tokenRes.data.expiresAt);
      if (Number.isFinite(expiresAtMs)) {
        const refreshInMs = Math.max(5000, expiresAtMs - Date.now() - 30000);
        refreshTimer = setTimeout(() => {
          if (cancelled) return;
          setStreamStatus("refreshing");
          closeSource();
          void connect();
        }, refreshInMs);
      }
      const streamUrl = new URL(`${getApiUrl()}/analytics/stream`);
      streamUrl.searchParams.set("token", tokenRes.data.token);
      source = new EventSource(streamUrl.toString(), { withCredentials: false });
      source.onopen = () => {
        if (!cancelled) setStreamStatus("live");
        reconnectAttempts = 0;
      };
      source.onerror = () => {
        if (!cancelled) setStreamStatus("reconnecting");
        closeSource();
        reconnectAttempts += 1;
        const delayMs = Math.min(15000, 1000 * 2 ** Math.min(reconnectAttempts, 4));
        scheduleReconnect(delayMs, () => {
          void connect();
        });
      };
      source.onmessage = () => {
        void loadForBlast(blastId, activityPage);
      };
    };

    connect();
    return () => {
      cancelled = true;
      clearTimers();
      closeSource();
    };
  }, [blastId, activityPage, trendWindow, activityPageSize, noPermission]);

  const maxTrend = useMemo(() => {
    return Math.max(
      1,
      ...trend.map((row) => Math.max(Number(row.sent || 0), Number(row.responses || 0))),
    );
  }, [trend]);

  if (noPermission) {
    return (
      <div className="page-stack">
        <Breadcrumbs items={[{ label: blastTitle || "Blast Details" }]} />
        <StateRegion noPermission>{null}</StateRegion>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        title={blastTitle}
        description="Detailed blast analytics and recipient outcomes."
        actions={
          <>
            <StatusBadge status={blastStatus} />
            <StatusBadge status={streamStatus === "live" ? "ACTIVE" : "SENDING"} className="capitalize" />
            <Button asChild variant="outline">
              <Link href="/inbox">Blast Inbox</Link>
            </Button>
            <Button asChild>
              <Link href={`/blasts/${encodeURIComponent(blastId)}/composer`}>Open Composer</Link>
            </Button>
          </>
        }
      />

      {error ? (
        <EmptyState
          title="Blast analytics failed to load"
          description={error}
          ctaLabel="Retry"
          onCta={() => blastId && void loadForBlast(blastId, activityPage)}
        />
      ) : null}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={`blast-kpi-skeleton-${index}`} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <KpiTile
            size="md"
            label={
              <>
                Total Contacted
                <TooltipHint label="Recipients with sent, delivered, failed, or responded outcomes." />
              </>
            }
            value={String(kpis.totalContacted ?? kpis.sent ?? 0)}
          />
          <KpiTile size="md" label="Delivered" value={String(kpis.delivered || 0)} />
          <KpiTile
            size="md"
            label={
              <>
                Engagement Rate
                <TooltipHint label="Responded recipients divided by total contacted recipients." />
              </>
            }
            value={`${kpis.totalContacted ? (((kpis.responded || 0) / (kpis.totalContacted || 1)) * 100).toFixed(1) : "0"}%`}
            caption={`${kpis.responded || 0} replies`}
          />
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Engagement Over Time</CardTitle>
          <div className="flex items-center gap-2">
            <TooltipHint label="Time window for the trend chart." />
            <select
              className="h-11 rounded border border-input bg-background px-3 text-sm"
              value={trendWindow}
              onChange={(event) => setTrendWindow(event.target.value as TrendWindow)}
            >
              <option value="all">All time</option>
              <option value={15}>Last 15m</option>
              <option value={60}>Last 60m</option>
              <option value={240}>Last 4h</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-primary/50" />
              Contacted
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-warning-container" />
              Responses
            </span>
          </div>
          <div className="flex h-56 items-end gap-2 overflow-x-auto">
            {trend.map((point) => {
              const sent = Number(point.sent || 0);
              const responses = Number(point.responses || 0);
              return (
                <div
                  key={String(point.bucket)}
                  className="flex min-w-8 flex-1 flex-col items-center gap-1"
                  title={`Contacted ${sent}, Responses ${responses}`}
                >
                  <div
                    className="w-full rounded-t bg-primary/35"
                    style={{ height: `${Math.max(8, (sent / maxTrend) * 160)}px` }}
                  />
                  <div
                    className="w-full rounded-b bg-warning-container"
                    style={{ height: `${Math.max(4, (responses / maxTrend) * 60)}px` }}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(String(point.bucket)).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              );
            })}
            {trend.length === 0 && <p className="text-sm text-muted-foreground">No trend points yet.</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status Distribution</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {statusDistribution.map((row) => (
            <div key={String(row.status)} className="rounded border border-border bg-surface px-3 py-2">
              <StatusBadge status={String(row.status)} />
              <span className="ml-2 text-sm">{String((row as any)._count)}</span>
            </div>
          ))}
          {statusDistribution.length === 0 ? (
            <p className="text-sm text-muted-foreground">No status data yet.</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recipient Activity Log</CardTitle>
          <Button variant="outline" onClick={() => blastId && void loadForBlast(blastId, activityPage)}>
            Refresh Live
          </Button>
        </CardHeader>
        <CardContent className="space-y-4 overflow-x-auto">
          <DataTable
            aria-label="Recipient activity"
            rows={activity}
            rowKey={(row) => String(row.id)}
            pageSize={0}
            empty="No recipient activity yet."
            columns={[
              { key: "recipient", header: "Recipient", cell: (row) => String(row.phoneE164) },
              { key: "status", header: "Status", cell: (row) => <StatusBadge status={String(row.status)} /> },
              {
                key: "last-action",
                header: "Last Action",
                cell: (row) => (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    {getLastActionLabel(row)}
                    {shouldShowReasonPopover(row) ? <TooltipHint label={getRecipientReason(row) || ""} /> : null}
                  </span>
                ),
              },
              {
                key: "timestamp",
                header: "Timestamp",
                cell: (row) => <span className="text-muted-foreground">{formatDate(row.sentAt || row.updatedAt)}</span>,
              },
              {
                key: "action",
                header: "Action",
                cell: (row) =>
                  String(row.status) === "FAILED" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        await retryBlast(blastId);
                        await loadForBlast(blastId, activityPage);
                      }}
                    >
                      Retry
                    </Button>
                  ) : (
                    <Button asChild variant="ghost" size="sm">
                      <Link href="/inbox">View Chat</Link>
                    </Button>
                  ),
              },
            ]}
          />
          <ListFooter
            shown={activity.length}
            total={activityTotal}
            noun="recipients"
            suffix={lastUpdatedAt ? ` • Updated ${lastUpdatedAt.toLocaleTimeString()}` : ""}
            page={activityPage}
            pageSize={activityPageSize}
            onPrev={() => setActivityPage((prev) => Math.max(0, prev - 1))}
            onNext={() => setActivityPage((prev) => prev + 1)}
            onPageSizeChange={(n) => {
              setActivityPage(0);
              setActivityPageSize(n);
            }}
            pageSizeOptions={[10, 20, 50, 100]}
          />
        </CardContent>
      </Card>
    </div>
  );
}



function formatDate(value: unknown) {
  if (!value) return "—";
  try {
    return new Date(String(value)).toLocaleString();
  } catch {
    return String(value);
  }
}

function getTextOrNull(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function getRecipientReason(row: Record<string, unknown>): string | null {
  const category = getTextOrNull(row.failureCategory);
  const code = getTextOrNull(row.errorCode);
  const codeDescription = getTwilioErrorCodeDescription(code);
  const message = getTextOrNull(row.errorMessage);
  const trace = getLatestTraceSummary(row);
  const details = [
    category ? `Category: ${category}` : null,
    code ? `Code: ${code}${codeDescription ? ` (${codeDescription})` : ""}` : null,
    message,
    trace ? `Trace: ${trace}` : null,
  ].filter((part): part is string => Boolean(part));
  return details.length > 0 ? details.join(" | ") : null;
}

function shouldShowReasonPopover(row: Record<string, unknown>): boolean {
  const status = String(row.status || "");
  return (status === "FAILED" || status === "SKIPPED") && Boolean(getRecipientReason(row));
}

function getLastActionLabel(row: Record<string, unknown>): string {
  const status = String(row.status || "");
  if (status === "FAILED") return String(row.failureCategory || "Failed");
  if (status === "SKIPPED") return "Skipped";
  return String(row.failureCategory || "Message Sent");
}

function getLatestTraceSummary(row: Record<string, unknown>): string | null {
  const metadata =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : null;
  if (!metadata) return null;
  const trace = Array.isArray(metadata.trace) ? metadata.trace : [];
  if (trace.length === 0) return null;
  const latest = trace[trace.length - 1];
  if (!latest || typeof latest !== "object" || Array.isArray(latest)) return null;
  const entry = latest as Record<string, unknown>;
  const source = getTextOrNull(entry.source);
  const scope = getTextOrNull(entry.scope);
  const category = getTextOrNull(entry.category);
  const reason = getTextOrNull(entry.reason);
  const detail = getTextOrNull(entry.detail);
  const code = getTextOrNull(entry.code);
  const fields = [
    source ? `source=${source}` : null,
    scope ? `scope=${scope}` : null,
    category ? `category=${category}` : null,
    reason ? `reason=${reason}` : null,
    code ? `code=${code}` : null,
    detail ? `detail=${detail}` : null,
  ].filter((part): part is string => Boolean(part));
  return fields.length > 0 ? fields.join(", ") : null;
}
