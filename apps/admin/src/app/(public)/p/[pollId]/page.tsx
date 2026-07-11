"use client";

import { useParams } from "next/navigation";
import { getPublicPoll } from "@/lib/api/insights";
import { useApi } from "@/lib/use-api";
import { StateRegion } from "@/components/shell/state-region";
import { Skeleton } from "@/components/ui/skeleton";
import { PollBody } from "@/components/insights/poll-body";
import { PublicHeader } from "@/components/insights/public-header";
import { InsightsApiProvider } from "@/components/insights/insights-api-context";

/**
 * Public poll overview — reuses <PollBody> verbatim (same charts, key findings, movement measure),
 * fetching the unauthenticated public endpoint and hiding the org-only controls. Served on the
 * action domain via a rewrite of /insights/[id] → /p/[id].
 */
export default function PublicPollPage() {
  const { pollId } = useParams<{ pollId: string }>();
  const { data, loading, error, refetch } = useApi(
    `/insights/public/polls/${pollId}`,
    () => getPublicPoll(pollId),
    { ttlMs: 60_000 },
  );

  return (
    <InsightsApiProvider mode="public">
      <PublicHeader tenant={data?.tenant ?? null} />
      <div className="mt-6">
        <StateRegion
          loading={loading}
          error={error}
          onRetry={() => void refetch()}
          emptyTitle="Poll not found"
          emptyDescription="This poll isn't public, or the link is wrong."
          empty={!loading && !error && !data}
          skeleton={<Skeleton className="h-64 w-full" />}
        >
          {data ? (
            <>
              <h1 className="mb-4 text-2xl font-extrabold leading-tight tracking-tight text-foreground sm:text-3xl">
                {data.title}
              </h1>
              <PollBody poll={data} pollId={pollId} mode="public" />
            </>
          ) : null}
        </StateRegion>
      </div>
    </InsightsApiProvider>
  );
}
