"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { getDashboardPerformance, getRecentBlasts } from "@/lib/api";

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [performance, setPerformance] = useState({
    totalSent: 0,
    totalResponded: 0,
    responseRate: 0,
    activeDrafts: 0,
  });
  const [blasts, setBlasts] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      const [perfRes, blastsRes] = await Promise.all([
        getDashboardPerformance(),
        getRecentBlasts(),
      ]);
      if (!alive) return;
      if (perfRes.ok) setPerformance(perfRes.data);
      if (blastsRes.ok) setBlasts(blastsRes.data);
      setLoading(false);
    };
    run();
    const timer = setInterval(run, 8000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const filteredBlasts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return blasts;
    return blasts.filter((blast) => String(blast.title || "").toLowerCase().includes(q));
  }, [search, blasts]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Performance Pulse</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading metrics...</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-3">
                <Metric label="Total Sent" value={performance.totalSent.toLocaleString()} />
                <Metric label="Response Rate" value={`${performance.responseRate}%`} sub="steady benchmark" />
                <Metric label="Active Drafts" value={String(performance.activeDrafts)} sub="ready for review" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Recent Blasts</CardTitle>
          <div className="flex w-full max-w-md gap-2">
            <Input
              placeholder="Search campaigns..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button variant="outline">Filters</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-label uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="py-2 pr-4">Blast Name</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Created</th>
                  <th className="py-2 pr-4">Recipients</th>
                  <th className="py-2 pr-4">Audience</th>
                </tr>
              </thead>
              <tbody>
                {filteredBlasts.map((blast) => (
                  <tr
                    key={String(blast.id)}
                    className="cursor-pointer border-b border-border/60 hover:bg-primary-container/10"
                    onClick={() => router.push(`/composer?blastId=${encodeURIComponent(String(blast.id))}`)}
                  >
                    <td className="py-3 pr-4">
                      <p className="font-medium">{String(blast.title || "Untitled Blast")}</p>
                      <p className="text-xs text-muted-foreground">ID: {String(blast.id)}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={String(blast.status || "DRAFTED")} />
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {formatDate(blast.createdAt)}
                    </td>
                    <td className="py-3 pr-4">{Number((blast as any)._count?.recipients || 0).toLocaleString()}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{String(blast.audienceId || "—")}</td>
                  </tr>
                ))}
                {filteredBlasts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-muted-foreground">
                      No blasts yet. Create your first campaign in Composer.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs font-label uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-headline font-semibold">{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function formatDate(value: unknown) {
  if (!value) return "—";
  try {
    return new Date(String(value)).toLocaleString();
  } catch {
    return String(value);
  }
}
