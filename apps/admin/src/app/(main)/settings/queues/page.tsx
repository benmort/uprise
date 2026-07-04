"use client";

// Platform-wide (global, unscoped) BullMQ + Redis infra stats — the super-admin
// counterpart to the per-tenant "Tenant Queue & Redis Stats" on /settings. Gated to
// super-admin both in the nav and by the API (GET /system/queue-stats requires the
// super-admin-only system.queue-stats permission).
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { getQueueStats, type QueueStatsResponse } from "@/lib/api";

export default function GlobalQueueStatsPage() {
  const { showToast } = useToast();
  const [queueStats, setQueueStats] = useState<QueueStatsResponse | null>(null);
  const [queueStatsLoading, setQueueStatsLoading] = useState(true);
  const [queueStatsError, setQueueStatsError] = useState("");
  const [queueStatsRefreshedAt, setQueueStatsRefreshedAt] = useState<Date | null>(null);

  const refreshQueueStats = useCallback(
    async (options?: { notifyOnError?: boolean }) => {
      setQueueStatsLoading(true);
      setQueueStatsError("");
      const response = await getQueueStats();
      if (!response.ok) {
        setQueueStatsError(response.error);
        setQueueStatsLoading(false);
        if (options?.notifyOnError) {
          showToast({
            tone: "error",
            title: "Queue stats unavailable",
            description: response.error,
            durationMs: 3000,
          });
        }
        return;
      }
      setQueueStats(response.data);
      setQueueStatsRefreshedAt(new Date());
      setQueueStatsLoading(false);
    },
    [showToast],
  );

  useEffect(() => {
    void refreshQueueStats();
    const timer = window.setInterval(() => void refreshQueueStats(), 15000);
    return () => window.clearInterval(timer);
  }, [refreshQueueStats]);

  return (
    <div className="page-stack">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Queue &amp; Redis Stats</h1>
          <p className="text-sm text-muted-foreground">
            Platform-wide BullMQ queues + Redis health (all tenants). Super-admin only.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Queue &amp; Redis Stats</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={queueStatsLoading}
              onClick={() => void refreshQueueStats({ notifyOnError: true })}
            >
              Refresh Stats
            </Button>
            {process.env.NEXT_PUBLIC_BULLMQ_URL ? (
              <a
                href={process.env.NEXT_PUBLIC_BULLMQ_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-variant"
              >
                Open queue dashboard →
              </a>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {queueStatsError && !queueStats ? (
            <EmptyState
              title="Queue stats are unavailable"
              description={queueStatsError}
              ctaLabel="Retry"
              onCta={() => void refreshQueueStats({ notifyOnError: true })}
            />
          ) : null}

          {queueStatsLoading && !queueStats ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={`queue-stats-skeleton-${index}`} className="rounded-md border border-border p-3">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="mt-2 h-6 w-16" />
                </div>
              ))}
            </div>
          ) : null}

          {queueStats ? (
            <>
              <div className="rounded-md border border-border p-3 text-sm">
                <p>
                  <span className="text-muted-foreground">Queue Prefix:</span>{" "}
                  <span className="font-medium">{queueStats.queuePrefix}</span>
                </p>
                <p className="mt-1 text-muted-foreground">
                  Last refresh: {queueStatsRefreshedAt?.toLocaleTimeString() ?? "n/a"}
                </p>
              </div>

              <div className="rounded-md border border-border p-3 text-sm">
                <p className="font-medium">Redis</p>
                <div className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                  <p>
                    <span className="text-muted-foreground">Configured:</span>{" "}
                    {queueStats.redis.configured ? "Yes" : "No"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Connected:</span>{" "}
                    {queueStats.redis.connected ? "Yes" : "No"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Ping:</span>{" "}
                    {queueStats.redis.pingMs === null ? "n/a" : `${queueStats.redis.pingMs} ms`}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Redis version:</span>{" "}
                    {queueStats.redis.version ?? "n/a"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Clients:</span>{" "}
                    {queueStats.redis.connectedClients?.toLocaleString() ?? "n/a"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Memory:</span>{" "}
                    {queueStats.redis.usedMemoryHuman ??
                      queueStats.redis.usedMemoryBytes?.toLocaleString() ??
                      "n/a"}
                  </p>
                </div>
                {queueStats.redis.error ? (
                  <p className="mt-2 text-xs text-warning-foreground">{queueStats.redis.error}</p>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {queueStats.queues.map((queue) => (
                  <div key={queue.name} className="rounded-md border border-border p-3">
                    <p className="text-sm font-medium">{queue.name}</p>
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <p className="text-muted-foreground">Waiting</p>
                      <p className="text-right">{queue.counts.waiting.toLocaleString()}</p>
                      <p className="text-muted-foreground">Active</p>
                      <p className="text-right">{queue.counts.active.toLocaleString()}</p>
                      <p className="text-muted-foreground">Completed</p>
                      <p className="text-right">{queue.counts.completed.toLocaleString()}</p>
                      <p className="text-muted-foreground">Failed</p>
                      <p className="text-right">{queue.counts.failed.toLocaleString()}</p>
                      <p className="text-muted-foreground">Delayed</p>
                      <p className="text-right">{queue.counts.delayed.toLocaleString()}</p>
                      <p className="text-muted-foreground">Paused</p>
                      <p className="text-right">{queue.counts.paused.toLocaleString()}</p>
                    </div>
                    {queue.error ? (
                      <p className="mt-2 text-xs text-warning-foreground">{queue.error}</p>
                    ) : null}
                  </div>
                ))}
              </div>

              {queueStatsError ? (
                <p className="text-xs text-warning-foreground">Latest refresh issue: {queueStatsError}</p>
              ) : null}
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
