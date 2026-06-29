"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, FileText } from "lucide-react";
import {
  getFeatureFlags,
  getOptOuts,
  getRecentBlasts,
  listWhatsappTemplates,
  type WhatsappTemplate,
} from "@/lib/api";
import { KpiTile } from "@uprise/field";
import { SectionCard } from "@uprise/field";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { ChannelCampaignsView, normaliseChannel } from "@/components/channels/channel-campaigns-view";

type ChannelKpis = { blasts: number; recipients: number; awaiting: number; optOuts: number };

export default function WhatsappChannelPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [kpis, setKpis] = useState<ChannelKpis | null>(null);
  const [templates, setTemplates] = useState<WhatsappTemplate[]>([]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const flags = await getFeatureFlags();
      if (!alive) return;
      const on = flags.ok ? Boolean(flags.data.FEATURE_WHATSAPP_ENABLED) : false;
      setEnabled(on);
      if (!on) return;
      const [blastsRes, optOutRes, templatesRes] = await Promise.all([
        getRecentBlasts(),
        getOptOuts(),
        listWhatsappTemplates("approved"),
      ]);
      if (!alive) return;
      const blasts = blastsRes.ok
        ? blastsRes.data.filter((b) => normaliseChannel(b.channel) === "WHATSAPP")
        : [];
      const recipients = blasts.reduce((t, b) => t + Number((b as any)._count?.recipients || 0), 0);
      const awaiting = blasts.reduce((t, b) => t + Number((b as any).awaitingResponseCount || 0), 0);
      const optOuts = optOutRes.ok
        ? optOutRes.data.byChannel.find((c) => c.channel === "WHATSAPP")?.count ?? 0
        : 0;
      setKpis({ blasts: blasts.length, recipients, awaiting, optOuts });
      if (templatesRes.ok) setTemplates(templatesRes.data);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (enabled === null) {
    return (
      <div className="page-stack">
        <Skeleton className="h-9 w-48" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="page-stack">
        <div className="section-stack">
          <h1 className="text-3xl font-semibold">WhatsApp</h1>
        </div>
        <EmptyState
          title="WhatsApp isn't enabled"
          description="Turn on the WhatsApp channel to send template messages and run two-way WhatsApp conversations."
          ctaLabel="Open settings"
          onCta={() => {
            window.location.assign("/settings");
          }}
        />
      </div>
    );
  }

  const v = (n?: number) => (kpis ? (n ?? 0).toLocaleString() : "—");

  return (
    <div className="page-stack">
      <div className="section-stack">
        <div>
          <h1 className="text-3xl font-semibold">WhatsApp</h1>
          <p className="text-sm text-muted-foreground">
            Template-led WhatsApp campaigns, approved senders and the 24-hour reply window.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="WhatsApp blasts" value={v(kpis?.blasts)} />
        <KpiTile label="Recipients" value={v(kpis?.recipients)} />
        <KpiTile label="Awaiting response" value={v(kpis?.awaiting)} />
        <KpiTile label="Approved templates" value={kpis ? templates.length.toLocaleString() : "—"} />
      </div>

      <SectionCard
        title="Message templates"
        description="Cold WhatsApp sends must use a Meta-approved template. Synced from Twilio's Content API."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/settings/integrations">Manage</Link>
          </Button>
        }
      >
        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No approved templates yet. Sync from Twilio, then build a WhatsApp blast.
          </p>
        ) : (
          <ul className="divide-y divide-[hsl(var(--muted))]">
            {templates.slice(0, 6).map((t) => (
              <li key={t.contentSid} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    {t.friendlyName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t.language} · {t.category}
                  </p>
                </div>
                <StatusBadge status={String(t.status || "").toUpperCase() === "APPROVED" ? "ACTIVE" : "PENDING"} />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          Free-text replies are only allowed within 24h of a contact's last message; outside that, send a template.
        </p>
      </SectionCard>

      <ChannelCampaignsView
        channel="WHATSAPP"
        title="WhatsApp campaigns"
        description="Template-led WhatsApp blasts to opted-in contacts."
      />
    </div>
  );
}
