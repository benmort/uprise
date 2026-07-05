"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, ShieldCheck } from "lucide-react";
import { getQaReview, resolveQaFlag, type QaFlag } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard } from "@uprise/field";
import { StateRegion } from "@/components/shell/state-region";
import { useApi } from "@/lib/use-api";
import { useToast } from "@/components/ui/toast";

export default function QaPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const { showToast } = useToast();
  const { data, loading, error, noPermission, refetch } = useApi(
    `/canvass/campaigns/${campaignId}/qa`,
    () => getQaReview(campaignId),
  );
  const flags = data?.flags ?? [];
  const [busyFlag, setBusyFlag] = useState<string | null>(null);

  const act = useCallback(
    async (
      f: QaFlag,
      input: { state?: "RESOLVED" | "DISMISSED"; resolved?: boolean },
      successTitle: string,
    ) => {
      setBusyFlag(f.id);
      const res = await resolveQaFlag(campaignId, { doorKnockId: f.doorKnockId, kind: f.kind, ...input });
      setBusyFlag(null);
      if (!res.ok) {
        showToast({ tone: "error", title: "Couldn't update flag", description: res.error });
        return;
      }
      showToast({ tone: "success", title: successTitle });
      await refetch();
    },
    [campaignId, showToast, refetch],
  );

  return (
    <div className="page-stack">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/canvass">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Canvass
          </Link>
        </Button>
        <h1 className="text-2xl font-extrabold">Data quality</h1>
      </div>

      <StateRegion
        loading={loading}
        error={error}
        noPermission={noPermission}
        onRetry={() => void refetch()}
        skeleton={<Skeleton className="h-40 w-full" />}
      >
        {flags.length === 0 ? (
          <SectionCard title="Review">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-success" />
              No suspicious knocks flagged.
            </p>
          </SectionCard>
        ) : (
          <SectionCard
            title={`Flagged knocks (${flags.length})`}
            description="Too-fast cadence or missing GPS — spot-check these."
          >
            <ul className="space-y-2">
              {flags.map((f) => (
                <li
                  key={f.id}
                  className={`flex flex-wrap items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm ${
                    f.resolved ? "opacity-60" : ""
                  }`}
                >
                  {f.resolved ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-warning-foreground" />
                  )}
                  <span className="min-w-0 flex-1 text-foreground">
                    {f.reason}
                    {f.volunteer ? ` · ${f.volunteer}` : ""}
                  </span>
                  {f.resolved ? (
                    <span className="shrink-0 rounded-full bg-surface-variant px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
                      {f.state === "DISMISSED" ? "Dismissed" : "Resolved"}
                    </span>
                  ) : null}
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {new Date(f.at).toLocaleString()}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {f.resolved ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyFlag === f.id}
                        onClick={() => void act(f, { resolved: false }, "Flag reopened")}
                      >
                        Undo
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyFlag === f.id}
                          onClick={() => void act(f, { state: "RESOLVED" }, "Flag resolved")}
                        >
                          Resolve
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busyFlag === f.id}
                          onClick={() => void act(f, { state: "DISMISSED" }, "Flag dismissed")}
                        >
                          Dismiss
                        </Button>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </SectionCard>
        )}
      </StateRegion>
    </div>
  );
}
