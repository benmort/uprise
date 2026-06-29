"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plug, Webhook } from "lucide-react";
import { listIntegrationConnections, type IntegrationConnectionRow } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { SectionCard } from "@uprise/field";

const PROVIDER_LABEL: Record<string, string> = {
  ACTION_NETWORK: "Action Network",
  INTERNAL: "Internal source",
};

export default function IntegrationsSettingsPage() {
  const [rows, setRows] = useState<IntegrationConnectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await listIntegrationConnections();
      if (!alive) return;
      if (!res.ok) setError(res.error);
      else setRows(res.data);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="page-stack">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/settings">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Settings
          </Link>
        </Button>
        <h1 className="text-2xl font-extrabold">Integrations</h1>
      </div>

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : error ? (
        <EmptyState title="Can't load integrations" description={error} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No connections yet"
          description="Connect Action Network or an internal source from the Audience importer."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((c) => (
            <SectionCard key={c.id}>
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 dark:bg-primary/20 text-primary">
                  <Plug className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-foreground">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{PROVIDER_LABEL[c.type] ?? c.type}</p>
                </div>
                <StatusBadge status={c.status} />
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                <Webhook className="h-3.5 w-3.5" />
                Updated {new Date(c.updatedAt).toLocaleDateString()}
              </p>
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  );
}
