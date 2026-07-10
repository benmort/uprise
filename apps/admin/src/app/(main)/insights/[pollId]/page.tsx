"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { getPoll } from "@/lib/api/insights";
import { useApi } from "@/lib/use-api";
import { PageShell } from "@/components/shell/page-shell";
import { StateRegion } from "@/components/shell/state-region";
import { Skeleton } from "@/components/ui/skeleton";
import { PollBody } from "@/components/insights/poll-body";

export default function PollDetailPage() {
  const { pollId } = useParams<{ pollId: string }>();
  const { data, loading, error, noPermission, refetch } = useApi(
    `/insights/polls/${pollId}`,
    () => getPoll(pollId),
    { ttlMs: 60_000 },
  );

  return (
    <PageShell icon={BarChart3} title={data?.title ?? "Poll"}>
      <Link
        href="/insights"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All polls
      </Link>

      <StateRegion
        loading={loading}
        error={error}
        noPermission={noPermission}
        onRetry={() => void refetch()}
        skeleton={<Skeleton className="h-64 w-full" />}
      >
        {data ? <PollBody poll={data} pollId={pollId} onChanged={() => void refetch()} /> : null}
      </StateRegion>
    </PageShell>
  );
}
