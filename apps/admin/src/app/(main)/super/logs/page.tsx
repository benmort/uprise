"use client";

// Platform-wide log viewer — the super-admin counterpart to /super/queues.
//
// Exists because diagnosing a stuck import meant reading a Railway tail by eye and hand-writing a
// Redis script: the estate's logs are split across two providers and the one piece of evidence that
// mattered (a job's failedReason) was in neither. This puts durable errors, the live worker stream,
// Vercel build logs and the queue's own job detail behind one set of filters.
//
// Gated to super-admin both in the nav and by the API (`system.queue-stats`).
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { RefreshButton } from "@uprise/ui";
import {
  getObservabilityLogs,
  getObservabilityQueueJobs,
  type ObservabilityLogRecord,
  type ObservabilityQueueJob,
} from "@/lib/api";

const SOURCES = [
  { value: "stored", label: "Stored errors" },
  { value: "railway", label: "Worker (live)" },
  { value: "vercel", label: "Vercel builds" },
] as const;

const LEVELS = ["error", "warn", "info", "debug"] as const;
const SINCE_OPTIONS = ["15m", "1h", "6h", "24h", "7d"] as const;

/** `delayed` first: it is where a job that fails every attempt actually waits. */
const QUEUE_STATES = ["delayed", "failed", "active", "waiting", "paused"] as const;

const LEVEL_TONE: Record<string, string> = {
  error: "text-error",
  warn: "text-warning-foreground",
  info: "text-muted-foreground",
  debug: "text-muted-foreground",
};

export default function PlatformLogsPage() {
  const { showToast } = useToast();

  const [source, setSource] = useState<string>("stored");
  const [level, setLevel] = useState<string>("error");
  const [since, setSince] = useState<string>("24h");
  const [query, setQuery] = useState<string>("");
  const [queueState, setQueueState] = useState<string>("delayed");

  const [records, setRecords] = useState<ObservabilityLogRecord[]>([]);
  const [jobs, setJobs] = useState<ObservabilityQueueJob[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  const refresh = useCallback(
    async (options?: { notifyOnError?: boolean }) => {
      setLoading(true);
      setError("");
      const [logs, queueJobs] = await Promise.all([
        getObservabilityLogs({ source, level, since, q: query || undefined, limit: 200 }),
        getObservabilityQueueJobs({ state: queueState, limit: 50 }),
      ]);
      if (!logs.ok) {
        setError(logs.error);
        setLoading(false);
        if (options?.notifyOnError) {
          showToast({ tone: "error", title: "Logs unavailable", description: logs.error, durationMs: 3000 });
        }
        return;
      }
      setRecords(logs.data.records);
      setJobs(queueJobs.ok ? queueJobs.data.jobs : []);
      setWarnings([...logs.data.warnings, ...(queueJobs.ok ? queueJobs.data.warnings : [])]);
      setRefreshedAt(new Date());
      setLoading(false);
    },
    [source, level, since, query, queueState, showToast],
  );

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold">
            <ScrollText className="h-6 w-6" aria-hidden />
            Platform logs
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Durable errors from the API and worker, the live Railway stream, Vercel build output, and
            queue job detail — across the whole estate.
          </p>
        </div>
        <RefreshButton variant="secondary" refreshing={loading} onClick={() => void refresh({ notifyOnError: true })} />
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <Field label="Source">
            <Select value={source} onChange={setSource} options={SOURCES.map((s) => [s.value, s.label])} />
          </Field>
          <Field label="Level">
            <Select value={level} onChange={setLevel} options={LEVELS.map((l) => [l, l])} />
          </Field>
          <Field label="Since">
            <Select value={since} onChange={setSince} options={SINCE_OPTIONS.map((s) => [s, s])} />
          </Field>
          <Field label="Queue state">
            <Select value={queueState} onChange={setQueueState} options={QUEUE_STATES.map((s) => [s, s])} />
          </Field>
          <Field label="Search">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="message or context…"
              className="h-9 w-56 rounded-md border border-input bg-background px-3 text-sm"
            />
          </Field>
          {refreshedAt && (
            <span className="ml-auto text-xs text-muted-foreground">
              Updated {refreshedAt.toLocaleTimeString()}
            </span>
          )}
        </CardContent>
      </Card>

      {/* A source that could not be reached is reported, never silently treated as "nothing here". */}
      {warnings.length > 0 && (
        <Card>
          <CardContent className="space-y-1 p-4">
            {warnings.map((warning) => (
              <p key={warning} className="flex items-start gap-2 text-sm text-warning-foreground">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {warning}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Queue jobs · {queueState}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading && jobs.length === 0 ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-2/3" />
            </div>
          ) : jobs.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No jobs in this state.</p>
          ) : (
            <ul className="divide-y divide-border">
              {jobs.map((job) => (
                <li key={`${job.queue}:${job.id}`} className="space-y-1 p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{job.queue}</span>
                    <span className="text-muted-foreground">{job.id}</span>
                    <span className="text-xs text-muted-foreground">
                      attempt {job.attemptsMade}
                      {job.attemptsAllowed ? ` of ${job.attemptsAllowed}` : ""}
                    </span>
                  </div>
                  {/* The field that explains a queue nothing appears to be touching. */}
                  {job.nextRunAt && (
                    <p className="text-xs text-muted-foreground">
                      Next attempt {new Date(job.nextRunAt).toLocaleString()}
                    </p>
                  )}
                  {job.failedReason && <p className="text-error">{job.failedReason}</p>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Log lines</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <EmptyState
              title="Logs unavailable"
              description={error}
              ctaLabel="Try again"
              onCta={() => void refresh({ notifyOnError: true })}
            />
          ) : loading && records.length === 0 ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-5/6" />
              <Skeleton className="h-5 w-3/4" />
            </div>
          ) : records.length === 0 ? (
            <EmptyState
              title="Nothing matched"
              description="No log lines for this source, level and window. Widen the time range or drop the search."
            />
          ) : (
            <ul className="divide-y divide-border">
              {records.map((record, index) => {
                const key = `${record.at}:${index}`;
                const hasContext = record.context && Object.keys(record.context).length > 0;
                return (
                  <li key={key} className="p-4 text-sm">
                    <button
                      type="button"
                      className="w-full space-y-1 text-left"
                      onClick={() => setExpanded(expanded === key ? null : key)}
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{new Date(record.at).toLocaleString()}</span>
                        <span className={`font-semibold uppercase ${LEVEL_TONE[record.level] ?? ""}`}>
                          {record.level}
                        </span>
                        <span>{record.service}</span>
                        {record.domain && <span>[{record.domain}]</span>}
                      </div>
                      <p className="break-words">{record.message}</p>
                    </button>
                    {hasContext && expanded === key && (
                      <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3 text-xs">
                        {JSON.stringify(record.context, null, 2)}
                      </pre>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<readonly [string, string]>;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
    >
      {options.map(([optionValue, label]) => (
        <option key={optionValue} value={optionValue}>
          {label}
        </option>
      ))}
    </select>
  );
}
