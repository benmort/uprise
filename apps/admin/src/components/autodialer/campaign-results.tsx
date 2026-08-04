"use client";

import { useState } from "react";
import { autodialer } from "@uprise/api-client";
import { useApi } from "@/lib/use-api";
import type { DialerBehaviourKey } from "@/lib/autodialer";
import { StateRegion } from "@/components/shell/state-region";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { SegmentedControl } from "@uprise/ui";

type View = "survey" | "transfers";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

/** Results tab: survey answer distributions and the transfer ledger. */
export function CampaignResults({
  campaignId,
  behaviour,
}: {
  campaignId: string;
  behaviour: DialerBehaviourKey;
}) {
  const [view, setView] = useState<View>(behaviour === "survey" ? "survey" : "transfers");
  const results = useApi(`/autodialer/campaigns/${campaignId}/results`, () => autodialer.results(campaignId), {
    ttlMs: 10_000,
  });
  const data = results.data;

  return (
    <StateRegion
      loading={results.loading}
      error={results.error}
      noPermission={results.noPermission}
      onRetry={() => void results.refetch()}
      empty={false}
      skeleton={<Skeleton className="h-64 w-full" />}
    >
      <div className="space-y-4">
        <SegmentedControl
          value={view}
          options={[
            { value: "survey", label: "Survey answers" },
            { value: "transfers", label: "Transfers" },
          ]}
          onChange={setView}
          aria-label="Results view"
        />

        {view === "survey" ? (
          data && data.questions.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {data.questions.map((question) => (
                <Card key={question.key} className="p-4">
                  <p className="text-sm font-semibold">
                    <span className="mr-2 font-mono text-xs text-muted-foreground">{question.key}</span>
                    {question.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {question.total.toLocaleString()} answer{question.total === 1 ? "" : "s"}
                  </p>
                  <ul className="mt-3 space-y-2">
                    {question.answers.map((answer) => {
                      const share = question.total > 0 ? Math.round((answer.count / question.total) * 100) : 0;
                      return (
                        <li key={answer.digit} className="text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span>
                              <span className="mr-1.5 font-mono text-xs text-muted-foreground">{answer.digit}</span>
                              {answer.value}
                              {answer.dispositionCode ? (
                                <span className="ml-2 rounded bg-surface-variant px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                                  {answer.dispositionCode}
                                </span>
                              ) : null}
                            </span>
                            <span className="tabular-nums text-muted-foreground">
                              {answer.count.toLocaleString()} · {share}%
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-variant">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
              No survey answers yet{behaviour !== "survey" ? " — this campaign has no survey" : ""}.
            </p>
          )
        ) : null}

        {view === "transfers" ? (
          data && data.transfers.length > 0 ? (
            <Card className="divide-y divide-border p-0">
              <p className="px-4 py-3 text-xs text-muted-foreground">
                {data.transferCount.toLocaleString()} patch-through{data.transferCount === 1 ? "" : "s"} recorded
                {data.transferCount > data.transfers.length ? ` (showing latest ${data.transfers.length})` : ""}.
              </p>
              {data.transfers.map((transfer) => (
                <div key={transfer.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <span>
                    {transfer.targetName ?? "Fixed target"}
                    {transfer.electorate ? (
                      <span className="ml-2 text-xs text-muted-foreground">{transfer.electorate}</span>
                    ) : null}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{transfer.targetNumber}</span>
                  <span className="text-xs text-muted-foreground">{formatDate(transfer.createdAt)}</span>
                </div>
              ))}
            </Card>
          ) : (
            <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
              No transfers yet.
            </p>
          )
        ) : null}
      </div>
    </StateRegion>
  );
}
