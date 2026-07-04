"use client";

// Shared settings sections, reused as tabs on the General settings page (and formerly
// the standalone /settings cards). Kept in one place so the two surfaces can't drift.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { getTenantActivity, type TenantActivityResponse } from "@/lib/api";
import { getFlagAdmin, setTenantFlag, type FeatureFlagKey, type FlagAdminEntry } from "@/lib/api/flags";
import {
  type AlertSoundProfile,
  type ResponderAlertSettings,
  DEFAULT_RESPONDER_ALERT_SETTINGS,
  loadResponderAlertSettings,
  playResponderAlertSound,
  saveResponderAlertSettings,
} from "@/lib/responder-alerts";

/**
 * A section restricted to super admins. Non-super-admins see it greyed + locked
 * (mirrors the sidebar's plan-lock treatment), and the gated content isn't rendered.
 * These views are scoped to the current tenant; the platform-wide (global) versions
 * live in the Super Admin nav group.
 */
export function TenantLockedSection({
  title,
  subtitle,
  locked,
  children,
}: {
  title: string;
  subtitle: string;
  locked: boolean;
  children: ReactNode;
}) {
  return (
    <Card className={locked ? "opacity-60" : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {title}
          {locked ? <Lock className="h-4 w-4 shrink-0 text-muted-foreground/70" /> : null}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {locked ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Lock className="h-4 w-4 shrink-0" />
            Restricted to super admins.
          </p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

/** Per-tenant feature-flag override editor for the active workspace (super-admin). */
export function TenantFeatureFlagsEditor() {
  const { showToast } = useToast();
  const [rows, setRows] = useState<FlagAdminEntry[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string>("");

  const load = useCallback(async () => {
    const res = await getFlagAdmin();
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError("");
    setRows(res.data.filter((f) => f.controllableBy.includes("tenant")));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const apply = async (key: FeatureFlagKey, enabled: boolean | null) => {
    setBusy(key);
    const res = await setTenantFlag(key, enabled);
    setBusy("");
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't update flag", description: res.error });
      return;
    }
    setRows(res.data.filter((f) => f.controllableBy.includes("tenant")));
    showToast({ tone: "success", title: "Flag updated" });
  };

  if (error) {
    return <EmptyState title="Flags unavailable" description={error} ctaLabel="Retry" onCta={() => void load()} />;
  }
  if (!rows) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={`flag-skeleton-${i}`} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Overrides apply to this tenant only. “Inherit” falls back to plan → global → default.
      </p>
      <div className="divide-y divide-border rounded-lg border border-border">
        {rows.map((f) => (
          <div key={f.key} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium">{f.key}</p>
              <p className="text-xs text-muted-foreground">{f.description}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Effective: <span className="font-medium text-foreground">{f.effective ? "On" : "Off"}</span> · source: {f.source}
              </p>
            </div>
            <div className="inline-flex overflow-hidden rounded-lg border border-border">
              {([
                ["Inherit", null],
                ["On", true],
                ["Off", false],
              ] as const).map(([label, val]) => {
                const active = f.tenantOverride === val;
                return (
                  <button
                    key={label}
                    type="button"
                    disabled={busy === f.key}
                    onClick={() => void apply(f.key, val)}
                    className={cn(
                      "px-2.5 py-1 text-xs font-semibold transition disabled:opacity-50",
                      active ? "bg-primary text-white" : "text-foreground hover:bg-surface-variant",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {rows.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">No tenant-controllable flags.</p>
        ) : null}
      </div>
    </div>
  );
}

/** Per-tenant async-work health (imports/blasts/syncs/journeys by status). */
export function TenantQueueRedisPanel() {
  const [data, setData] = useState<TenantActivityResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getTenantActivity();
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError("");
    setData(res.data);
    setRefreshedAt(new Date());
  }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  if (error && !data) {
    return <EmptyState title="Activity unavailable" description={error} ctaLabel="Retry" onCta={() => void load()} />;
  }
  if (loading && !data) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={`activity-skeleton-${i}`} className="h-28 w-full" />
        ))}
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Live from this tenant’s own records (BullMQ counts can’t be scoped per tenant). Last refresh:{" "}
        {refreshedAt?.toLocaleTimeString() ?? "n/a"}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {data.domains.map((d) => (
          <div key={d.key} className="rounded-md border border-border p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{d.label}</p>
              <span className="text-xs tabular-nums text-muted-foreground">{d.total.toLocaleString()} total</span>
            </div>
            {Object.keys(d.byStatus).length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">No records.</p>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {Object.entries(d.byStatus).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between gap-2">
                    <span className="truncate capitalize text-muted-foreground">
                      {status.replaceAll("_", " ").toLowerCase()}
                    </span>
                    <span className="tabular-nums">{count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Responder alert preferences (client-only; persisted to localStorage). */
export function ResponderAlertsSettings() {
  const { showToast } = useToast();
  const [alertSettings, setAlertSettings] = useState<ResponderAlertSettings>(DEFAULT_RESPONDER_ALERT_SETTINGS);

  useEffect(() => {
    setAlertSettings(loadResponderAlertSettings());
  }, []);
  useEffect(() => {
    saveResponderAlertSettings(alertSettings);
  }, [alertSettings]);

  return (
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
              onChange={(e) => setAlertSettings((p) => ({ ...p, soundEnabled: e.target.checked }))}
            />
            Sound enabled
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={alertSettings.reducedAudio}
              onChange={(e) => setAlertSettings((p) => ({ ...p, reducedAudio: e.target.checked }))}
            />
            Reduced audio
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={alertSettings.outsideInboxSound}
              onChange={(e) => setAlertSettings((p) => ({ ...p, outsideInboxSound: e.target.checked }))}
            />
            Off-page chime
          </label>
          <label className="flex items-center gap-2">
            Profile
            <select
              className="h-8 rounded border border-input bg-background px-2"
              value={alertSettings.defaultProfile}
              onChange={(e) => setAlertSettings((p) => ({ ...p, defaultProfile: e.target.value as AlertSoundProfile }))}
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
              onChange={(e) => setAlertSettings((p) => ({ ...p, volume: Number(e.target.value) }))}
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
              onChange={(e) =>
                setAlertSettings((p) => ({ ...p, quietHoursStart: Math.min(23, Math.max(0, Number(e.target.value || 0))) }))
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
              onChange={(e) =>
                setAlertSettings((p) => ({ ...p, quietHoursEnd: Math.min(23, Math.max(0, Number(e.target.value || 0))) }))
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
              onChange={(e) =>
                setAlertSettings((p) => ({ ...p, slaWarningMinutes: Math.max(1, Number(e.target.value || 1)) }))
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
              onChange={(e) =>
                setAlertSettings((p) => ({ ...p, slaBreachMinutes: Math.max(2, Number(e.target.value || 2)) }))
              }
            />
            m
          </label>
          <label className="flex items-center gap-2 sm:col-span-2">
            Agent
            <Input
              className="h-8 max-w-sm"
              value={alertSettings.currentAgent}
              onChange={(e) => setAlertSettings((p) => ({ ...p, currentAgent: e.target.value }))}
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() =>
              playResponderAlertSound(alertSettings.defaultProfile, alertSettings, { ignoreQuietHours: true })
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
  );
}
