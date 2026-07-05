"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { getCampaignResults, type CampaignResults } from "@/lib/api/campaigns";
import { useApi } from "@/lib/use-api";
import { StateRegion } from "@/components/shell/state-region";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard } from "@uprise/field";
import { ProgressBar } from "@uprise/field";
import { SupportLevelBar } from "@uprise/field";
import type { SupportLevel } from "@uprise/field";

// RFC-4180 quote: wrap in double quotes and double any internal quotes, so a code
// containing a comma/quote/newline can't break the CSV layout.
function csv(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function toCsv(r: CampaignResults): string {
  const row = (section: string, key: unknown, value: unknown) =>
    [csv(section), csv(key), csv(value)].join(",");
  const lines = [row("section", "key", "value")];
  r.dispositionBreakdown.forEach((d) => lines.push(row("disposition", d.code, d.count)));
  r.supportDistribution.forEach((s) => lines.push(row("support", s.supportLevel, s.count)));
  Object.entries(r.funnel).forEach(([k, v]) => lines.push(row("funnel", k, v)));
  return lines.join("\n");
}

export default function ResultsPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const { data: results, loading, error, noPermission, refetch } = useApi(
    `/canvass/${campaignId}/results`,
    () => getCampaignResults(campaignId),
    { ttlMs: 15_000 },
  );

  function exportCsv() {
    if (!results) return;
    const blob = new Blob([toCsv(results)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campaign-${campaignId}-results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!results) {
    return (
      <div className="page-stack">
        <StateRegion
          loading={loading}
          error={error}
          noPermission={noPermission}
          onRetry={() => void refetch()}
          errorTitle="Can't load results"
          skeleton={<Skeleton className="h-64 w-full" />}
        >
          {null}
        </StateRegion>
      </div>
    );
  }

  const maxDisp = Math.max(1, ...results.dispositionBreakdown.map((d) => d.count));
  const supportCounts = Object.fromEntries(
    results.supportDistribution
      .filter((s) => s.supportLevel)
      .map((s) => [s.supportLevel as SupportLevel, s.count]),
  ) as Partial<Record<SupportLevel, number>>;
  const { funnel } = results;

  return (
    <div className="page-stack">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/canvass">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Canvass
          </Link>
        </Button>
        <h1 className="text-2xl font-extrabold">Results</h1>
        <Button variant="outline" size="sm" className="ml-auto" onClick={exportCsv}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Export CSV
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title="Disposition breakdown">
          {results.dispositionBreakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground">No dispositions logged yet.</p>
          ) : (
            <ul className="space-y-2">
              {results.dispositionBreakdown.map((d) => (
                <li key={d.code}>
                  <ProgressBar
                    tone="primary"
                    value={d.count}
                    max={maxDisp}
                    label={
                      <>
                        <span className="capitalize">{d.code.replaceAll("_", " ")}</span>
                        <span>{d.count}</span>
                      </>
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Support level">
          <SupportLevelBar counts={supportCounts} />
        </SectionCard>
      </div>

      <SectionCard title="Door + text funnel">
        <div className="space-y-2">
          {[
            { label: "Doors attempted", value: funnel.doorsAttempted },
            { label: "Contacted", value: funnel.contacted },
            { label: "Surveyed", value: funnel.surveyed },
            { label: "New supporters", value: funnel.newSupporters },
          ].map((step) => (
            <ProgressBar
              key={step.label}
              tone="success"
              value={step.value}
              max={Math.max(1, funnel.doorsAttempted)}
              label={
                <>
                  <span>{step.label}</span>
                  <span>{step.value}</span>
                </>
              }
            />
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
