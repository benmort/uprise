"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  getFeatureFlags,
  getQueueStats,
  type FeatureFlagsResponse,
  type QueueStatsResponse,
} from "@/lib/api";
import {
  type AlertSoundProfile,
  type ResponderAlertSettings,
  DEFAULT_RESPONDER_ALERT_SETTINGS,
  loadResponderAlertSettings,
  playResponderAlertSound,
  saveResponderAlertSettings,
} from "@/lib/responder-alerts";

export default function SettingsPage() {
  const { showToast } = useToast();
  const [alertSettings, setAlertSettings] = useState<ResponderAlertSettings>(
    DEFAULT_RESPONDER_ALERT_SETTINGS,
  );
  const [queueStats, setQueueStats] = useState<QueueStatsResponse | null>(null);
  const [queueStatsLoading, setQueueStatsLoading] = useState(true);
  const [queueStatsError, setQueueStatsError] = useState("");
  const [queueStatsRefreshedAt, setQueueStatsRefreshedAt] = useState<Date | null>(null);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlagsResponse | null>(null);
  const [featureFlagsLoading, setFeatureFlagsLoading] = useState(true);
  const [featureFlagsError, setFeatureFlagsError] = useState("");
  const [featureFlagsRefreshedAt, setFeatureFlagsRefreshedAt] = useState<Date | null>(null);
  const isBlastDryRunEnabled = featureFlags?.BLAST_DRY_RUN === true;

  useEffect(() => {
    setAlertSettings(loadResponderAlertSettings());
  }, []);

  useEffect(() => {
    saveResponderAlertSettings(alertSettings);
  }, [alertSettings]);

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

  const refreshFeatureFlags = useCallback(
    async (options?: { notifyOnError?: boolean }) => {
      setFeatureFlagsLoading(true);
      setFeatureFlagsError("");
      const response = await getFeatureFlags();
      if (!response.ok) {
        setFeatureFlagsError(response.error);
        setFeatureFlagsLoading(false);
        if (options?.notifyOnError) {
          showToast({
            tone: "error",
            title: "Feature toggles unavailable",
            description: response.error,
            durationMs: 3000,
          });
        }
        return;
      }
      setFeatureFlags(response.data);
      setFeatureFlagsRefreshedAt(new Date());
      setFeatureFlagsLoading(false);
    },
    [showToast],
  );

  useEffect(() => {
    void refreshQueueStats();
    void refreshFeatureFlags();
    const timer = window.setInterval(() => {
      void refreshQueueStats();
      void refreshFeatureFlags();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [refreshFeatureFlags, refreshQueueStats]);

  return (
    <div className="page-stack">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage responder alerts and quiet times.</p>
        </div>
      </div>

      <Card id="tour-settings">
        <CardHeader>
          <CardTitle>Responder Alert Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div id="tour-settings-alerts" className="grid gap-3 text-sm sm:grid-cols-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={alertSettings.soundEnabled}
                onChange={(event) =>
                  setAlertSettings((prev) => ({
                    ...prev,
                    soundEnabled: event.target.checked,
                  }))
                }
              />
              Sound enabled
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={alertSettings.reducedAudio}
                onChange={(event) =>
                  setAlertSettings((prev) => ({
                    ...prev,
                    reducedAudio: event.target.checked,
                  }))
                }
              />
              Reduced audio
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={alertSettings.outsideInboxSound}
                onChange={(event) =>
                  setAlertSettings((prev) => ({
                    ...prev,
                    outsideInboxSound: event.target.checked,
                  }))
                }
              />
              Off-page chime
            </label>
            <label className="flex items-center gap-2">
              Profile
              <select
                className="h-8 rounded border border-input bg-background px-2"
                value={alertSettings.defaultProfile}
                onChange={(event) =>
                  setAlertSettings((prev) => ({
                    ...prev,
                    defaultProfile: event.target.value as AlertSoundProfile,
                  }))
                }
              >
                <option value="off">Off</option>
                <option value="subtle">Subtle</option>
                <option value="alert">Alert</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              Volume
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={alertSettings.volume}
                onChange={(event) =>
                  setAlertSettings((prev) => ({
                    ...prev,
                    volume: Number(event.target.value),
                  }))
                }
              />
            </label>
            <label className="flex items-center gap-2">
              Quiet start
              <input
                type="number"
                min={0}
                max={23}
                className="h-8 w-16 rounded border border-input bg-background px-2"
                value={alertSettings.quietHoursStart}
                onChange={(event) =>
                  setAlertSettings((prev) => ({
                    ...prev,
                    quietHoursStart: Math.min(23, Math.max(0, Number(event.target.value || 0))),
                  }))
                }
              />
            </label>
            <label className="flex items-center gap-2">
              Quiet end
              <input
                type="number"
                min={0}
                max={23}
                className="h-8 w-16 rounded border border-input bg-background px-2"
                value={alertSettings.quietHoursEnd}
                onChange={(event) =>
                  setAlertSettings((prev) => ({
                    ...prev,
                    quietHoursEnd: Math.min(23, Math.max(0, Number(event.target.value || 0))),
                  }))
                }
              />
            </label>
            <label className="flex items-center gap-2">
              SLA warn
              <input
                type="number"
                min={1}
                className="h-8 w-16 rounded border border-input bg-background px-2"
                value={alertSettings.slaWarningMinutes}
                onChange={(event) =>
                  setAlertSettings((prev) => ({
                    ...prev,
                    slaWarningMinutes: Math.max(1, Number(event.target.value || 1)),
                  }))
                }
              />
              m
            </label>
            <label className="flex items-center gap-2">
              SLA breach
              <input
                type="number"
                min={2}
                className="h-8 w-16 rounded border border-input bg-background px-2"
                value={alertSettings.slaBreachMinutes}
                onChange={(event) =>
                  setAlertSettings((prev) => ({
                    ...prev,
                    slaBreachMinutes: Math.max(2, Number(event.target.value || 2)),
                  }))
                }
              />
              m
            </label>
            <label className="flex items-center gap-2 sm:col-span-2">
              Agent
              <Input
                className="h-8 max-w-sm"
                value={alertSettings.currentAgent}
                onChange={(event) =>
                  setAlertSettings((prev) => ({
                    ...prev,
                    currentAgent: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                playResponderAlertSound(alertSettings.defaultProfile, alertSettings, {
                  ignoreQuietHours: true,
                })
              }
            >
              Play Test Chime
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setAlertSettings(DEFAULT_RESPONDER_ALERT_SETTINGS);
                showToast({
                  tone: "info",
                  title: "Responder alerts reset",
                  description: "Default alert values restored.",
                  durationMs: 2000,
                });
              }}
            >
              Reset to Defaults
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Flags</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={featureFlagsLoading}
              onClick={() => void refreshFeatureFlags({ notifyOnError: true })}
            >
              Refresh
            </Button>
            <Link
              href="/settings/flags"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-variant"
            >
              Manage flags →
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {featureFlagsError && !featureFlags ? (
            <EmptyState
              title="Flags are unavailable"
              description={featureFlagsError}
              ctaLabel="Retry"
              onCta={() => void refreshFeatureFlags({ notifyOnError: true })}
            />
          ) : null}

          {featureFlagsLoading && !featureFlags ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={`feature-flags-skeleton-${index}`}
                  className="rounded-md border border-border p-3"
                >
                  <Skeleton className="h-3 w-36" />
                  <Skeleton className="mt-2 h-6 w-20" />
                </div>
              ))}
            </div>
          ) : null}

          {featureFlags ? (
            <>
              <p className="text-xs text-muted-foreground">
                Last refresh: {featureFlagsRefreshedAt?.toLocaleTimeString() ?? "n/a"}
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(featureFlags).map(([name, enabled]) => (
                  <div
                    key={name}
                    className={`rounded-md border p-3 ${
                      name === "BLAST_DRY_RUN" && enabled
                        ? "border-warning-container bg-warning-container/20"
                        : "border-border"
                    }`}
                  >
                    <p className="text-xs text-muted-foreground">{name}</p>
                    <p
                      className={`mt-1 text-sm font-medium ${
                        name === "BLAST_DRY_RUN" && enabled ? "text-warning-foreground" : ""
                      }`}
                    >
                      {enabled ? "Enabled" : "Disabled"}
                    </p>
                  </div>
                ))}
              </div>
              {featureFlagsError ? (
                <p className="text-xs text-warning-foreground">
                  Latest refresh issue: {featureFlagsError}
                </p>
              ) : null}
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Queue & Redis Stats</CardTitle>
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
                <p className="text-xs text-warning-foreground">
                  Latest refresh issue: {queueStatsError}
                </p>
              ) : null}
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
