"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Inbox as InboxIcon,
  MapPin,
  MessageSquareText,
  PlusCircle,
  SendHorizontal,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react";
import {
  getDashboardPerformance,
  getFeatureFlags,
  getOptOuts,
  getQueueStats,
  getRecentBlasts,
  listAudiences,
  listConversations,
  listJourneys,
  getJourneyStats,
  type FeatureFlagsResponse,
  type Journey,
  type OptOutLedger,
  type QueueStatsResponse,
} from "@/lib/api";
import {
  listCampaigns,
  getCampaignSummary,
  getCampaignLive,
  type CampaignKpis,
  type CampaignLive,
} from "@/lib/api/campaigns";
import { createBlastAndOpen } from "@/lib/blasts";
import { normaliseChannel } from "@/components/channels/channel-campaigns-view";
import { KpiTile } from "@/components/canvass/kpi-tile";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { OverviewModuleCard } from "@/components/overview/overview-module-card";
import { ActivityFeed } from "@/components/overview/activity-feed";
import { buildActivityItems } from "@/lib/activity/recent-activity";
import { MiniBar } from "@/components/overview/mini-bar";

type Slice<T> = { data?: T; error?: string } | null; // null === loading

type PerfData = {
  totalSent: number;
  totalContacted?: number;
  totalResponded: number;
  responseRate: number;
  activeDrafts: number;
};
type Blasts = Array<Record<string, unknown>>;
type Convos = Array<Record<string, unknown>>;
type JourneysData = {
  list: Journey[];
  activeCount: number;
  agg: { enrolled: number; active: number; completed: number };
};
type CampaignData = { name: string; summary?: CampaignKpis; live?: CampaignLive } | null;

