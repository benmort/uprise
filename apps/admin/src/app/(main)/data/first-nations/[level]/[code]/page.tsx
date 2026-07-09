"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, DoorClosed, Users } from "lucide-react";
import { getFirstNations, type FirstNationsLevel } from "@/lib/api/geo";
import { useApi } from "@/lib/use-api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StateRegion } from "@/components/shell/state-region";
import { KpiTile } from "@uprise/field";
import { RegionHierarchy } from "@/components/canvass/region-hierarchy";

const TurfMap = dynamic(() => import("@uprise/field").then((m) => m.TurfMap), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

const LEVEL_LABEL: Record<FirstNationsLevel, string> = {
  ireg: "Indigenous region",
  iare: "Indigenous area",
  iloc: "Indigenous location",
};

/**
 * One Indigenous Region / Area / Location.
 *
 * This is the divisions detail page MINUS the turf-cut CTA and the universe selector. The
 * omission is the point: these are ABS statistical geographies, offered as reference
 * context, and an organiser must not select doors by the Indigenous composition of an
 * area. The API refuses it independently — `table()` rejects these levels — so the missing
 * button is a reflection of the contract, not the contract itself.
 */
export default function FirstNationsDetailPage() {
  const params = useParams<{ level: string; code: string }>();
  const level = params.level as FirstNationsLevel;
  const { data: d, loading, error, noPermission, refetch } = useApi(
    `/geo/first-nations/${level}/${params.code}`,
    () => getFirstNations(level, params.code),
    { ttlMs: 30_000 },
  );

  return (
    <div className="page-stack">
      <StateRegion
        loading={loading}
        error={error}
        noPermission={noPermission}
        onRetry={() => void refetch()}
        errorTitle="Can't load this boundary"
        skeleton={<Skeleton className="h-64 w-full" />}
      >
        {d && (
          <div className="page-stack">
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="ghost" size="sm">
                <Link href="/data/first-nations">
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  First Nations
                </Link>
              </Button>
              <h1 className="text-2xl font-extrabold">{d.name}</h1>
              <span className="text-sm text-muted-foreground tabular-nums">
                {d.code}
                {d.state ? ` · ${d.state}` : ""}
              </span>
              <span className="rounded-full bg-surface-variant px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                {LEVEL_LABEL[level] ?? level}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <KpiTile label="Addresses" value={d.addressCount.toLocaleString()} icon={<DoorClosed className="h-4 w-4" />} />
              <KpiTile label="With a contact" value={d.contactCount.toLocaleString()} icon={<Users className="h-4 w-4" />} />
              <KpiTile label="Without contacts" value={d.withoutContacts.toLocaleString()} icon={<DoorClosed className="h-4 w-4" />} />
            </div>

            <div className="h-[55vh] overflow-hidden rounded-2xl border border-border">
              <TurfMap mode="edit" turfGeometry={d.geometry as GeoJSON.Geometry} />
            </div>

            <p className="text-xs text-muted-foreground">
              ABS ASGS Indigenous Structure – a statistical geography, not a cultural, language or nation
              boundary, and not usable for land claims.
            </p>

            <RegionHierarchy kind={level} code={d.code} />
          </div>
        )}
      </StateRegion>
    </div>
  );
}
