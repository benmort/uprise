"use client";

import { useParams } from "next/navigation";
import { MessageCircleQuestion } from "lucide-react";
import { getPollQuestion } from "@/lib/api/insights";
import { useApi } from "@/lib/use-api";
import { PageShell } from "@/components/shell/page-shell";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { StateRegion } from "@/components/shell/state-region";
import { Skeleton } from "@/components/ui/skeleton";
import { QuestionBody } from "@/components/insights/question-body";

export default function QuestionPage() {
  const { pollId, code } = useParams<{ pollId: string; code: string }>();
  const { data, loading, error, noPermission, refetch } = useApi(
    `/insights/polls/${pollId}/questions/${code}`,
    () => getPollQuestion(pollId, code),
    { ttlMs: 60_000 },
  );

  return (
    <PageShell
      icon={MessageCircleQuestion}
      title={data ? `[${data.question.code}] ${data.question.title}` : "Question"}
      actions={
        data ? (
          <Breadcrumbs
            items={[
              { label: "Polling", href: "/insights" },
              { label: data.poll.title, href: `/insights/${pollId}` },
              { label: data.question.code },
            ]}
          />
        ) : undefined
      }
    >
      <StateRegion
        loading={loading}
        error={error}
        noPermission={noPermission}
        onRetry={() => void refetch()}
        skeleton={<Skeleton className="h-96 w-full" />}
      >
        {data ? <QuestionBody data={data} pollId={pollId} code={code} /> : null}
      </StateRegion>
    </PageShell>
  );
}
