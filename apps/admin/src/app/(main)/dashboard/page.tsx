"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CalendarDays,
  LayoutDashboard,
  Inbox as InboxIcon,
  MapPin,
  MessageSquareText,
  PlusCircle,
  SendHorizontal,
  ShieldCheck,
  Split,
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
  listSegmentDefinitions,
  listEvents,
  listCalendar,
  type FeatureFlagsResponse,
  type Journey,
  type OptOutLedger,
  type QueueStatsResponse,
} from "@/lib/api";
import { listSurveys, listScripts } from "@/lib/api/engagement";
import {
  listCampaigns,
  getCampaignSummary,
  type CampaignKpis,
} from "@/lib/api/campaigns";
import { createBlastAndOpen } from "@/lib/blasts";
import { normaliseChannel } from "@/components/channels/channel-campaigns-view";
import { QuickActions } from "@uprise/ui";
import { useToast } from "@/components/ui/toast";
import { OverviewModuleCard } from "@/components/overview/overview-module-card";
import { OnboardingNudge } from "@/components/overview/onboarding-nudge";
import { MiniBar } from "@/components/overview/mini-bar";
import { NewConversationMenu } from "@/components/inbox/new-conversation-menu";
import { getSession } from "@/lib/session";
import { useFlags } from "@/components/flags/flags-provider";
import { planVisible, planLocked } from "@/lib/flags/plan-gating";
import { type FeatureFlagKey } from "@uprise/flags";

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
type CampaignData = { campaigns: number; summary?: CampaignKpis } | null;

