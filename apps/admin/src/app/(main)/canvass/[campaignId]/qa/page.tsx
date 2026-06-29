"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, ShieldCheck } from "lucide-react";
import { getQaReview } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard } from "@uprise/field";

type Flag = { id: string; volunteer: string | null; reason: string; at: string };

export default function QaPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getQaReview(campaignId);
      if (!alive) return;
      if (res.ok) setFlags(res.data.flags);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [campaignId]);

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

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : flags.length === 0 ? (
        <SectionCard title="Review">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-success" />
            No suspicious knocks flagged.
          </p>
        </SectionCard>
      ) : (
        <SectionCard title={`Flagged knocks (${flags.length})`} description="Too-fast cadence or missing GPS — spot-check these.">
          <ul className="space-y-2">
            {flags.map((f, i) => (
              <li key={`${f.id}-${i}`} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0 text-warning-foreground" />
                <span className="flex-1 text-foreground">
                  {f.reason}
                  {f.volunteer ? ` · ${f.volunteer}` : ""}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {new Date(f.at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
