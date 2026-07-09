"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, BarChart3, ChevronRight, Sigma } from "lucide-react";
import { getPoll, provenanceLine, type PollDetail, type PollQuestionRef } from "@/lib/api/insights";
import { useApi } from "@/lib/use-api";
import { PageShell } from "@/components/shell/page-shell";
import { StateRegion } from "@/components/shell/state-region";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { SectionCard } from "@uprise/field";

// Human labels for the question categories the ingest tags (see the poll doc).
const CATEGORY_LABEL: Record<string, string> = {
  voting: "Voting intention",
  issues: "Issues & competence",
  treaty: "Treaty — support & awareness",
  arguments: "Arguments & persuasion",
  framing: "Framing & attitudes",
  demographics: "Demographics",
};
const CATEGORY_ORDER = ["treaty", "arguments", "framing", "issues", "voting", "demographics"];
const catRank = (c: string | null) => {
  const i = CATEGORY_ORDER.indexOf(c ?? "");
  return i === -1 ? CATEGORY_ORDER.length : i;
};

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
        {data ? <PollBody poll={data} pollId={pollId} /> : null}
      </StateRegion>
    </PageShell>
  );
}

function PollBody({ poll, pollId }: { poll: PollDetail; pollId: string }) {
  // Group questions by category, in a campaign-useful order.
  const byCategory = new Map<string | null, PollQuestionRef[]>();
  for (const q of poll.questions) {
    const list = byCategory.get(q.category) ?? [];
    list.push(q);
    byCategory.set(q.category, list);
  }
  const categories = [...byCategory.keys()].sort((a, b) => catRank(a) - catRank(b));

  return (
    <div className="section-stack">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={poll.status} />
        <p className="text-sm text-muted-foreground">{provenanceLine(poll)}</p>
      </div>

      {poll.methodology ? (
        <p className="text-sm text-muted-foreground">{poll.methodology}</p>
      ) : null}

      {poll.keyFindings.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Key findings
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {poll.keyFindings.map((f, i) => (
              <SectionCard key={i}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground">{f.heading}</h3>
                  {f.questionCode ? (
                    <Link
                      href={`/insights/${pollId}/questions/${f.questionCode}`}
                      className="shrink-0 rounded bg-surface-variant px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground hover:text-primary"
                    >
                      {f.questionCode}
                    </Link>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
              </SectionCard>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Questions
        </h2>
        <div className="section-stack">
          {categories.map((cat) => (
            <SectionCard key={cat ?? "other"} title={CATEGORY_LABEL[cat ?? ""] ?? cat ?? "Other"}>
              <ul className="divide-y divide-border">
                {byCategory.get(cat)!.map((q) => (
                  <li key={q.code}>
                    <Link
                      href={`/insights/${pollId}/questions/${q.code}`}
                      className="group flex items-center gap-3 py-2 text-sm"
                    >
                      <span className="rounded bg-surface-variant px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                        {q.code}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-foreground group-hover:text-primary">
                        {q.title}
                      </span>
                      {q.hasNet ? (
                        <Sigma className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Has NET rows" />
                      ) : null}
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {poll.attribution ?? provenanceLine(poll)}
        {poll.licence ? ` · ${poll.licence}` : ""}
      </p>
    </div>
  );
}
