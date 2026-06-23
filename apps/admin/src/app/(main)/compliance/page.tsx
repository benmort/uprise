"use client";

import { useEffect, useState } from "react";
import { ShieldOff } from "lucide-react";
import { getOptOuts, type OptOutLedger } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { KpiTile } from "@/components/canvass/kpi-tile";
import { SectionCard } from "@/components/canvass/section-card";
import { DataTable } from "@/components/canvass/data-table";

export default function CompliancePage() {
  const [data, setData] = useState<OptOutLedger | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getOptOuts();
      if (!alive) return;
      if (!res.ok) setError(res.error);
      else setData(res.data);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) return <div className="page-stack"><Skeleton className="h-48 w-full" /></div>;
  if (error || !data) {
    return <div className="page-stack"><EmptyState title="Can't load compliance" description={error || "Not found."} /></div>;
  }

  const sms = data.byChannel.find((c) => c.channel === "SMS")?.count ?? 0;
  const wa = data.byChannel.find((c) => c.channel === "WHATSAPP")?.count ?? 0;

  return (
    <div className="page-stack">
      <div>
        <h1 className="text-2xl font-extrabold">Compliance</h1>
        <p className="text-sm text-muted-foreground">
          The opt-out ledger. Opted-out contacts are automatically excluded from every send.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiTile label="Total opt-outs" value={data.total} icon={<ShieldOff className="h-4 w-4" />} />
        <KpiTile label="SMS" value={sms} />
        <KpiTile label="WhatsApp" value={wa} />
      </div>

      <SectionCard title="Opt-out ledger" description="STOP keywords and manual suppressions, most recent first.">
        {data.entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No opt-outs recorded.</p>
        ) : (
          <DataTable
            rows={data.entries}
            rowKey={(e) => e.id}
            columns={[
              { key: "phone", header: "Phone", cell: (e) => <span className="tabular-nums">{e.phoneE164}</span> },
              { key: "channel", header: "Channel", cell: (e) => <StatusBadge status={e.channel === "WHATSAPP" ? "READ" : "DELIVERED"} /> },
              { key: "source", header: "Source", cell: (e) => e.source ?? "—" },
              { key: "at", header: "When", cell: (e) => new Date(e.updatedAt).toLocaleString() },
            ]}
          />
        )}
      </SectionCard>
    </div>
  );
}
