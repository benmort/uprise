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

export default function BlastDetailsPage() {
  const params = useParams<{ id: string }>();
  const blastId = typeof params?.id === "string" ? params.id : "";
  const [blastTitle, setBlastTitle] = useState("Blast");
  const [blastStatus, setBlastStatus] = useState("DRAFTED");
  const [kpis, setKpis] = useState<Record<string, number>>({});
  const [trend, setTrend] = useState<Array<Record<string, unknown>>>([]);
  const [activity, setActivity] = useState<Array<Record<string, unknown>>>([]);
  const [statusDistribution, setStatusDistribution] = useState<Array<Record<string, unknown>>>([]);
  const [streamStatus, setStreamStatus] = useState("idle");

  const loadForBlast = async (id: string) => {
    const [kpiRes, trendRes, activityRes, statusRes] = await Promise.all([
      getBlastKpis(id),
      getBlastTrend(id),
      getBlastActivity(id, 30, 0),
      getBlastStatusDistribution(id),
    ]);
    if (kpiRes.ok) setKpis(kpiRes.data as Record<string, number>);
    if (trendRes.ok) setTrend(trendRes.data);
    if (activityRes.ok) setActivity(activityRes.data.rows);
    if (statusRes.ok) setStatusDistribution(statusRes.data);
  };

  useEffect(() => {
    if (!blastId) return;
    listBlasts().then((res) => {
      if (!res.ok) return;
      const blast = res.data.find((row) => String((row as any).id) === blastId);
      if (!blast) return;
      setBlastTitle(String((blast as any).title || "Untitled Blast"));
      setBlastStatus(String((blast as any).status || "DRAFTED"));
    });
  }, [blastId]);

  useEffect(() => {
    if (!blastId) return;
    loadForBlast(blastId);
    const id = setInterval(() => loadForBlast(blastId), 8000);
    return () => clearInterval(id);
  }, [blastId]);

  useEffect(() => {
    if (!blastId) return;
    let source: EventSource | null = null;
    let cancelled = false;

    const connect = async () => {
      const tokenRes = await getRealtimeStreamToken();
      if (!tokenRes.ok) {
        setStreamStatus("auth_failed");
        return;
      }
      const streamUrl = new URL(`${getApiUrl()}/analytics/stream`);
      streamUrl.searchParams.set("token", tokenRes.data.token);
      source = new EventSource(streamUrl.toString(), { withCredentials: false });
      source.onopen = () => {
        if (!cancelled) setStreamStatus("live");
      };
      source.onerror = () => {
        if (!cancelled) setStreamStatus("reconnecting");
      };
      source.onmessage = () => {
        loadForBlast(blastId);
      };
    };

    connect();
    return () => {
      cancelled = true;
      source?.close();
    };
  }, [blastId]);

  const maxTrend = useMemo(() => {
    return Math.max(1, ...trend.map((row) => Number(row.sent || 0)));
  }, [trend]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-4xl font-semibold">{blastTitle}</h1>
          <p className="text-sm text-muted-foreground">Blast analytics</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={blastStatus} />
          <StatusBadge status={streamStatus === "live" ? "ACTIVE" : "SENDING"} className="capitalize" />
          <Button asChild variant="outline">
            <Link href={`/inbox?blastId=${encodeURIComponent(blastId)}`}>Blast Inbox</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/blasts/${encodeURIComponent(blastId)}/composer`}>Open Composer</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard label="Total Sent" value={String(kpis.sent || 0)} />
        <KpiCard label="Delivered" value={String(kpis.delivered || 0)} />
        <KpiCard
          label="Engagement"
          value={String(kpis.responded || 0)}
          subtitle={`${kpis.sent ? (((kpis.responded || 0) / (kpis.sent || 1)) * 100).toFixed(1) : "0"}% conversion`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Engagement Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-56 items-end gap-2">
            {trend.map((point) => {
              const sent = Number(point.sent || 0);
              const responses = Number(point.responses || 0);
              return (
                <div key={String(point.bucket)} className="flex flex-1 flex-col items-center gap-1">
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
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recipient Activity Log</CardTitle>
          <Button variant="outline" onClick={() => blastId && loadForBlast(blastId)}>
            Refresh Live
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-label uppercase tracking-[0.08em] text-muted-foreground">
                <th className="py-2 pr-3">Recipient</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Last Action</th>
                <th className="py-2 pr-3">Timestamp</th>
                <th className="py-2 pr-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {activity.map((row) => (
                <tr key={String(row.id)} className="border-b border-border/60">
                  <td className="py-3 pr-3">{String(row.phoneE164)}</td>
                  <td className="py-3 pr-3">
                    <StatusBadge status={String(row.status)} />
                  </td>
                  <td className="py-3 pr-3 text-muted-foreground">{String(row.failureCategory || "Message Sent")}</td>
                  <td className="py-3 pr-3 text-muted-foreground">{formatDate(row.sentAt || row.updatedAt)}</td>
                  <td className="py-3 pr-3">
                    {String(row.status) === "FAILED" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          await retryBlast(blastId);
                          await loadForBlast(blastId);
                        }}
                      >
                        Retry
                      </Button>
                    ) : (
                      <Button asChild variant="ghost" size="sm">
                        <Link
                          href={`/inbox?contact=${encodeURIComponent(String(row.phoneE164 || ""))}&blastId=${encodeURIComponent(blastId)}`}
                        >
                          View Chat
                        </Link>
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {activity.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted-foreground">
                    No recipient activity yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ label, value, subtitle }: { label: string; value: string; subtitle?: string }) {
  return (
    <Card>
      <CardHeader>
        <p className="text-xs font-label uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      </CardHeader>
      <CardContent>
        <p className="text-4xl font-headline font-semibold">{value}</p>
        {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
      </CardContent>
    </Card>
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
