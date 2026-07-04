"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, DoorClosed, Scissors, Users } from "lucide-react";
import { Spinner } from "@uprise/ui";
import {
  createTurfFromAreas,
  getAreaDetail,
  type AreaDetail,
  type AreaLevel,
  type TurfUniverse,
} from "@/lib/api/geo";
import { loadTurfUniverse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiTile } from "@uprise/field";
import { RegionHierarchy } from "@/components/canvass/region-hierarchy";
import { useToast } from "@/components/ui/toast";

const TurfMap = dynamic(() => import("@uprise/field").then((m) => m.TurfMap), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

const LEVEL_LABEL: Record<AreaLevel, string> = { mb: "Meshblock", sa1: "SA1", sa2: "SA2", sa3: "SA3", sa4: "SA4" };

export default function AreaDetailPage() {
  const params = useParams<{ layer: string; code: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const layer = params.layer as AreaLevel;
  const [d, setD] = useState<AreaDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [universe, setUniverse] = useState<TurfUniverse>("hybrid");

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getAreaDetail(layer, params.code);
      if (!alive) return;
      if (!res.ok) setError(res.error);
      else setD(res.data);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [layer, params.code]);

  async function cutTurf() {
    if (!d) return;
    setBusy(true);
    const res = await createTurfFromAreas({ name: d.name, areas: [{ layer, code: d.code }] });
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

  if (loading) return <div className="page-stack"><Skeleton className="h-64 w-full" /></div>;
  if (error || !d) {
    return <div className="page-stack"><EmptyState title="Can't load area" description={error || "Not found."} /></div>;
  }

  return (
    <div className="page-stack">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/data/areas">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Areas
          </Link>
        </Button>
        <h1 className="text-2xl font-extrabold">{d.name}</h1>
        <span className="text-sm text-muted-foreground tabular-nums">{LEVEL_LABEL[layer]} · {d.code}</span>
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
            {busy ? (<><Spinner className="mr-2" />Cutting…</>) : "Cut turf from area"}
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

      <RegionHierarchy kind={layer} code={d.code} />
    </div>
  );
}
