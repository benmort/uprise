"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { getOptOuts, getRecentBlasts } from "@/lib/api";
import { KpiTile } from "@/components/canvass/kpi-tile";
import { SectionCard } from "@/components/canvass/section-card";
import { Button } from "@/components/ui/button";
import { ChannelCampaignsView, normaliseChannel } from "@/components/channels/channel-campaigns-view";

type ChannelKpis = { blasts: number; recipients: number; awaiting: number; optOuts: number };

export default function TextChannelPage() {
  const [kpis, setKpis] = useState<ChannelKpis | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [blastsRes, optOutRes] = await Promise.all([getRecentBlasts(), getOptOuts()]);
      if (!alive) return;
      const blasts = blastsRes.ok
        ? blastsRes.data.filter((b) => normaliseChannel(b.channel) === "SMS")
        : [];
      const recipients = blasts.reduce((t, b) => t + Number((b as any)._count?.recipients || 0), 0);
      const awaiting = blasts.reduce((t, b) => t + Number((b as any).awaitingResponseCount || 0), 0);
      const optOuts = optOutRes.ok
        ? optOutRes.data.byChannel.find((c) => c.channel === "SMS")?.count ?? 0
        : 0;
      setKpis({ blasts: blasts.length, recipients, awaiting, optOuts });
    })();
    return () => {
      alive = false;
    };
  }, []);

  const v = (n?: number) => (kpis ? (n ?? 0).toLocaleString() : "—");

  return (
    <div className="page-stack">
      <div className="section-stack">
        <div>
          <h1 className="text-3xl font-semibold">Text (SMS)</h1>
          <p className="text-sm text-muted-foreground">
            Your SMS campaigns, delivery and compliance in one place.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Text blasts" value={v(kpis?.blasts)} />
        <KpiTile label="Recipients" value={v(kpis?.recipients)} />
        <KpiTile label="Awaiting response" value={v(kpis?.awaiting)} />
        <KpiTile label="Opted out" value={v(kpis?.optOuts)} />
      </div>

      <SectionCard
        title="SMS compliance"
        description="Every SMS must offer an opt-out and stay within carrier limits."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/compliance">Opt-out ledger</Link>
          </Button>
        }
      >
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[hsl(var(--success))]" />
            Include “Reply STOP to opt out” — STOP/START keywords are honoured automatically.
          </li>
          <li className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[hsl(var(--success))]" />
            Messages over ~160 characters split into multiple billed segments.
          </li>
          <li>
            {kpis ? `${kpis.optOuts.toLocaleString()} contact(s)` : "—"} have opted out of SMS.
          </li>
        </ul>
      </SectionCard>

      <ChannelCampaignsView
        channel="SMS"
        title="Text campaigns"
        description="SMS blasts across your audiences."
      />
    </div>
  );
}
