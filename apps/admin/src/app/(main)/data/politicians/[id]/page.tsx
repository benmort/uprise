"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { ArrowUpRight, Landmark } from "lucide-react";
import {
  getPolitician,
  attendancePct,
  chamberLabel,
  jurisdictionLabel,
  type PolicyPositionRow,
} from "@/lib/api/civic";
import { getDivision, type DivisionDetail, type DivisionType } from "@/lib/api/geo";
import { useApi } from "@/lib/use-api";
import { PageShell } from "@/components/shell/page-shell";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { StateRegion } from "@/components/shell/state-region";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard } from "@uprise/field";
import { DataTable } from "@uprise/field";
import { MemberAvatar } from "@/components/civic/member-avatar";

// mapbox-gl touches `window`, so the map is client-only (ssr:false) and lazy — it
// never lands in the initial bundle for the (many) politicians with no linkable geo.
const TurfMap = dynamic(() => import("@uprise/field").then((m) => m.TurfMap), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

/** They Vote For You agreement buckets → plain language (federal only). */
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

// geo layers that have a division-detail page to deep-link to.
const LINKABLE_GEO = new Set(["ced", "sed_lower", "sed_upper"]);

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
  const router = useRouter();
  const { data, loading, error, noPermission, refetch } = useApi(
    `/civic/politicians/${id}`,
    (signal) => getPolitician(id, { signal }),
    { ttlMs: 60_000 },
  );

  const isFederal = data?.jurisdiction === "FEDERAL";
  const attendance = data ? attendancePct(data) : null;
  const geoKind = data?.geoKind ?? null;
  const geoCode = data?.geoCode ?? null;
  const linkable = !!geoKind && !!geoCode && LINKABLE_GEO.has(geoKind);
  const electorateHref = linkable ? `/data/divisions/${geoKind}/${geoCode}` : null;

  // Boundary for the small electorate map. Only fetched for a linkable geo kind
  // (federal / state lower / upper); a null key skips the request entirely.
  const divisionKey = linkable ? `/geo/divisions/${geoKind}/${geoCode}` : null;
  const division = useApi<DivisionDetail>(
    divisionKey,
    () => getDivision(geoKind as DivisionType, geoCode as string),
    { ttlMs: 300_000 },
  );

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
              <div className="mb-4 flex items-center gap-3">
                <MemberAvatar name={data.name} imageUrl={data.imageUrl} credit={data.imageCredit} size={56} />
                <div className="min-w-0">
                  <div className="truncate text-lg font-semibold text-foreground">{data.name}</div>
                  {data.imageUrl && data.imageCredit ? (
                    <a
                      href={data.imageSourceUrl ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-muted-foreground hover:underline"
                    >
                      Photo: {data.imageCredit} · Wikimedia Commons
                    </a>
                  ) : null}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Party" value={data.party ?? "—"} />
                <Stat label="Jurisdiction" value={jurisdictionLabel(data.jurisdiction)} />
                <Stat label="Chamber" value={chamberLabel(data.jurisdiction, data.chamber)} />
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
                {isFederal ? (
                  <>
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
                  </>
                ) : null}
              </div>
            </SectionCard>

            {electorateHref ? (
              <SectionCard
                title="Electorate"
                description={`${data.electorate ?? "Division"} — click the map to open the division`}
              >
                <Link
                  href={electorateHref}
                  aria-label={`Open ${data.electorate ?? "division"} division page`}
                  className="group relative block h-56 overflow-hidden rounded-xl border border-border sm:h-64"
                >
                  {/* pointer-events-none keeps the map static (no pan/zoom) so the Link
                      underneath owns every click and routes through to the division. */}
                  <div className="pointer-events-none absolute inset-0">
                    {division.data?.geometry ? (
                      <TurfMap mode="edit" turfGeometry={division.data.geometry as GeoJSON.Geometry} />
                    ) : division.loading ? (
                      <Skeleton className="h-full w-full" />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-surface-variant text-sm text-muted-foreground">
                        Boundary unavailable
                      </div>
                    )}
                  </div>
                  <span className="absolute bottom-2 right-2 z-10 inline-flex items-center gap-1 rounded-lg bg-surface/95 px-2.5 py-1.5 text-xs font-semibold text-foreground shadow-card backdrop-blur transition group-hover:bg-surface-variant">
                    View division
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
              </SectionCard>
            ) : null}

            {isFederal ? (
              <SectionCard
                title="Policy positions"
                description="How consistently this member has voted for or against each policy, from They Vote For You. Higher agreement = more consistently for."
              >
                <DataTable
                  rows={data.positions}
                  rowKey={(p: PolicyPositionRow) => p.policyId}
                  onRowClick={(p: PolicyPositionRow) => router.push(`/data/policies/${p.policyId}`)}
                  empty="No policy positions."
                  columns={[
                    {
                      key: "policy",
                      header: "Policy",
                      cell: (p: PolicyPositionRow) => (
                        <span className="inline-flex items-center gap-1 font-medium text-primary">
                          {p.policyName}
                          <ArrowUpRight className="h-3.5 w-3.5 opacity-70" />
                        </span>
                      ),
                    },
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
            ) : (
              <SectionCard title="Voting record">
                <p className="text-sm text-muted-foreground">
                  Roster sourced from Wikidata. State and territory parliaments have no published,
                  structured voting record (unlike the federal parliament via They Vote For You), so
                  there are no policy positions to show.
                </p>
              </SectionCard>
            )}
          </div>
        ) : null}
      </StateRegion>
    </PageShell>
  );
}
