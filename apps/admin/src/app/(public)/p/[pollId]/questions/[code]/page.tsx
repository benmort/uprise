"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getPublicPollQuestion } from "@/lib/api/insights";
import { useApi } from "@/lib/use-api";
import { StateRegion } from "@/components/shell/state-region";
import { Skeleton } from "@/components/ui/skeleton";
import { QuestionBody } from "@/components/insights/question-body";
import { PublicHeader } from "@/components/insights/public-header";
import { InsightsApiProvider } from "@/components/insights/insights-api-context";

/** Public question crosstab — reuses <QuestionBody> verbatim (chart, map, heat table), minus the
 *  org-only turf targeting. Fetches the unauthenticated public endpoint. */
export default function PublicQuestionPage() {
  const { pollId, code } = useParams<{ pollId: string; code: string }>();
  const { data, loading, error, refetch } = useApi(
    `/insights/public/polls/${pollId}/questions/${code}`,
    () => getPublicPollQuestion(pollId, code),
    { ttlMs: 60_000 },
  );

  return (
    <InsightsApiProvider mode="public">
      <PublicHeader tenant={null} />
      <div className="mt-6 space-y-4">
        <Link
          href={`/p/${pollId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to poll
        </Link>
        {data ? (
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-foreground sm:text-3xl">
            [{data.question.code}] {data.question.title}
          </h1>
        ) : null}
        <StateRegion
          loading={loading}
          error={error}
          onRetry={() => void refetch()}
          emptyTitle="Question not found"
          empty={!loading && !error && !data}
          skeleton={<Skeleton className="h-96 w-full" />}
        >
          {data ? <QuestionBody data={data} pollId={pollId} code={code} mode="public" /> : null}
        </StateRegion>
      </div>
    </InsightsApiProvider>
  );
}
