"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { Button, DataTable, RefreshButton } from "@uprise/ui";
import { SectionCard } from "@uprise/field";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shell/page-header";
import { StateRegion } from "@/components/shell/state-region";
import { getPlatformStatus, type PlatformStatusResponse } from "@/lib/api";

/**
 * Internal system health — every deployed app, its health probe and its last deploy.
 *
 * Super-admin only, enforced by the API (`@SuperAdmin` on GET /platform-status): a tenant role
 * gets 403 and lands on StateRegion's no-permission state rather than an empty table. This is a
 * platform-operator surface, so it shows the things an operator needs and a customer must not
 * see — project names, origins and commit shas. The customer-facing version of this page is
 * `/status` on the marketing site, which is served a different payload entirely.
 */

const HEALTH_STYLES: Record<string, { dot: string; label: string; text: string }> = {
  up: { dot: "bg-success", label: "Operational", text: "text-success" },
  degraded: { dot: "bg-warning-foreground", label: "Degraded", text: "text-warning-foreground" },
  down: { dot: "bg-error", label: "Down", text: "text-error" },
  unknown: { dot: "bg-muted-foreground/40", label: "No probe", text: "text-muted-foreground" },
};

/** Deploys are timestamped, and "3 min ago" is what an operator actually reads. */
function ago(iso?: string): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "—";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function StatusPage() {
  const [data, setData] = useState<PlatformStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noPermission, setNoPermission] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getPlatformStatus();
    if (res.ok) {
      setData(res.data);
      setError(null);
      setNoPermission(false);
    } else {
      // 403 is the expected answer for anyone who is not a super-admin — it is not an error
      // state, it is the wrong door, and StateRegion says so in those words.
      setNoPermission(res.status === 403);
      setError(res.status === 403 ? null : res.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = data
    ? data.ok
      ? "All systems operational"
      : `${data.apps.filter((a) => a.health === "down").length} down`
    : undefined;

  return (
    <div className="page-stack">
      <PageHeader
        icon={Activity}
        title="System status"
        description="Health and last deploy for every app uprise runs, across Vercel and Railway."
        actions={
          <RefreshButton onClick={() => void load()} refreshing={loading} />
        }
      />

      <StateRegion
        loading={loading && !data}
        error={error}
        noPermission={noPermission}
        onRetry={() => void load()}
        errorTitle="Can't load platform status"
        skeleton={<Skeleton className="h-96 w-full" />}
      >
        {data ? (
          <div className="page-stack">
            {/* The provider APIs are best-effort: a missing token or an unreachable provider
                costs the deploy column, not the page, so say which and carry on. */}
            {data.warnings?.length ? (
              <div className="flex items-start gap-2 rounded-lg border border-warning-container bg-warning-container px-3 py-2 text-sm text-warning-foreground">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  {data.warnings.map((w) => (
                    <p key={w}>{w}</p>
                  ))}
                </div>
              </div>
            ) : null}

            <SectionCard
              title={summary ?? "Status"}
              description={`Checked ${ago(data.at)} · ${data.apps.length} apps`}
            >
              <DataTable
                aria-label="App status"
                rows={data.apps}
                rowKey={(app) => app.key}
                columns={[
                  {
                    key: "app",
                    header: "App",
                    cell: (app) => (
                      <div>
                        <div className="font-medium text-foreground">{app.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {app.url ? (
                            <a
                              href={app.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 hover:text-foreground"
                            >
                              {app.project}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            app.project
                          )}
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: "host",
                    header: "Host",
                    cell: (app) => <span className="capitalize text-muted-foreground">{app.host}</span>,
                  },
                  {
                    key: "health",
                    header: "Health",
                    cell: (app) => {
                      const style = HEALTH_STYLES[app.health] ?? HEALTH_STYLES.unknown;
                      return (
                        <div>
                          <span className={`inline-flex items-center gap-1.5 font-medium ${style.text}`}>
                            <span className={`h-2 w-2 rounded-full ${style.dot}`} aria-hidden />
                            {style.label}
                          </span>
                          {app.detail ? <div className="text-xs text-muted-foreground">{app.detail}</div> : null}
                        </div>
                      );
                    },
                  },
                  {
                    key: "latency",
                    header: "Latency",
                    cell: (app) => (
                      <span className="tabular-nums text-muted-foreground">
                        {app.latencyMs === undefined ? "—" : `${app.latencyMs}ms`}
                      </span>
                    ),
                  },
                  {
                    key: "deploy",
                    header: "Last deploy",
                    cell: (app) => (
                      <span className="text-muted-foreground">
                        {ago(app.deploy?.at)}
                        {app.deploy?.state ? <div className="text-xs">{app.deploy.state}</div> : null}
                      </span>
                    ),
                  },
                  {
                    key: "commit",
                    header: "Commit",
                    cell: (app) => (
                      <div>
                        {app.deploy?.sha ? (
                          <code className="rounded bg-surface-variant px-1.5 py-0.5 text-xs">
                            {app.deploy.sha.slice(0, 7)}
                          </code>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                        {app.deploy?.target ? (
                          <div className="text-xs text-muted-foreground">{app.deploy.target}</div>
                        ) : null}
                      </div>
                    ),
                  },
                ]}
              />
            </SectionCard>
          </div>
        ) : null}
      </StateRegion>
    </div>
  );
}
