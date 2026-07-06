"use client";

import { useEffect, useState } from "react";
import { getOptOuts, getRecentBlasts } from "@/lib/api";
import { KpiTile } from "@uprise/field";
import { Button } from "@/components/ui/button";
import { ChannelCampaignsView, normaliseChannel } from "@/components/channels/channel-campaigns-view";

type ChannelKpis = { blasts: number; recipients: number; awaiting: number; optOuts: number };

export default function TextChannelPage() {
  const [kpis, setKpis] = useState<ChannelKpis | null>(null);
  const [kpisError, setKpisError] = useState(false);

  const loadKpis = async () => {
    setKpisError(false);
    const [blastsRes, optOutRes] = await Promise.all([getRecentBlasts(), getOptOuts()]);
    if (!blastsRes.ok || !optOutRes.ok) {
      setKpisError(true);
      return;
    }
    const blasts = blastsRes.data.filter((b) => normaliseChannel(b.channel) === "SMS");
    const recipients = blasts.reduce((t, b) => t + Number((b as any)._count?.recipients || 0), 0);
    const awaiting = blasts.reduce((t, b) => t + Number((b as any).awaitingResponseCount || 0), 0);
    const optOuts = optOutRes.data.byChannel.find((c) => c.channel === "SMS")?.count ?? 0;
    setKpis({ blasts: blasts.length, recipients, awaiting, optOuts });
  };

  useEffect(() => {
    void loadKpis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      {kpisError ? (
        <div className="flex items-center justify-between gap-3 rounded border border-error/40 bg-error-container px-3 py-2 text-sm text-error">
          <span>Couldn't load stats.</span>
          <Button variant="outline" size="sm" onClick={() => void loadKpis()}>
            Retry
          </Button>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Text blasts" value={v(kpis?.blasts)} />
        <KpiTile label="Recipients" value={v(kpis?.recipients)} />
        <KpiTile label="Awaiting response" value={v(kpis?.awaiting)} />
        <KpiTile label="Opted out" value={v(kpis?.optOuts)} />
      </div>

      <ChannelCampaignsView
        channel="SMS"
        title="Text campaigns"
        description="SMS blasts across your audiences."
      />
    </div>
  );
}
