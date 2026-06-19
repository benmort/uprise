"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, DoorClosed, Scissors, Users } from "lucide-react";
import {
  createTurfFromDivision,
  getDivision,
  type DivisionDetail,
  type DivisionType,
} from "@/lib/api/geo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiTile } from "@/components/canvass/kpi-tile";
import { useToast } from "@/components/ui/toast";

const TurfMap = dynamic(() => import("@/components/canvass/turf-map").then((m) => m.TurfMap), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

export default function DivisionDetailPage() {
  const params = useParams<{ type: string; code: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const type = params.type as DivisionType;
  const [d, setD] = useState<DivisionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getDivision(type, params.code);
      if (!alive) return;
      if (!res.ok) setError(res.error);
      else setD(res.data);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [type, params.code]);

  async function cutTurf() {
    if (!d) return;
    setBusy(true);
    const res = await createTurfFromDivision({ type, code: d.code, name: d.name });
    setBusy(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't cut turf", description: res.error });
      return;
    }
    showToast({ tone: "success", title: `Turf cut from ${d.name}` });
    router.push("/canvass");
  }

  if (loading) return <div className="page-stack"><Skeleton className="h-64 w-full" /></div>;
  if (error || !d) {
    return <div className="page-stack"><EmptyState title="Can't load division" description={error || "Not found."} /></div>;
  }

  return (
    <div className="page-stack">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/canvass/divisions">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Divisions
          </Link>
        </Button>
        <h1 className="text-2xl font-extrabold">{d.name}</h1>
        <span className="text-sm text-muted-foreground tabular-nums">{d.code}{d.state ? ` · ${d.state}` : ""}</span>
        <Button className="ml-auto" disabled={busy} onClick={cutTurf}>
          <Scissors className="mr-1.5 h-4 w-4" />
          {busy ? "Cutting…" : "Cut turf from division"}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiTile label="Addresses" value={d.addressCount.toLocaleString()} icon={<DoorClosed className="h-4 w-4" />} />
        <KpiTile label="With a contact" value={d.contactCount.toLocaleString()} icon={<Users className="h-4 w-4" />} />
        <KpiTile label="Without contacts" value={d.withoutContacts.toLocaleString()} icon={<DoorClosed className="h-4 w-4" />} />
      </div>

      <div className="h-[55vh] overflow-hidden rounded-2xl border border-border">
        <TurfMap mode="edit" turfGeometry={d.geometry as GeoJSON.Geometry} />
      </div>
    </div>
  );
}
