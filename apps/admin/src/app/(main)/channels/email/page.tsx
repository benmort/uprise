"use client";

import Link from "next/link";
import { MailOpen, ShieldCheck } from "lucide-react";
import { KpiTile, SectionCard } from "@uprise/field";
import { StatusBadge } from "@uprise/ui";
import { Button } from "@/components/ui/button";

/**
 * Email channel overview — MOCK page mirroring /channels/text while the email
 * blast product is built (the per-tenant sender-identity engine already exists
 * behind FEATURE_TENANT_EMAIL_ENABLED). All figures below are sample data; the
 * layout is the contract the real wiring drops into (KPIs from blasts filtered
 * to EMAIL + the shared ChannelCampaignsView, exactly like Text).
 */

const MOCK_KPIS = {
  blasts: 12,
  recipients: 8_420,
  openRate: "42.3%",
  unsubscribed: 96,
};

const MOCK_CAMPAIGNS: Array<{
  id: string;
  title: string;
  status: string;
  recipients: number;
  openRate: string;
  clickRate: string;
  sentAt: string;
}> = [
  {
    id: "em_1",
    title: "July volunteer call-out",
    status: "SENT",
    recipients: 3_240,
    openRate: "47.1%",
    clickRate: "9.8%",
    sentAt: "2 Jul 2026",
  },
  {
    id: "em_2",
    title: "Winter fundraising appeal",
    status: "SENT",
    recipients: 2_980,
    openRate: "39.4%",
    clickRate: "6.2%",
    sentAt: "24 Jun 2026",
  },
  {
    id: "em_3",
    title: "Policy launch — housing",
    status: "SCHEDULED",
    recipients: 2_200,
    openRate: "—",
    clickRate: "—",
    sentAt: "Scheduled 8 Jul 2026",
  },
  {
    id: "em_4",
    title: "Member newsletter #14",
    status: "DRAFTED",
    recipients: 0,
    openRate: "—",
    clickRate: "—",
    sentAt: "Draft",
  },
];

export default function EmailChannelPage() {
  const kpis = MOCK_KPIS;

  return (
    <div className="page-stack">
      <div className="section-stack">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h1 className="text-3xl font-semibold">Email</h1>
            <p className="text-sm text-muted-foreground">
              Your email campaigns, deliverability and compliance in one place.
            </p>
          </div>
          <span className="rounded-full bg-surface-variant px-2.5 py-1 text-xs font-bold uppercase text-muted-foreground">
            Sample data
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Email blasts" value={kpis.blasts.toLocaleString()} />
        <KpiTile label="Recipients" value={kpis.recipients.toLocaleString()} />
        <KpiTile label="Open rate" value={kpis.openRate} />
        <KpiTile label="Unsubscribed" value={kpis.unsubscribed.toLocaleString()} />
      </div>

      <SectionCard
        title="Email compliance"
        description="Every marketing email must identify the sender and offer a working unsubscribe (Spam Act 2003)."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/compliance">Opt-out ledger</Link>
          </Button>
        }
      >
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[hsl(var(--success))]" />
            An unsubscribe link is added to every marketing email and honoured automatically.
          </li>
          <li className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[hsl(var(--success))]" />
            Sends go from <span className="mx-1 font-mono text-foreground">info@uprise.org.au</span>
            — per-organisation sender addresses are coming soon.
          </li>
          <li>{MOCK_KPIS.unsubscribed.toLocaleString()} contact(s) have unsubscribed from email.</li>
        </ul>
      </SectionCard>

      <SectionCard
        title="Email campaigns"
        description="Email blasts across your audiences (sample data — the email blast builder is on its way)."
      >
        {MOCK_CAMPAIGNS.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No email campaigns yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {MOCK_CAMPAIGNS.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-variant text-muted-foreground">
                  <MailOpen className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{c.title}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {c.recipients > 0 ? `${c.recipients.toLocaleString()} recipients · ` : ""}
                    {c.sentAt}
                  </p>
                </div>
                <div className="hidden gap-4 text-right sm:flex">
                  <div>
                    <p className="text-xs text-muted-foreground">Opens</p>
                    <p className="text-sm font-semibold tabular-nums">{c.openRate}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Clicks</p>
                    <p className="text-sm font-semibold tabular-nums">{c.clickRate}</p>
                  </div>
                </div>
                <StatusBadge status={c.status} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
