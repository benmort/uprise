"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowUpRight, Scale } from "lucide-react";
import { getPolicy, type House } from "@/lib/api/civic";
import { useApi } from "@/lib/use-api";
import { PageShell } from "@/components/shell/page-shell";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { StateRegion } from "@/components/shell/state-region";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard } from "@uprise/field";
import { DataTable } from "@uprise/field";
import { MemberAvatar } from "@/components/civic/member-avatar";

/** They Vote For You agreement buckets → plain language (mirrors the politician page). */
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

const HOUSE_LABEL: Record<House, string> = { REPS: "House of Reps", SENATE: "Senate" };

type Position = {
  politicianId: string;
  politicianName: string;
  party: string | null;
  house: House | null;
  electorate: string | null;
  imageUrl: string | null;
  imageCredit: string | null;
  agreement: number | null;
  voted: boolean;
  category: string | null;
};

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

export default function PolicyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, loading, error, noPermission, refetch } = useApi(
    `/civic/policies/${id}`,
    (signal) => getPolicy(id, { signal }),
    { ttlMs: 60_000 },
  );

  return (
    <PageShell
      icon={Scale}
      title={data?.name ?? "Policy"}
      actions={
        <Breadcrumbs
          items={[
            { label: "Data Sets", href: "/data/datasets" },
            { label: "Policies", href: "/data/policies" },
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
        emptyTitle="Policy not found"
        skeleton={<Skeleton className="h-96 w-full" />}
      >
        {data ? (
          <div className="section-stack">
            <SectionCard title="Overview">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Members tracked" value={data.positions.length.toLocaleString()} />
                <Stat label="Status" value={data.provisional ? "Provisional" : "Published"} />
                <Stat
                  label="Last edited"
                  value={data.lastEditedAt ? new Date(data.lastEditedAt).toLocaleDateString() : "—"}
                />
                <Stat
                  label="Source"
                  value={
                    <a
                      href={`https://theyvoteforyou.org.au/policies/${data.tvfyId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      They Vote For You
                      <ArrowUpRight className="h-4 w-4" />
                    </a>
                  }
                />
              </div>
              {data.description ? (
                <p className="mt-4 whitespace-pre-line text-sm text-muted-foreground">{data.description}</p>
              ) : null}
            </SectionCard>

            <SectionCard
              title="How members voted"
              description="Every tracked member's agreement with this policy, from They Vote For You. Click a member to open their record."
            >
              <DataTable
                rows={data.positions}
                rowKey={(p: Position) => p.politicianId}
                onRowClick={(p: Position) => router.push(`/data/politicians/${p.politicianId}`)}
                empty="No member positions."
                columns={[
                  {
                    key: "member",
                    header: "Member",
                    cell: (p: Position) => (
                      <div className="flex items-center gap-2.5">
                        <MemberAvatar name={p.politicianName} imageUrl={p.imageUrl} credit={p.imageCredit} size={32} />
                        <span className="inline-flex items-center gap-1 font-medium text-primary">
                          {p.politicianName}
                          <ArrowUpRight className="h-3.5 w-3.5 opacity-70" />
                        </span>
                      </div>
                    ),
                  },
                  { key: "party", header: "Party", cell: (p: Position) => p.party ?? "—" },
                  { key: "house", header: "Chamber", cell: (p: Position) => (p.house ? HOUSE_LABEL[p.house] : "—") },
                  { key: "electorate", header: "Electorate", cell: (p: Position) => p.electorate ?? "—" },
                  {
                    key: "agreement",
                    header: "Agreement",
                    numeric: true,
                    cell: (p: Position) => (p.agreement == null ? "—" : `${Math.round(p.agreement)}%`),
                  },
                  {
                    key: "category",
                    header: "Stance",
                    cell: (p: Position) => (p.category ? (CATEGORY_LABEL[p.category] ?? p.category) : "—"),
                  },
                  { key: "voted", header: "Voted", cell: (p: Position) => (p.voted ? "Yes" : "No") },
                ]}
              />
            </SectionCard>
          </div>
        ) : null}
      </StateRegion>
    </PageShell>
  );
}
