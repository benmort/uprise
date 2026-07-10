"use client";

import { useParams } from "next/navigation";
import { getPublicPoll } from "@/lib/api/insights";
import { useApi } from "@/lib/use-api";
import { StateRegion } from "@/components/shell/state-region";
import { Skeleton } from "@/components/ui/skeleton";
import { PollBody } from "@/components/insights/poll-body";
import { InsightsApiProvider } from "@/components/insights/insights-api-context";

/**
 * Chrome-less, embeddable poll overview — the SAME <PollBody> the public /p/ page uses
 * (persuasion shift, key findings, per-question mini-charts), minus the header, for
 * iframing into the action app's insights layout. Public data only.
 */
export default function EmbedPollPage() {
  const { pollId } = useParams<{ pollId: string }>();
  const { data, loading, error, refetch } = useApi(
    `/insights/public/polls/${pollId}`,
    () => getPublicPoll(pollId),
    { ttlMs: 60_000 },
  );

  return (
    <InsightsApiProvider mode="public">
      <StateRegion
        loading={loading}
        error={error}
        onRetry={() => void refetch()}
        emptyTitle="Poll not found"
        empty={!loading && !error && !data}
        skeleton={<Skeleton className="h-64 w-full" />}
      >
        {data ? <PollBody poll={data} pollId={pollId} mode="public" /> : null}
      </StateRegion>
    </InsightsApiProvider>
  );
}
