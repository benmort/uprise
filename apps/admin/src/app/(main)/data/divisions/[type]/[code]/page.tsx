"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, DoorClosed, Scissors, Users } from "lucide-react";
import { Spinner } from "@uprise/ui";
import {
  createTurfFromDivision,
  getDivision,
  type DivisionType,
  type TurfUniverse,
} from "@/lib/api/geo";
import { loadTurfUniverse } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StateRegion } from "@/components/shell/state-region";
import { KpiTile } from "@uprise/field";
import { RegionHierarchy } from "@/components/canvass/region-hierarchy";
import { useToast } from "@/components/ui/toast";

const TurfMap = dynamic(() => import("@uprise/field").then((m) => m.TurfMap), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

export default function DivisionDetailPage() {
  const params = useParams<{ type: string; code: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const type = params.type as DivisionType;
  const { data: d, loading, error, noPermission, refetch } = useApi(
    `/geo/divisions/${type}/${params.code}`,
    () => getDivision(type, params.code),
    { ttlMs: 30_000 },
  );
  const [busy, setBusy] = useState(false);
  const [universe, setUniverse] = useState<TurfUniverse>("hybrid");

  async function cutTurf() {
    if (!d) return;
    setBusy(true);
    const res = await createTurfFromDivision({ type, code: d.code, name: d.name });
    if (!res.ok) {
      setBusy(false);
      showToast({ tone: "error", title: "Couldn't cut turf", description: res.error });
      return;
    }
    const cold = universe === "existing" ? null : await loadTurfUniverse(res.data.id, universe);
    setBusy(false);
    const coldCount = cold?.ok ? cold.data.materialised : 0;
    showToast({
      tone: "success",
      title: `Turf cut from ${d.name}`,
      description: coldCount > 0 ? `${coldCount.toLocaleString()} cold doors loaded.` : undefined,
    });
    router.push("/canvass");
  }

  return (
    <div className="page-stack">
      <StateRegion
        loading={loading}
        error={error}
        noPermission={noPermission}
        onRetry={() => void refetch()}
        errorTitle="Can't load division"
        skeleton={<Skeleton className="h-64 w-full" />}
      >
        {d && (
          <div className="page-stack">
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="ghost" size="sm">
                <Link href="/data/divisions">
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  Divisions
                </Link>
              </Button>
              <h1 className="text-2xl font-extrabold">{d.name}</h1>
              <span className="text-sm text-muted-foreground tabular-nums">{d.code}{d.state ? ` · ${d.state}` : ""}</span>
              <div className="ml-auto flex items-center gap-2">
                <select
                  value={universe}
                  onChange={(e) => setUniverse(e.target.value as TurfUniverse)}
                  className="h-9 rounded-lg border border-border bg-surface px-2 text-sm font-semibold text-foreground"
                  title="Which addresses land in the turf when you cut it"
                >
                  <option value="hybrid">Existing + cold doors</option>
                  <option value="none">Cold doors only</option>
                  <option value="existing">Existing contacts only</option>
                </select>
                <Button disabled={busy} onClick={cutTurf}>
                  <Scissors className="mr-1.5 h-4 w-4" />
                  {busy ? (<><Spinner className="mr-2" />Cutting…</>) : "Cut turf from division"}
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <KpiTile label="Addresses" value={d.addressCount.toLocaleString()} icon={<DoorClosed className="h-4 w-4" />} />
              <KpiTile label="With a contact" value={d.contactCount.toLocaleString()} icon={<Users className="h-4 w-4" />} />
              <KpiTile label="Without contacts" value={d.withoutContacts.toLocaleString()} icon={<DoorClosed className="h-4 w-4" />} />
            </div>

            <div className="h-[55vh] overflow-hidden rounded-2xl border border-border">
              <TurfMap mode="edit" turfGeometry={d.geometry as GeoJSON.Geometry} />
            </div>

            <RegionHierarchy kind={type} code={d.code} />
          </div>
        )}
      </StateRegion>
    </div>
  );
}