export default function DashboardPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [creating, setCreating] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const [perf, setPerf] = useState<Slice<PerfData>>(null);
  const [blasts, setBlasts] = useState<Slice<Blasts>>(null);
  const [convos, setConvos] = useState<Slice<Convos>>(null);
  const [audiences, setAudiences] = useState<Slice<{ rows: Blasts; total: number }>>(null);
  const [journeys, setJourneys] = useState<Slice<JourneysData>>(null);
  const [campaign, setCampaign] = useState<Slice<CampaignData>>(null);
  const [optOuts, setOptOuts] = useState<Slice<OptOutLedger>>(null);
  const [searches, setSearches] = useState<Slice<{ count: number; members: number }>>(null);
  const [events, setEvents] = useState<Slice<{ count: number }>>(null);
  const [calendar, setCalendar] = useState<Slice<{ upcoming: number }>>(null);
  const [content, setContent] = useState<Slice<{ surveys: number; scripts: number }>>(null);
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

      listSegmentDefinitions().then(
        (r) =>
          alive &&
          setSearches(
            r.ok
              ? { data: { count: r.data.length, members: r.data.reduce((t, s) => t + (s.memberCount ?? 0), 0) } }
              : { error: r.error },
          ),
      );
      listEvents({ status: "upcoming" }).then(
        (r) => alive && setEvents(r.ok ? { data: { count: r.data.length } } : { error: r.error }),
      );
      listCalendar().then((r) => {
        if (!alive) return;
        if (!r.ok) return setCalendar({ error: r.error });
        const now = Date.now();
        setCalendar({ data: { upcoming: r.data.filter((i) => new Date(i.startsAt).getTime() >= now).length } });
      });
      Promise.all([listSurveys(), listScripts()]).then(([s, sc]) => {
        if (!alive) return;
        if (!s.ok) return setContent({ error: s.error });
        if (!sc.ok) return setContent({ error: sc.error });
        setContent({ data: { surveys: s.data.length, scripts: sc.data.length } });
      });

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
        if (r.data.length === 0) return setCampaign({ data: null });
        // Collective figures across EVERY campaign (parity with the other cards):
        // counts sum; turf-complete recomputes from summed stops; contact rate is
        // weighted by knocked doors so an idle campaign can't dilute a busy one.
        const sums = await Promise.all(r.data.map((c) => getCampaignSummary(c.id)));
        if (!alive) return;
        const agg: CampaignKpis = { doorsToday: 0, turfCompletePct: 0, contactRate: 0, volunteersOut: 0, knockedStops: 0, totalStops: 0 };
        let rateWeight = 0;
        for (const sum of sums) {
          if (!sum.ok) continue;
          agg.doorsToday += sum.data.doorsToday;
          agg.volunteersOut += sum.data.volunteersOut;
          agg.knockedStops += sum.data.knockedStops;
          agg.totalStops += sum.data.totalStops;
          agg.contactRate += sum.data.contactRate * sum.data.knockedStops;
          rateWeight += sum.data.knockedStops;
        }
        agg.turfCompletePct = agg.totalStops > 0 ? (agg.knockedStops / agg.totalStops) * 100 : 0;
        agg.contactRate = rateWeight > 0 ? agg.contactRate / rateWeight : 0;
        setCampaign({ data: { campaigns: r.data.length, summary: agg } });
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

  // Plan-capability gating (mirrors the sidebar): resolved tenant flags + whether the
  // viewer is a super-admin. A card for a feature the plan lacks is hidden for members
  // and greyed-but-navigable ("fake disabled") for super-admins.
  const capFlags = useFlags();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  useEffect(() => {
    void getSession().then((s) => setIsSuperAdmin(s?.isSuperAdmin === true));
  }, []);
  const hideCard = (flag: FeatureFlagKey) => !planVisible(capFlags, isSuperAdmin, flag);
  const lockCard = (flag: FeatureFlagKey) => planLocked(capFlags, isSuperAdmin, flag);

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

  const newBlast = async (channel: "SMS" | "WHATSAPP") => {
    if (creating) return;
    setCreating(true);
    try {
      await createBlastAndOpen(router, showToast, { channel });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="page-stack">
      {/* Header + quick actions */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <LayoutDashboard className="h-6 w-6 shrink-0 text-primary" />
            <h1 className="text-2xl font-extrabold">Dashboard</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Everything across Uprise — messaging, conversations, audiences, automation and the field.
            {lastUpdatedAt ? ` Updated ${lastUpdatedAt.toLocaleTimeString()}.` : ""}
          </p>
        </div>
        <QuickActions
          actions={[
            {
              key: "new-conversation",
              label: "New Conversation",
              icon: <PlusCircle className="h-4 w-4" />,
              disabled: creating,
              onClick: () => setComposeOpen(true),
            },
            {
              key: "audience",
              label: "New Audience",
              icon: <Users className="h-4 w-4" />,
              onClick: () => router.push("/audience"),
            },
            ...(whatsappEnabled
              ? [
                  {
                    key: "new-whatsapp",
                    label: "New WhatsApp Blast",
                    icon: <MessageSquareText className="h-4 w-4" />,
                    variant: "outline" as const,
                    disabled: creating,
                    onClick: () => void newBlast("WHATSAPP"),
                  },
                ]
              : []),
            {
              key: "inbox",
              label: "Open Inbox",
              icon: <InboxIcon className="h-4 w-4" />,
              variant: "outline",
              onClick: () => router.push("/inbox"),
            },
          ]}
        />
      </div>

      <NewConversationMenu
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onPick={(ch) => {
          if (ch === "sms") void newBlast("SMS");
          else if (ch === "call") router.push("/channels/calls?new=1");
          else if (ch === "event") router.push("/canvass/events");
        }}
      />

      <OnboardingNudge />

      {/* Domain module grid */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <OverviewModuleCard
          title="Inbox"
          description="Two-way conversations"
          href="/inbox"
          hidden={hideCard("FEATURE_NAV_INBOX")}
          locked={lockCard("FEATURE_NAV_INBOX")}
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
          title="Calendar"
          description="Shifts, events & reminders"
          href="/calendar"
          hidden={hideCard("FEATURE_NAV_CALENDAR")}
          locked={lockCard("FEATURE_NAV_CALENDAR")}
          icon={<CalendarDays className="h-4 w-4" />}
          loading={calendar === null}
          error={calendar?.error}
          isEmpty={Boolean(calendar?.data && calendar.data.upcoming === 0)}
          empty="Nothing scheduled ahead."
        >
          <div className="space-y-2 text-sm">
            <p>
              <span className="text-2xl font-extrabold tabular-nums">
                {(calendar?.data?.upcoming ?? 0).toLocaleString()}
              </span>{" "}
              <span className="text-muted-foreground">scheduled ahead</span>
            </p>
            <p className="text-xs text-muted-foreground">Everything on the calendar, from now on</p>
          </div>
        </OverviewModuleCard>

        <OverviewModuleCard
          title="Audiences"
          description="Who you reach"
          href="/audience"
          hidden={hideCard("FEATURE_NAV_ENGAGEMENT_AUDIENCE")}
          locked={lockCard("FEATURE_NAV_ENGAGEMENT_AUDIENCE")}
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
          title="Messaging"
          description="SMS & WhatsApp campaigns"
          href="/channels/text"
          hidden={hideCard("FEATURE_NAV_CHANNELS")}
          locked={lockCard("FEATURE_NAV_CHANNELS")}
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
          title="Canvassing"
          description="Field & door-knocking"
          href="/canvass"
          hidden={hideCard("FEATURE_NAV_CANVASS")}
          locked={lockCard("FEATURE_NAV_CANVASS")}
          icon={<MapPin className="h-4 w-4" />}
          loading={campaign === null}
          error={campaign?.error}
          isEmpty={campaign?.data === null}
          empty="No campaigns yet."
        >
          {campaign?.data ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Across {campaign.data.campaigns.toLocaleString()} campaign{campaign.data.campaigns === 1 ? "" : "s"}
              </p>
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
                    {(campaign.data.summary?.volunteersOut ?? 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">volunteers out</p>
                </div>
              </div>
            </div>
          ) : null}
        </OverviewModuleCard>


        <OverviewModuleCard
          title="Searches"
          description="Reusable audience definitions"
          href="/audience/segments"
          hidden={hideCard("FEATURE_SEGMENTS_ENABLED")}
          locked={lockCard("FEATURE_SEGMENTS_ENABLED")}
          icon={<Split className="h-4 w-4" />}
          loading={searches === null}
          error={searches?.error}
          isEmpty={Boolean(searches?.data && searches.data.count === 0)}
          empty="No searches yet."
        >
          <div className="space-y-2 text-sm">
            <p>
              <span className="text-2xl font-extrabold tabular-nums">
                {(searches?.data?.count ?? 0).toLocaleString()}
              </span>{" "}
              <span className="text-muted-foreground">searches</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {(searches?.data?.members ?? 0).toLocaleString()} members matched
            </p>
          </div>
        </OverviewModuleCard>

        <OverviewModuleCard
          title="Events"
          description="Organising & RSVPs"
          href="/canvass/events"
          hidden={hideCard("FEATURE_NAV_EVENTS")}
          locked={lockCard("FEATURE_NAV_EVENTS")}
          icon={<CalendarClock className="h-4 w-4" />}
          loading={events === null}
          error={events?.error}
          isEmpty={Boolean(events?.data && events.data.count === 0)}
          empty="No upcoming events."
        >
          <div className="space-y-2 text-sm">
            <p>
              <span className="text-2xl font-extrabold tabular-nums">
                {(events?.data?.count ?? 0).toLocaleString()}
              </span>{" "}
              <span className="text-muted-foreground">upcoming</span>
            </p>
            <p className="text-xs text-muted-foreground">Published events supporters can RSVP to</p>
          </div>
        </OverviewModuleCard>


        <OverviewModuleCard
          title="Content"
          description="Surveys & scripts"
          href="/content/surveys"
          hidden={hideCard("FEATURE_NAV_ENGAGEMENT")}
          locked={lockCard("FEATURE_NAV_ENGAGEMENT")}
          icon={<Sparkles className="h-4 w-4" />}
          loading={content === null}
          error={content?.error}
          isEmpty={Boolean(content?.data && content.data.surveys === 0 && content.data.scripts === 0)}
          empty="No content yet."
        >
          <div className="flex gap-6 text-sm">
            <div>
              <p className="text-2xl font-extrabold tabular-nums">
                {(content?.data?.surveys ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">surveys</p>
            </div>
            <div>
              <p className="text-2xl font-extrabold tabular-nums">
                {(content?.data?.scripts ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">scripts</p>
            </div>
          </div>
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

        <OverviewModuleCard
          title="Journeys"
          description="Automated follow-ups"
          href="/future/journeys"
          hidden={hideCard("FEATURE_JOURNEYS_ENABLED")}
          locked={lockCard("FEATURE_JOURNEYS_ENABLED")}
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
