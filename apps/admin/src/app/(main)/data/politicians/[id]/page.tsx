"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowUpRight, Landmark } from "lucide-react";
import { getPolitician, attendancePct, type PolicyPositionRow } from "@/lib/api/civic";
import { useApi } from "@/lib/use-api";
import { PageShell } from "@/components/shell/page-shell";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { StateRegion } from "@/components/shell/state-region";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard } from "@uprise/field";
import { DataTable } from "@uprise/field";

const HOUSE_LABEL: Record<string, string> = { REPS: "House of Representatives", SENATE: "Senate" };

/** They Vote For You agreement buckets → plain language. */
const CATEGORY_LABEL: Record<string, string> = {
  for3: "Consistently for",
  for2: "Generally for",
  for1: "Moderately for",
  mixture: "Mixed",
  against1: "Moderately against",
  against2: "Generally against",
  against3: "Consistently against",
  not_enough: "Not enough info",
};

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

export default function PoliticianDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error, noPermission, refetch } = useApi(
    `/civic/politicians/${id}`,
    (signal) => getPolitician(id, { signal }),
    { ttlMs: 60_000 },
  );

  const attendance = data ? attendancePct(data) : null;
  // A Rep's electorate deep-links to its division-detail boundary; Senate seats are state-wide.
  const electorateHref = data?.house === "REPS" && data.geoCode ? `/data/divisions/ced/${data.geoCode}` : null;

  return (
    <PageShell
      icon={Landmark}
      title={data?.name ?? "Politician"}
      actions={
        <Breadcrumbs
          items={[
            { label: "Data Sets", href: "/data/datasets" },
            { label: "Politicians", href: "/data/politicians" },
            { label: data?.name ?? "…" },
          ]}
        />
      }
    >
      <StateRegion
        loading={loading}
        error={error}
        noPermission={noPermission}
        onRetry={() => void refetch()}
        empty={!loading && !error && !data}
        emptyTitle="Politician not found"
        skeleton={<Skeleton className="h-96 w-full" />}
      >
        {data ? (
          <div className="section-stack">
            <SectionCard title="Overview">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Party" value={data.party ?? "—"} />
                <Stat label="House" value={HOUSE_LABEL[data.house] ?? data.house} />
                <Stat
                  label="Electorate"
                  value={
                    electorateHref ? (
                      <Link href={electorateHref} className="inline-flex items-center gap-1 text-primary hover:underline">
                        {data.electorate ?? "—"}
                        <ArrowUpRight className="h-4 w-4" />
                      </Link>
                    ) : (
                      data.electorate ?? "—"
                    )
                  }
                />
                <Stat label="Attendance" value={attendance == null ? "—" : `${attendance}%`} />
                <Stat
                  label="Votes attended"
                  value={
                    data.votesAttended == null
                      ? "—"
                      : `${data.votesAttended.toLocaleString()}${data.votesPossible ? ` / ${data.votesPossible.toLocaleString()}` : ""}`
                  }
                />
                <Stat label="Rebellions" value={data.rebellions ?? "—"} />
              </div>
            </SectionCard>

            <SectionCard
              title="Policy positions"
              description="How consistently this member has voted for or against each policy, from They Vote For You. Higher agreement = more consistently for."
            >
              <DataTable
                rows={data.positions}
                rowKey={(p: PolicyPositionRow) => p.policyId}
                empty="No policy positions."
                columns={[
                  { key: "policy", header: "Policy", cell: (p: PolicyPositionRow) => p.policyName },
                  {
                    key: "agreement",
                    header: "Agreement",
                    numeric: true,
                    cell: (p: PolicyPositionRow) => (p.agreement == null ? "—" : `${Math.round(p.agreement)}%`),
                  },
                  {
                    key: "category",
                    header: "Stance",
                    cell: (p: PolicyPositionRow) => (p.category ? (CATEGORY_LABEL[p.category] ?? p.category) : "—"),
                  },
                  { key: "voted", header: "Voted", cell: (p: PolicyPositionRow) => (p.voted ? "Yes" : "No") },
                ]}
              />
            </SectionCard>
          </div>
        ) : null}
      </StateRegion>
    </PageShell>
  );
}
