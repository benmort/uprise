'use client';

import { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/prog/ui/card';
import { Skeleton } from '@/components/prog/ui/skeleton';
import Alert from '@/components/prog/ui/alert';
import {
  Send,
  CheckCircle2,
  Clock,
  XCircle,
  FileEdit,
  CalendarClock,
  Activity as ActivityIcon,
  type LucideIcon,
} from 'lucide-react';
import { getRecentBlasts, getDashboardPerformance } from '@/lib/api';
import { getSession } from '@/lib/session';

/**
 * Activity – read-only recent-activity timeline.
 *
 * yarns has no generic audit log, so the closest real "recent activity" surface
 * is the analytics recent-blasts feed. Each recent blast becomes a timeline entry
 * (title, status, timestamp); the dashboard performance numbers ride along as a
 * header summary. Visual port of prog's activity-log timeline; gray/dark classes
 * preserved. All four feedback states are handled (loading, empty, error,
 * authenticated-only).
 */

type Performance = {
  totalSent: number;
  totalContacted?: number;
  totalResponded: number;
  responseRate: number;
  activeDrafts: number;
};

type TimelineEntry = {
  id: string;
  title: string;
  status: string;
  timestamp: string | null;
};

const statusIconMap: Record<string, LucideIcon> = {
  DRAFTED: FileEdit,
  PROOFED: CheckCircle2,
  SCHEDULED: CalendarClock,
  SENDING: Clock,
  SENT: Send,
  FAILED: XCircle,
};

const statusLabelMap: Record<string, string> = {
  DRAFTED: 'Drafted',
  PROOFED: 'Proofed',
  SCHEDULED: 'Scheduled',
  SENDING: 'Sending',
  SENT: 'Sent',
  FAILED: 'Failed',
};

function getRelativeTime(date: Date): string {
  if (Number.isNaN(date.getTime())) return 'no date';
  const diffInSeconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600)
    return `${Math.floor(diffInSeconds / 60)} minutes ago`;
  if (diffInSeconds < 86400)
    return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  if (diffInSeconds < 604800)
    return `${Math.floor(diffInSeconds / 86400)} days ago`;
  return date.toLocaleDateString('en-AU');
}

/** Map a raw recent-blast row to a timeline entry, reading fields defensively. */
function toTimelineEntry(row: Record<string, unknown>, index: number): TimelineEntry {
  const id = typeof row.id === 'string' ? row.id : `blast-${index}`;
  const title =
    typeof row.title === 'string' && row.title.trim().length > 0
      ? row.title
      : 'Untitled blast';
  const status = typeof row.status === 'string' ? row.status : 'DRAFTED';
  const timestamp =
    (typeof row.completedAt === 'string' && row.completedAt) ||
    (typeof row.startedAt === 'string' && row.startedAt) ||
    (typeof row.createdAt === 'string' && row.createdAt) ||
    null;

  return { id, title, status, timestamp };
}

function ActivitySkeleton() {
  return (
    <ul className="space-y-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="flex items-center space-x-4">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-24" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white/90">
        {value}
      </p>
    </div>
  );
}

export default function ActivityPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [performance, setPerformance] = useState<Performance | null>(null);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      const session = await getSession();
      if (!alive) return;
      if (!session) {
        setAuthed(false);
        setLoading(false);
        return;
      }
      setAuthed(true);

      const [blastsRes, perfRes] = await Promise.all([
        getRecentBlasts(),
        getDashboardPerformance(),
      ]);
      if (!alive) return;

      if (!blastsRes.ok) {
        setError(blastsRes.error);
        setLoading(false);
        return;
      }

      setEntries(blastsRes.data.map(toTimelineEntry));
      // The summary is a nicety – a failed performance fetch shouldn't sink the page.
      setPerformance(perfRes.ok ? perfRes.data : null);
      setError(null);
      setLoading(false);
    };

    void load();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Activity
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            View recent activity across your Yarns blasts
          </p>
        </div>

        {authed && performance && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryStat
              label="Total sent"
              value={performance.totalSent.toLocaleString('en-AU')}
            />
            <SummaryStat
              label="Responded"
              value={performance.totalResponded.toLocaleString('en-AU')}
            />
            <SummaryStat
              label="Response rate"
              value={`${Math.round(performance.responseRate * 100)}%`}
            />
            <SummaryStat
              label="Active drafts"
              value={performance.activeDrafts.toLocaleString('en-AU')}
            />
          </div>
        )}

        <Card className="border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <CardHeader>
            <CardTitle className="text-gray-800 dark:text-white/90">
              Recent activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <ActivitySkeleton />
            ) : authed === false ? (
              <Alert
                variant="warning"
                title="Sign in to view activity"
                message="You need to be signed in to view recent activity."
              />
            ) : error ? (
              <Alert
                variant="error"
                title="Couldn't load recent activity"
                message={error}
              />
            ) : entries.length > 0 ? (
              <ul className="space-y-4">
                {entries.map((entry) => {
                  const Icon = statusIconMap[entry.status] ?? ActivityIcon;
                  const statusLabel =
                    statusLabelMap[entry.status] ?? entry.status;
                  const when = entry.timestamp
                    ? getRelativeTime(new Date(entry.timestamp))
                    : 'no date';

                  return (
                    <li key={entry.id} className="flex items-center space-x-4">
                      <div className="rounded-full bg-gray-100 p-2 dark:bg-gray-800">
                        <Icon className="h-5 w-5 text-black dark:text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {entry.title}
                          <span className="text-gray-500 dark:text-gray-400">
                            {' '}
                            – {statusLabel}
                          </span>
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {when}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <ActivityIcon className="mb-4 h-12 w-12 text-black dark:text-white" />
                <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
                  No recent activity
                </h3>
                <p className="max-w-sm text-sm text-gray-500 dark:text-gray-400">
                  When you send blasts, they&apos;ll appear here as a timeline of
                  recent activity.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
