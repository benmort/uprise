"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, MapPin, User, Vote } from "lucide-react";
import { useApi } from "@/lib/use-api";
import { getAddressDetail } from "@/lib/api/geo";
import { getRegionProfile, type AbsLevel } from "@/lib/api/demographics";
import { formatIndicator } from "@/lib/canvass/demographics-fill";
import { PageShell } from "@/components/shell/page-shell";
import { StateRegion } from "@/components/shell/state-region";
import { RegionHierarchy } from "@/components/canvass/region-hierarchy";
import { SectionCard } from "@uprise/field";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** A single G-NAF address: full detail, the linked contact, its containing regions,
 *  the SA's demographics and the nearest polling place. The click-through target of
 *  the address info popover. */
export default function AddressDetailPage() {
  const gnafPid = String(useParams().gnafPid ?? "");
  const { data, loading, error, noPermission, refetch } = useApi(
    `/geo/addresses/${gnafPid}`,
    () => getAddressDetail(gnafPid),
    { ttlMs: 300_000 },
  );

  // Demographics for the address's SA (SA1, falling back to SA2). Empty until the ABS
  // loader has run in this environment — the card shows a no-data state either way.
  const demoLevel: AbsLevel = data?.sa1Code ? "sa1" : "sa2";
  const demoCode = data?.sa1Code ?? data?.sa2Code ?? "";
  const demo = useApi(
    data && demoCode ? `/demographics/regions/${demoLevel}/${demoCode}` : null,
    () => getRegionProfile(demoLevel, demoCode),
    { ttlMs: 300_000 },
  );
  const demoValues = (demo.data?.values ?? []).filter((v) => v.value != null);
  const poll = data?.nearestPolling ?? null;

  return (
    <PageShell
      icon={MapPin}
      title={data?.address || "Address"}
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link href="/data/addresses">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Addresses
          </Link>
        </Button>
      }
    >
      <StateRegion
        loading={loading}
        error={error}
        noPermission={noPermission}
        onRetry={() => void refetch()}
        empty={!loading && !data}
        emptyTitle="Address not found"
        skeleton={<Skeleton className="h-96 w-full" />}
      >
        {data ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Address">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-muted-foreground">Full address</dt>
                <dd className="font-medium text-foreground">{data.address}</dd>
                {data.street ? (
                  <>
                    <dt className="text-muted-foreground">Street</dt>
                    <dd>{data.street}</dd>
                  </>
                ) : null}
                {data.locality ? (
                  <>
                    <dt className="text-muted-foreground">Locality</dt>
                    <dd>{data.locality}</dd>
                  </>
                ) : null}
                {data.postcode ? (
                  <>
                    <dt className="text-muted-foreground">Postcode</dt>
                    <dd className="tabular-nums">{data.postcode}</dd>
                  </>
                ) : null}
                {data.state ? (
                  <>
                    <dt className="text-muted-foreground">State</dt>
                    <dd>{data.state}</dd>
                  </>
                ) : null}
                {data.lat != null && data.lng != null ? (
                  <>
                    <dt className="text-muted-foreground">Coordinates</dt>
                    <dd className="tabular-nums">
                      {data.lat.toFixed(5)}, {data.lng.toFixed(5)}
                    </dd>
                  </>
                ) : null}
                <dt className="text-muted-foreground">G-NAF PID</dt>
                <dd className="font-mono text-xs">{data.gnafPid}</dd>
              </dl>
            </SectionCard>

            <SectionCard title="Contact">
              {data.contactId ? (
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-container text-primary">
                    <User className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-muted-foreground">A contact lives at this address.</p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/contacts/${encodeURIComponent(data.contactId)}`}>View profile</Link>
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No contact is linked to this address yet.</p>
              )}
            </SectionCard>

            <div className="lg:col-span-2">
              <RegionHierarchy kind="address" code={gnafPid} />
            </div>

            <SectionCard title="Demographics" description="ABS Census + SEIFA for this address's Statistical Area.">
              {demo.loading ? (
                <Skeleton className="h-24 w-full" />
              ) : demoValues.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No demographic indicators loaded for this area yet.
                </p>
              ) : (
                <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
                  {demoValues.map((v) => (
                    <div key={v.key} className="contents">
                      <dt className="text-muted-foreground">{v.name}</dt>
                      <dd className="tabular-nums font-medium text-foreground">
                        {formatIndicator(v.value as number, v.unit)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </SectionCard>

            <SectionCard title="Nearest polling place">
              {poll ? (
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-variant text-muted-foreground">
                    <Vote className="h-4.5 w-4.5" />
                  </span>
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-foreground">{poll.name || poll.premises || "Polling place"}</p>
                    {poll.address ? <p className="text-muted-foreground">{poll.address}</p> : null}
                    <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                      {(poll.distanceM / 1000).toFixed(1)} km away
                      {poll.divisionName ? ` · ${poll.divisionName}` : ""}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No polling place data available.</p>
              )}
            </SectionCard>
          </div>
        ) : null}
      </StateRegion>
    </PageShell>
  );
}