export default function DashboardPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [creating, setCreating] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const [perf, setPerf] = useState<Slice<PerfData>>(null);
  const [blasts, setBlasts] = useState<Slice<Blasts>>(null);
  const [convos, setConvos] = useState<Slice<Convos>>(null);
  const [audiences, setAudiences] = useState<Slice<{ rows: Blasts; total: number }>>(null);
  const [journeys, setJourneys] = useState<Slice<JourneysData>>(null);
  const [campaign, setCampaign] = useState<Slice<CampaignData>>(null);
  const [optOuts, setOptOuts] = useState<Slice<OptOutLedger>>(null);
  const [queue, setQueue] = useState<QueueStatsResponse | null>(null);
  const [flags, setFlags] = useState<FeatureFlagsResponse | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      getDashboardPerformance().then((r) => alive && setPerf(r.ok ? { data: r.data } : { error: r.error }));
      getRecentBlasts().then((r) => alive && setBlasts(r.ok ? { data: r.data } : { error: r.error }));
      listConversations().then((r) => alive && setConvos(r.ok ? { data: r.data } : { error: r.error }));
      listAudiences({ limit: 5, offset: 0 }).then(
        (r) => alive && setAudiences(r.ok ? { data: r.data } : { error: r.error }),
      );
      getOptOuts().then((r) => alive && setOptOuts(r.ok ? { data: r.data } : { error: r.error }));
      getQueueStats().then((r) => alive && r.ok && setQueue(r.data));
      getFeatureFlags().then((r) => alive && r.ok && setFlags(r.data));

      listJourneys().then(async (r) => {
        if (!alive) return;
        if (!r.ok) return setJourneys({ error: r.error });
        const active = r.data.filter((j) => j.status === "ACTIVE");
        const stats = await Promise.all(active.slice(0, 8).map((j) => getJourneyStats(j.id)));
        if (!alive) return;
        const agg = stats.reduce(
          (a, s) =>
            s.ok
              ? {
                  enrolled: a.enrolled + s.data.enrolled,
                  active: a.active + s.data.active,
                  completed: a.completed + s.data.completed,
                }
              : a,
          { enrolled: 0, active: 0, completed: 0 },
        );
        setJourneys({ data: { list: r.data, activeCount: active.length, agg } });
      });

      listCampaigns().then(async (r) => {
        if (!alive) return;
        if (!r.ok) return setCampaign({ error: r.error });
        const active = r.data.find((c) => c.status === "ACTIVE") ?? r.data[0];
        if (!active) return setCampaign({ data: null });
        const [sum, live] = await Promise.all([getCampaignSummary(active.id), getCampaignLive(active.id)]);
        if (!alive) return;
        setCampaign({
          data: {
            name: active.name,
            summary: sum.ok ? sum.data : undefined,
            live: live.ok ? live.data : undefined,
          },
        });
      });

      if (alive) setLastUpdatedAt(new Date());
    };
    load();
    const timer = setInterval(load, 8000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const whatsappEnabled = Boolean(flags?.FEATURE_WHATSAPP_ENABLED);

  const unreadInbox = useMemo(() => {
    const rows = convos?.data;
    if (!rows) return null;
    return rows.reduce((total, row) => {
      const unresolved = !Boolean((row as any).resolved);
      const unread = Number((row as any).unreadCount || 0);
      return unresolved ? total + unread : total;
    }, 0);
  }, [convos]);

  const channelSplit = useMemo(() => {
    const rows = blasts?.data ?? [];
    let sms = 0;
    let wa = 0;
    for (const b of rows) (normaliseChannel(b.channel) === "WHATSAPP" ? (wa += 1) : (sms += 1));
    return { sms, wa };
  }, [blasts]);

  const activity = useMemo(
    () => buildActivityItems(blasts?.data, convos?.data, campaign?.data),
    [blasts, convos, campaign],
  );

  const activityLoading = blasts === null && convos === null && campaign === null;

  const newBlast = async (channel: "SMS" | "WHATSAPP") => {
    if (creating) return;
    setCreating(true);
    try {
      await createBlastAndOpen(router, showToast, { channel });
    } finally {
      setCreating(false);
    }
  };

  const kpi = (s: Slice<unknown>, value: () => string) => (s?.data !== undefined ? value() : "—");

  return (
    <div className="page-stack">
      {/* Header + quick actions */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Command centre</h1>
          <p className="text-sm text-muted-foreground">
            Everything across Yarns — messaging, conversations, audiences, automation and the field.
            {lastUpdatedAt ? ` Updated ${lastUpdatedAt.toLocaleTimeString()}.` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="gap-1.5" disabled={creating} onClick={() => void newBlast("SMS")}>
            <PlusCircle className="h-4 w-4" />
            New text blast
          </Button>
          {whatsappEnabled ? (
            <Button variant="outline" className="gap-1.5" disabled={creating} onClick={() => void newBlast("WHATSAPP")}>
              <MessageSquareText className="h-4 w-4" />
              New WhatsApp blast
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <Link href="/inbox">Open inbox</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/audience">New audience</Link>
          </Button>
        </div>
      </div>

      {/* Top KPI row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Messages sent" value={kpi(perf, () => perf!.data!.totalSent.toLocaleString())} />
        <KpiTile label="Response rate" value={kpi(perf, () => `${Math.round(perf!.data!.responseRate)}%`)} />
        <KpiTile label="Replies" value={kpi(perf, () => perf!.data!.totalResponded.toLocaleString())} />
        <KpiTile label="Unread inbox" value={unreadInbox === null ? "—" : unreadInbox.toLocaleString()} />
      </div>

      {/* Domain module grid */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <OverviewModuleCard
          title="Messaging"
          description="SMS & WhatsApp campaigns"
          href="/channels/text"
          icon={<SendHorizontal className="h-4 w-4" />}
          loading={perf === null || blasts === null}
          error={perf?.error ?? blasts?.error}
        >
          <div className="space-y-3">
            <div className="flex gap-6 text-sm">
              <div>
                <p className="text-2xl font-extrabold tabular-nums">
                  {perf?.data ? perf.data.totalSent.toLocaleString() : "—"}
                </p>
                <p className="text-xs text-muted-foreground">sent</p>
              </div>
              <div>
                <p className="text-2xl font-extrabold tabular-nums">
                  {perf?.data ? `${Math.round(perf.data.responseRate)}%` : "—"}
                </p>
                <p className="text-xs text-muted-foreground">response rate</p>
              </div>
              <div>
                <p className="text-2xl font-extrabold tabular-nums">
                  {perf?.data ? perf.data.activeDrafts.toLocaleString() : "—"}
                </p>
                <p className="text-xs text-muted-foreground">drafts</p>
              </div>
            </div>
            <MiniBar
              segments={[
                { value: channelSplit.sms, tone: "primary", label: `${channelSplit.sms} text` },
                { value: channelSplit.wa, tone: "success", label: `${channelSplit.wa} WhatsApp` },
              ]}
            />
            <p className="text-xs text-muted-foreground">
              {channelSplit.sms} text · {channelSplit.wa} WhatsApp blast{channelSplit.wa === 1 ? "" : "s"}
            </p>
          </div>
        </OverviewModuleCard>

        <OverviewModuleCard
          title="Inbox"
          description="Two-way conversations"
          href="/inbox"
          icon={<InboxIcon className="h-4 w-4" />}
          loading={convos === null}
          error={convos?.error}
          isEmpty={Boolean(convos?.data && convos.data.length === 0)}
          empty="No conversations yet."
        >
          <div className="space-y-2 text-sm">
            <p>
              <span className="text-2xl font-extrabold tabular-nums">
                {unreadInbox === null ? "—" : unreadInbox.toLocaleString()}
              </span>{" "}
              <span className="text-muted-foreground">unread across open threads</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {(convos?.data?.length ?? 0).toLocaleString()} active conversation
              {(convos?.data?.length ?? 0) === 1 ? "" : "s"}
            </p>
          </div>
        </OverviewModuleCard>

        <OverviewModuleCard
          title="Audiences"
          description="Who you reach"
          href="/audience"
          icon={<Users className="h-4 w-4" />}
          loading={audiences === null}
          error={audiences?.error}
          isEmpty={Boolean(audiences?.data && audiences.data.total === 0)}
          empty="No audiences yet."
        >
          <div className="space-y-2 text-sm">
            <p>
              <span className="text-2xl font-extrabold tabular-nums">
                {(audiences?.data?.total ?? 0).toLocaleString()}
              </span>{" "}
              <span className="text-muted-foreground">audiences</span>
            </p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {(audiences?.data?.rows ?? []).slice(0, 4).map((a) => (
                <li key={String((a as any).id)} className="truncate">
                  {String((a as any).name || "Untitled")}
                </li>
              ))}
            </ul>
          </div>
        </OverviewModuleCard>

        <OverviewModuleCard
          title="Journeys"
          description="Automated follow-ups"
          href="/journeys"
          icon={<Workflow className="h-4 w-4" />}
          loading={journeys === null}
          error={journeys?.error}
          isEmpty={Boolean(journeys?.data && journeys.data.list.length === 0)}
          empty="No journeys yet."
        >
          <div className="space-y-2 text-sm">
            <p>
              <span className="text-2xl font-extrabold tabular-nums">
                {(journeys?.data?.activeCount ?? 0).toLocaleString()}
              </span>{" "}
              <span className="text-muted-foreground">active</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {(journeys?.data?.agg.active ?? 0).toLocaleString()} enrolled now ·{" "}
              {(journeys?.data?.agg.completed ?? 0).toLocaleString()} completed
            </p>
          </div>
        </OverviewModuleCard>

        <OverviewModuleCard
          title="Canvassing"
          description="Field & door-knocking"
          href="/canvass"
          icon={<MapPin className="h-4 w-4" />}
          loading={campaign === null}
          error={campaign?.error}
          isEmpty={campaign?.data === null}
          empty="No campaigns yet."
        >
          {campaign?.data ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">{campaign.data.name}</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-xl font-extrabold tabular-nums">
                    {(campaign.data.summary?.doorsToday ?? 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">doors today</p>
                </div>
                <div>
                  <p className="text-xl font-extrabold tabular-nums">
                    {Math.round(campaign.data.summary?.turfCompletePct ?? 0)}%
                  </p>
                  <p className="text-xs text-muted-foreground">turf complete</p>
                </div>
                <div>
                  <p className="text-xl font-extrabold tabular-nums">
                    {Math.round(campaign.data.summary?.contactRate ?? 0)}%
                  </p>
                  <p className="text-xs text-muted-foreground">contact rate</p>
                </div>
                <div>
                  <p className="text-xl font-extrabold tabular-nums">
                    {(campaign.data.summary?.canvassersOut ?? 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">canvassers out</p>
                </div>
              </div>
            </div>
          ) : null}
        </OverviewModuleCard>

        <OverviewModuleCard
          title="Compliance"
          description="Opt-outs & consent"
          href="/compliance"
          icon={<ShieldCheck className="h-4 w-4" />}
          loading={optOuts === null}
          error={optOuts?.error}
        >
          <div className="space-y-2 text-sm">
            <p>
              <span className="text-2xl font-extrabold tabular-nums">
                {(optOuts?.data?.total ?? 0).toLocaleString()}
              </span>{" "}
              <span className="text-muted-foreground">opted out</span>
            </p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {(optOuts?.data?.byChannel ?? []).map((c) => (
                <li key={c.channel}>
                  {c.channel}: {c.count.toLocaleString()}
                </li>
              ))}
            </ul>
          </div>
        </OverviewModuleCard>
      </div>

      {/* Engagement quick links + Activity feed */}
      <div className="grid gap-4 lg:grid-cols-3">
        <OverviewModuleCard
          title="Engagement"
          description="Scripts, surveys & dispositions"
          href="/engagement/surveys"
          icon={<Sparkles className="h-4 w-4" />}
        >
          <div className="flex flex-wrap gap-2 text-sm">
            <Button asChild variant="outline" size="sm">
              <Link href="/engagement/surveys">Surveys</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/engagement/scripts">Scripts</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/engagement/dispositions">Dispositions</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/engagement/canned-responses">Canned replies</Link>
            </Button>
          </div>
        </OverviewModuleCard>

        <div className="lg:col-span-2">
          <OverviewModuleCard
            title="Recent activity"
            description="Across messaging, inbox and the field"
            href="/analytics"
            linkLabel="Analytics"
            loading={activityLoading}
          >
            <ActivityFeed items={activity} />
          </OverviewModuleCard>
        </div>
      </div>

      {/* System-health footer */}
      <SystemHealth queue={queue} flags={flags} />
    </div>
  );
}

function SystemHealth({
  queue,
  flags,
}: {
  queue: QueueStatsResponse | null;
  flags: FeatureFlagsResponse | null;
}) {
  const dot = (ok: boolean) =>
    `inline-block h-2 w-2 rounded-full ${ok ? "bg-[hsl(var(--success))]" : "bg-[hsl(var(--error))]"}`;
  const waiting = queue?.queues.reduce((t, q) => t + q.counts.waiting, 0) ?? 0;
  const failed = queue?.queues.reduce((t, q) => t + q.counts.failed, 0) ?? 0;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
      {queue ? (
        <>
          <span className="flex items-center gap-1.5">
            <span className={dot(queue.redis.connected)} /> Redis {queue.redis.connected ? "connected" : "down"}
          </span>
          <span>Queue: {waiting.toLocaleString()} waiting</span>
          <span className={failed > 0 ? "text-[hsl(var(--error))]" : undefined}>
            {failed.toLocaleString()} failed
          </span>
        </>
      ) : (
        <span>Checking system health…</span>
      )}
      {flags ? (
        <>
          <span className="flex items-center gap-1.5">
            <span className={dot(flags.FEATURE_REALTIME_ENABLED)} /> Realtime{" "}
            {flags.FEATURE_REALTIME_ENABLED ? "on" : "off"}
          </span>
          {flags.BLAST_DRY_RUN ? (
            <span className="rounded bg-[hsl(var(--warning-foreground))]/10 px-1.5 py-0.5 font-medium text-[hsl(var(--warning-foreground))]">
              Dry-run mode
            </span>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
