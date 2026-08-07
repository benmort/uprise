"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plug } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { EntityRow } from "@uprise/ui";
import { listIntegrationConnections, type IntegrationConnectionRow } from "@/lib/api";
import { providerLabel } from "@/lib/integration-sources";
import { PullListCard } from "@/components/audience/pull-list-card";
import { ConnectNationBuilderDialog } from "@/components/audience/connect-nation-builder-dialog";
import { SyncActivityCard } from "@/components/audience/sync-activity-card";

/**
 * The Data sync surface — the bidirectional home for CRM sync, replacing the old
 * `/audience?tab=sync` card. Composes: the connections card (with the guided
 * NationBuilder connect), the pull card, and — as the write-back ships — the Sync
 * activity card (stream toggles + delivery log).
 *
 * First-run: nothing connected ⇒ one empty state whose primary action opens the
 * NationBuilder dialog in place; the organiser never leaves the page. Other providers
 * keep their home in Settings → Integrations.
 */
export function DataSyncView() {
  const [connections, setConnections] = useState<IntegrationConnectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [noPermission, setNoPermission] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  // Bumped after a successful connect so the pull card re-fetches its sources.
  const [reloadToken, setReloadToken] = useState(0);

  const load = async () => {
    setLoading(true);
    const res = await listIntegrationConnections();
    if (res.ok) {
      setConnections(res.data);
      setError("");
      setNoPermission(false);
    } else if (res.status === 403) {
      setNoPermission(true);
    } else {
      setError(res.error);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (noPermission) {
    return (
      <EmptyState
        title="Data sync is for organisers"
        description="Connecting a CRM and syncing lists needs the integrations permission — ask an organiser or owner."
      />
    );
  }

  if (error) {
    return (
      <EmptyState
        title="We couldn't load your connections"
        description={error}
        ctaLabel="Retry"
        onCta={() => void load()}
      />
    );
  }

  if (connections.length === 0) {
    return (
      <>
        <Card>
          <CardContent className="py-10">
            <EmptyState
              icon={Plug}
              title="Connect your NationBuilder nation"
              description="Pull any NationBuilder list or tag into uprise for texting, calling and door-knocking prep – and send what happens here back to NationBuilder automatically."
              action={
                <div className="flex flex-col items-center gap-2">
                  <Button onClick={() => setConnectOpen(true)}>Connect NationBuilder</Button>
                  <p className="text-xs text-muted-foreground">
                    Other sources are managed in{" "}
                    <Link href="/settings/integrations" className="text-primary underline-offset-4 hover:underline">
                      Settings → Integrations
                    </Link>
                    .
                  </p>
                </div>
              }
            />
          </CardContent>
        </Card>
        <ConnectNationBuilderDialog
          open={connectOpen}
          onClose={() => setConnectOpen(false)}
          onConnected={() => {
            setConnectOpen(false);
            setReloadToken((t) => t + 1);
            void load();
          }}
        />
      </>
    );
  }

  return (
    <div className="grid gap-4">
      <Card id="data-sync-connections">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Connections</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setConnectOpen(true)}>
            + Connect NationBuilder
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {connections.map((c) => (
            <EntityRow
              key={c.id}
              title={c.name}
              meta={`${providerLabel(c.type)}${c.group ? ` · ${c.group}` : ""}`}
              trailing={<StatusBadge status={c.status} />}
            />
          ))}
          <p className="pt-1 text-xs text-muted-foreground">
            Tokens and advanced options (white-label domains, disconnecting) live in{" "}
            <Link href="/settings/integrations" className="text-primary underline-offset-4 hover:underline">
              Settings → Integrations
            </Link>
            .
          </p>
        </CardContent>
      </Card>

      <PullListCard reloadToken={reloadToken} />

      <SyncActivityCard connections={connections} />

      <ConnectNationBuilderDialog
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        onConnected={() => {
          setConnectOpen(false);
          setReloadToken((t) => t + 1);
          void load();
        }}
      />
    </div>
  );
}
